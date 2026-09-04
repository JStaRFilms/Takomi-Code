import {
  EventId,
  MessageId,
  OrchestrationGetSnapshotError,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import { describe, expect } from "vite-plus/test";

import {
  coalesceLiveToolUpdatedEvents,
  makeThreadLiveEventCoalescer,
} from "./ThreadLiveEventCoalescer.ts";

const threadId = ThreadId.make("thread-coalescer-test");
const turnId = TurnId.make("turn-coalescer-test");

function makeToolActivity(
  sequence: number,
  options: {
    readonly kind?: "tool.updated" | "tool.completed";
    readonly toolCallId?: string;
    readonly turnId?: TurnId;
  } = {},
): OrchestrationEvent {
  const {
    kind = "tool.updated",
    toolCallId = "call-edit",
    turnId: activityTurnId = turnId,
  } = options;
  const activity: OrchestrationThreadActivity = {
    id: EventId.make(`activity-${sequence}`),
    tone: "tool",
    kind,
    summary: "Editing app.ts",
    payload: {
      itemType: "file_change",
      title: "Editing app.ts",
      data: toolCallId ? { toolCallId } : {},
    },
    turnId: activityTurnId,
    createdAt: "2026-01-01T00:00:01.000Z",
  };
  return {
    sequence,
    eventId: EventId.make(`event-${sequence}`),
    aggregateKind: "thread",
    aggregateId: threadId,
    occurredAt: "2026-01-01T00:00:01.000Z",
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    type: "thread.activity-appended",
    payload: { threadId, activity },
  };
}

function makeMessage(sequence: number): OrchestrationEvent {
  return {
    sequence,
    eventId: EventId.make(`event-${sequence}`),
    aggregateKind: "thread",
    aggregateId: threadId,
    occurredAt: "2026-01-01T00:00:02.000Z",
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    type: "thread.message-sent",
    payload: {
      threadId,
      messageId: MessageId.make(`message-${sequence}`),
      role: "assistant",
      text: "Still working",
      turnId,
      streaming: false,
      createdAt: "2026-01-01T00:00:02.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
    },
  };
}

describe("ThreadLiveEventCoalescer", () => {
  it("coalesces only calls with a stable toolCallId", () => {
    const events = [
      makeToolActivity(1, { toolCallId: "call-a" }),
      makeToolActivity(2, { toolCallId: "call-b" }),
      makeToolActivity(3, { toolCallId: "call-a" }),
    ];

    expect(coalesceLiveToolUpdatedEvents(events).map((event) => event.sequence)).toEqual([2, 3]);
  });

  it("preserves parallel same-label calls without a stable toolCallId", () => {
    const events = [
      makeToolActivity(1, { toolCallId: "" }),
      makeToolActivity(2, { toolCallId: "" }),
      makeToolActivity(3, { kind: "tool.completed", toolCallId: "" }),
    ];

    expect(coalesceLiveToolUpdatedEvents(events).map((event) => event.sequence)).toEqual([1, 2, 3]);
  });

  it("does not coalesce stable tool calls across turns", () => {
    const events = [
      makeToolActivity(1, { turnId: TurnId.make("turn-old") }),
      makeToolActivity(2, { turnId: TurnId.make("turn-new") }),
    ];

    expect(coalesceLiveToolUpdatedEvents(events).map((event) => event.sequence)).toEqual([1, 2]);
  });

  it("flushes a stable update run before a completion boundary", () => {
    const events = [
      makeToolActivity(1),
      makeToolActivity(2),
      makeToolActivity(3, { kind: "tool.completed" }),
      makeToolActivity(4),
    ];

    expect(coalesceLiveToolUpdatedEvents(events).map((event) => event.sequence)).toEqual([2, 3, 4]);
  });

  it.effect("flushes pending tool updates as soon as an unrelated event arrives", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const coalescer = yield* makeThreadLiveEventCoalescer({ coalesceWindow: "500 millis" });
        const startedAt = yield* Clock.currentTimeMillis;
        yield* Effect.forEach(
          Array.from({ length: 10 }, (_, index) => index + 2),
          (sequence) =>
            coalescer.offerAndWait({ kind: "event", event: makeToolActivity(sequence) }),
          { discard: true },
        );
        yield* coalescer.offerAndWait({ kind: "event", event: makeMessage(12) });

        expect(yield* Clock.currentTimeMillis).toBe(startedAt);
        expect(
          Array.from(yield* coalescer.takeAll).map((item) =>
            item.kind === "event" ? item.event.sequence : item.kind,
          ),
        ).toEqual([11, 12]);
      }),
    ).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("flushes pending tool updates as soon as a synchronization marker arrives", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const coalescer = yield* makeThreadLiveEventCoalescer({ coalesceWindow: "500 millis" });
        const startedAt = yield* Clock.currentTimeMillis;
        yield* coalescer.offerAndWait({ kind: "event", event: makeToolActivity(2) });
        yield* coalescer.offerAndWait({ kind: "event", event: makeToolActivity(3) });
        yield* coalescer.offerAndWait({ kind: "synchronized" });

        expect(yield* Clock.currentTimeMillis).toBe(startedAt);
        expect(
          Array.from(yield* coalescer.takeAll).map((item) =>
            item.kind === "event" ? item.event.sequence : item.kind,
          ),
        ).toEqual([3, "synchronized"]);
      }),
    ).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("replaces an overflowed subscriber tail instead of silently dropping it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const snapshots = yield* Effect.sync(() => ({ count: 0 }));
        const coalescer = yield* makeThreadLiveEventCoalescer({
          overflowSnapshot: Effect.sync(() => {
            snapshots.count += 1;
            return { kind: "event" as const, event: makeMessage(9_999) };
          }),
        });
        for (let sequence = 1; sequence <= 257; sequence += 1) {
          yield* coalescer.offerAndWait({ kind: "event", event: makeMessage(sequence) });
        }

        const items = Array.from(yield* coalescer.takeAll);
        expect(snapshots.count).toBe(1);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ kind: "event", event: { sequence: 9_999 } });
      }),
    ),
  );

  it.effect(
    "emits snapshot then exactly one marker when synchronization overflows full output",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const replacement = { kind: "event" as const, event: makeMessage(9_999) };
          const coalescer = yield* makeThreadLiveEventCoalescer({
            overflowSnapshot: Effect.succeed(replacement),
          });
          for (let sequence = 1; sequence <= 256; sequence += 1) {
            yield* coalescer.offerAndWait({ kind: "event", event: makeMessage(sequence) });
          }
          yield* coalescer.offerAndWait({ kind: "synchronized" });

          expect(Array.from(yield* coalescer.takeAll)).toEqual([
            replacement,
            { kind: "synchronized" },
          ]);
        }),
      ),
  );

  it.effect("bounds ingress while output snapshot recovery is stalled", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const snapshotStarted = yield* Deferred.make<void>();
        const releaseSnapshot = yield* Deferred.make<void>();
        const snapshotCount = yield* Ref.make(0);
        const coalescer = yield* makeThreadLiveEventCoalescer({
          overflowSnapshot: Deferred.succeed(snapshotStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releaseSnapshot)),
            Effect.andThen(Ref.update(snapshotCount, (count) => count + 1)),
            Effect.as({ kind: "event" as const, event: makeMessage(9_999) }),
          ),
        });
        for (let sequence = 1; sequence <= 256; sequence += 1) {
          yield* coalescer.offerAndWait({ kind: "event", event: makeMessage(sequence) });
        }
        const outputOverflow = yield* coalescer
          .offerAndWait({ kind: "event", event: makeMessage(257) })
          .pipe(Effect.forkChild);
        yield* Deferred.await(snapshotStarted);
        for (let sequence = 258; sequence < 770; sequence += 1) {
          yield* coalescer.offer({ kind: "event", event: makeMessage(sequence) });
        }
        const ingressOverflow = yield* coalescer
          .offer({ kind: "event", event: makeMessage(770) })
          .pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.succeed(releaseSnapshot, undefined);
        yield* Fiber.join(outputOverflow);
        yield* Fiber.join(ingressOverflow);

        expect(yield* Ref.get(snapshotCount)).toBe(2);
        expect(Array.from(yield* coalescer.takeAll)).toEqual([
          { kind: "event", event: makeMessage(9_999) },
        ]);
      }),
    ),
  );

  it.effect("terminates with a typed failure when overflow recovery cannot load a snapshot", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const expected = new OrchestrationGetSnapshotError({
          message: "thread deleted during recovery",
          cause: threadId,
        });
        const coalescer = yield* makeThreadLiveEventCoalescer({
          overflowSnapshot: Effect.fail(expected),
        });
        for (let sequence = 1; sequence <= 257; sequence += 1) {
          yield* coalescer.offerAndWait({ kind: "event", event: makeMessage(sequence) });
        }
        // Once terminal recovery fails, later synchronization markers settle
        // immediately instead of waiting on a detached input worker.
        yield* coalescer.offerAndWait({ kind: "synchronized" });
        expect(yield* Effect.flip(coalescer.takeAll)).toBe(expected);
      }),
    ),
  );

  it.effect("fails once when the authoritative overflow snapshot exceeds the byte budget", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const huge = makeMessage(9_999);
        if (huge.type !== "thread.message-sent") return;
        const oversized = {
          ...huge,
          payload: { ...huge.payload, text: "x".repeat(2 * 1024 * 1024) },
        } satisfies OrchestrationEvent;
        const coalescer = yield* makeThreadLiveEventCoalescer({
          overflowSnapshot: Effect.succeed({ kind: "event", event: oversized }),
        });
        for (let sequence = 1; sequence <= 257; sequence += 1) {
          yield* coalescer.offerAndWait({ kind: "event", event: makeMessage(sequence) });
        }
        const error = yield* Effect.flip(coalescer.takeAll);
        expect(error).toBeInstanceOf(OrchestrationGetSnapshotError);
        expect(error.message).toContain("exceeds the live transport budget");
      }),
    ),
  );
});
