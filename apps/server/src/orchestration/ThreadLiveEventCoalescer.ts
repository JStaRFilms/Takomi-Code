import {
  OrchestrationGetSnapshotError,
  type OrchestrationEvent,
  type OrchestrationThreadStreamItem,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Predicate from "effect/Predicate";
import * as Queue from "effect/Queue";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import { boundedJsonBytes } from "../utils/boundedJsonBytes.ts";
import { projectActivityEvent } from "./ActivityPayloadProjection.ts";

const COALESCE_WINDOW = Duration.millis(50);
const MAX_PENDING_UPDATES = 512;
const MAX_INGRESS_ITEMS = 512;
const MAX_OUTPUT_ITEMS = 256;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

function serializedBytes(value: unknown): number {
  return boundedJsonBytes(value, MAX_OUTPUT_BYTES);
}

export type ThreadLiveInput =
  | { readonly kind: "event"; readonly event: OrchestrationEvent }
  | { readonly kind: "synchronized" };

function isToolUpdated(event: OrchestrationEvent): boolean {
  return (
    event.type === "thread.activity-appended" && event.payload.activity.kind === "tool.updated"
  );
}

function asTrimmedString(value: unknown): string | null {
  if (!Predicate.isString(value)) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stableToolCallIdentity(event: OrchestrationEvent): string | null {
  if (event.type !== "thread.activity-appended") {
    return null;
  }
  const payload = event.payload.activity.payload;
  if (!Predicate.isObject(payload)) {
    return null;
  }
  const data = Predicate.isObject(payload.data) ? payload.data : null;
  return asTrimmedString(payload.toolCallId) ?? asTrimmedString(data?.toolCallId);
}

/**
 * Retain only the latest in-flight update for each stable tool-call id in a
 * live run. Anonymous calls pass through because labels are not unique when
 * tools execute in parallel. Survivors remain in sequence order.
 */
export function coalesceLiveToolUpdatedEvents(
  events: ReadonlyArray<OrchestrationEvent>,
): ReadonlyArray<OrchestrationEvent> {
  const survivors: Array<OrchestrationEvent> = [];
  let pendingUpdates: Array<OrchestrationEvent> = [];

  const flushUpdates = () => {
    const seen = new Set<string>();
    const latestUpdates: Array<OrchestrationEvent> = [];
    for (let index = pendingUpdates.length - 1; index >= 0; index -= 1) {
      const event = pendingUpdates[index]!;
      const identity = stableToolCallIdentity(event);
      const activity =
        event.type === "thread.activity-appended" ? event.payload.activity : undefined;
      const key = identity ? `${activity?.turnId ?? ""}\u0000${identity}` : null;
      if (key && seen.has(key)) {
        continue;
      }
      if (key) {
        seen.add(key);
      }
      latestUpdates.push(event);
    }
    latestUpdates.reverse();
    survivors.push(...latestUpdates);
    pendingUpdates = [];
  };

  for (const event of events) {
    if (isToolUpdated(event)) {
      pendingUpdates.push(event);
      continue;
    }
    flushUpdates();
    survivors.push(event);
  }
  flushUpdates();
  return survivors;
}

export const makeThreadLiveEventCoalescer = Effect.fn("makeThreadLiveEventCoalescer")(
  function* (options?: {
    readonly coalesceWindow?: Duration.Input;
    readonly overflowSnapshot?: Effect.Effect<
      OrchestrationThreadStreamItem,
      OrchestrationGetSnapshotError
    >;
  }) {
    const output = yield* Queue.dropping<
      {
        readonly item: OrchestrationThreadStreamItem;
        readonly bytes: number;
      },
      OrchestrationGetSnapshotError
    >(MAX_OUTPUT_ITEMS);
    let queuedBytes = 0;
    let overflowed = false;
    let terminated = false;
    const input = yield* Queue.dropping<{
      readonly value: ThreadLiveInput;
      readonly processed?: Deferred.Deferred<void>;
    }>(MAX_INGRESS_ITEMS);
    const mutex = yield* Semaphore.make(1);
    const coalesceWindow = options?.coalesceWindow ?? COALESCE_WINDOW;
    let pendingUpdates: Array<OrchestrationEvent> = [];
    let windowGeneration = 0;
    let windowFiber: Fiber.Fiber<void, never> | null = null;

    const terminate = Effect.fn("ThreadLiveEventCoalescer.terminate")(function* (
      error: OrchestrationGetSnapshotError,
    ) {
      terminated = true;
      const pending = (yield* Queue.size(input)) > 0 ? yield* Queue.takeAll(input) : ([] as const);
      yield* Effect.forEach(
        pending,
        (entry) =>
          entry.processed === undefined
            ? Effect.void
            : Deferred.succeed(entry.processed, undefined).pipe(Effect.asVoid),
        { discard: true },
      );
      yield* Queue.shutdown(input);
      yield* Queue.fail(output, error);
    });

    const forceSnapshot = Effect.fn("ThreadLiveEventCoalescer.forceSnapshot")(function* (
      reason: "ingress-count" | "output-count-or-bytes",
      attemptedBytes: number,
      completion?: OrchestrationThreadStreamItem,
    ) {
      if (overflowed) return;
      overflowed = true;
      const queueItems = yield* Queue.size(output);
      const queueBytesHighWater = queuedBytes;
      if (queueItems > 0) yield* Queue.takeAll(output);
      queuedBytes = 0;
      yield* Effect.logWarning("thread durable subscription overflow; forcing snapshot", {
        reason,
        ingressItemLimit: MAX_INGRESS_ITEMS,
        queueItemLimit: MAX_OUTPUT_ITEMS,
        queueByteLimit: MAX_OUTPUT_BYTES,
        queueItems,
        queueBytesHighWater,
        attemptedBytes,
      });
      if (options?.overflowSnapshot === undefined) return;
      const startedAt = yield* Clock.currentTimeMillis;
      yield* options.overflowSnapshot.pipe(
        Effect.matchEffect({
          onFailure: terminate,
          onSuccess: (snapshot) => {
            const snapshotBytes = serializedBytes(snapshot);
            const completionBytes = completion === undefined ? 0 : serializedBytes(completion);
            if (snapshotBytes + completionBytes > MAX_OUTPUT_BYTES) {
              return terminate(
                new OrchestrationGetSnapshotError({
                  message: "Authoritative thread snapshot exceeds the live transport budget",
                  cause: {
                    snapshotBytes,
                    completionBytes,
                    byteLimit: MAX_OUTPUT_BYTES,
                  },
                }),
              );
            }
            queuedBytes = snapshotBytes + completionBytes;
            overflowed = false;
            return Clock.currentTimeMillis.pipe(
              Effect.tap((finishedAt) =>
                Effect.logDebug("thread subscription converged by snapshot", {
                  reason,
                  convergenceMs: finishedAt - startedAt,
                }),
              ),
              Effect.andThen(Queue.offer(output, { item: snapshot, bytes: snapshotBytes })),
              Effect.andThen(
                completion === undefined
                  ? Effect.void
                  : Queue.offer(output, { item: completion, bytes: completionBytes }).pipe(
                      Effect.asVoid,
                    ),
              ),
            );
          },
        }),
      );
    });

    const enqueueOutput = Effect.fn("ThreadLiveEventCoalescer.enqueueOutput")(function* (
      item: OrchestrationThreadStreamItem,
    ) {
      if (overflowed) return;
      const bytes = serializedBytes(item);
      if (queuedBytes + bytes <= MAX_OUTPUT_BYTES) {
        queuedBytes += bytes;
        if (yield* Queue.offer(output, { item, bytes })) return;
        queuedBytes = Math.max(0, queuedBytes - bytes);
      }
      yield* forceSnapshot(
        "output-count-or-bytes",
        bytes,
        item.kind === "synchronized" ? item : undefined,
      );
    });

    const cancelWindow = Effect.fn("ThreadLiveEventCoalescer.cancelWindow")(function* () {
      const fiber = windowFiber;
      if (!fiber) {
        return;
      }
      windowFiber = null;
      yield* Fiber.interrupt(fiber);
    });

    const flushPending = Effect.fn("ThreadLiveEventCoalescer.flushPending")(function* (
      boundary?: OrchestrationEvent,
    ) {
      const events = boundary ? [...pendingUpdates, boundary] : pendingUpdates;
      pendingUpdates = [];
      if (events.length === 0) {
        return;
      }
      yield* Effect.forEach(
        coalesceLiveToolUpdatedEvents(events),
        (event) => enqueueOutput({ kind: "event", event: projectActivityEvent(event) }),
        { discard: true },
      );
    });

    const flushWindow = (generation: number) =>
      Effect.sleep(coalesceWindow).pipe(
        Effect.andThen(
          mutex.withPermits(1)(
            Effect.suspend(() => (generation === windowGeneration ? flushPending() : Effect.void)),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (generation === windowGeneration) {
              windowFiber = null;
            }
          }),
        ),
      );

    const process = Effect.fn("ThreadLiveEventCoalescer.process")(function* (
      input: ThreadLiveInput,
    ) {
      yield* mutex.withPermits(1)(
        Effect.gen(function* () {
          if (input.kind === "event" && isToolUpdated(input.event)) {
            pendingUpdates.push(input.event);
            if (pendingUpdates.length === 1) {
              const generation = ++windowGeneration;
              windowFiber = yield* Effect.forkScoped(Effect.ignore(flushWindow(generation)));
            }
            if (pendingUpdates.length >= MAX_PENDING_UPDATES) {
              yield* cancelWindow();
              windowGeneration += 1;
              yield* flushPending();
            }
            return;
          }

          yield* cancelWindow();
          windowGeneration += 1;
          // A non-update event closes the run immediately. The coalescer keeps
          // that boundary after the final update from the run.
          if (input.kind === "event") {
            yield* flushPending(input.event);
          } else {
            yield* flushPending();
            yield* enqueueOutput({ kind: "synchronized" });
          }
        }),
      );
    });

    yield* Stream.fromQueue(input).pipe(
      Stream.runForEach(({ value, processed }) =>
        process(value).pipe(
          Effect.andThen(processed ? Deferred.succeed(processed, undefined) : Effect.void),
        ),
      ),
      Effect.forkScoped,
    );

    const recoverIngressOverflow = Effect.fn("ThreadLiveEventCoalescer.recoverIngressOverflow")(
      function* () {
        const dropped =
          (yield* Queue.size(input)) > 0 ? yield* Queue.takeAll(input) : ([] as const);
        yield* mutex.withPermits(1)(
          Effect.gen(function* () {
            yield* cancelWindow();
            windowGeneration += 1;
            pendingUpdates = [];
            yield* forceSnapshot("ingress-count", 0);
          }),
        );
        yield* Effect.forEach(
          dropped,
          (entry) =>
            entry.processed === undefined
              ? Effect.void
              : Deferred.succeed(entry.processed, undefined).pipe(Effect.asVoid),
          { discard: true },
        );
      },
    );

    const offer = (value: ThreadLiveInput) =>
      terminated
        ? Effect.void
        : Queue.offer(input, { value }).pipe(
            Effect.flatMap((accepted) => (accepted ? Effect.void : recoverIngressOverflow())),
          );

    // Synchronization callers wait for their marker to pass through the same
    // ordered input queue before draining output produced ahead of it. If an
    // ingress overflow races the marker, recovery settles its deferred only
    // after the replacement snapshot has been enqueued.
    const offerAndWait = Effect.fn("ThreadLiveEventCoalescer.offerAndWait")(function* (
      value: ThreadLiveInput,
    ) {
      if (terminated) return;
      const processed = yield* Deferred.make<void>();
      const accepted = yield* Queue.offer(input, { value, processed });
      if (!accepted) {
        yield* recoverIngressOverflow();
        yield* process(value);
        yield* Deferred.succeed(processed, undefined);
      }
      yield* Deferred.await(processed);
    });

    return {
      offer,
      offerAndWait,
      stream: Stream.fromQueue(output).pipe(
        Stream.map((next) => {
          queuedBytes = Math.max(0, queuedBytes - next.bytes);
          return next.item;
        }),
      ),
      takeAll: Queue.takeAll(output).pipe(
        Effect.map((items) => {
          queuedBytes = 0;
          return items.map((next) => next.item);
        }),
      ),
    } as const;
  },
);
