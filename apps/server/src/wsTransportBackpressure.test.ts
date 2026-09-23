import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Socket from "effect/unstable/socket/Socket";

import {
  WS_BACKPRESSURE_CLOSE_CODE,
  WS_BACKPRESSURE_CLOSE_REASON,
  withWebSocketBackpressure,
} from "./wsTransportBackpressure.ts";

const makeSocketHarness = Effect.fn("TestWebSocketHarness.make")(function* (options?: {
  readonly hangWrites?: boolean;
  readonly failWrites?: boolean;
}) {
  const writes: Array<Uint8Array | string | Socket.CloseEvent> = [];
  const opened = yield* Deferred.make<void>();
  const writeStarted = yield* Deferred.make<void>();
  const socket = Socket.make({
    reader: Effect.acquireRelease(
      Deferred.succeed(opened, undefined).pipe(
        Effect.as({
          pull: () => Effect.never,
          upgrade: () => Effect.void,
        }),
      ),
      () => Effect.void,
    ).pipe(Effect.andThen(() => Effect.never)),
    writer: Effect.succeed({
      write: (frame) =>
        options?.hangWrites && !Socket.isCloseEvent(frame)
          ? Deferred.succeed(writeStarted, undefined).pipe(Effect.andThen(Effect.never))
          : Effect.sync(() => {
              writes.push(frame);
              if (options?.failWrites) throw new Error("writer failed");
            }),
      writeAll: (frames) =>
        options?.hangWrites
          ? Deferred.succeed(writeStarted, undefined).pipe(Effect.andThen(Effect.never))
          : Effect.forEach(frames, (frame) =>
              Effect.sync(() => {
                writes.push(frame);
                if (options?.failWrites) throw new Error("writer failed");
              }),
            ).pipe(Effect.asVoid),
    }),
  });
  return { socket, writes, opened, writeStarted };
});

describe("websocket transport backpressure", () => {
  it.effect("closes a blocked writer without affecting a fast writer", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const blocked = yield* makeSocketHarness({ hangWrites: true });
        const fast = yield* makeSocketHarness();
        const blockedSocket = withWebSocketBackpressure(blocked.socket, {
          bufferedBytesLimit: 100,
        });
        const fastSocket = withWebSocketBackpressure(fast.socket, { bufferedBytesLimit: 100 });
        const blockedRun = yield* blockedSocket.reader.pipe(Effect.forkScoped);
        const fastRun = yield* fastSocket.reader.pipe(Effect.forkScoped);
        yield* Deferred.await(blocked.opened);
        yield* Deferred.await(fast.opened);
        const blockedWriter = yield* blockedSocket.writer;
        const fastWriter = yield* fastSocket.writer;

        // Fill the blocked socket's in-flight budget with a write that never
        // acks, then verify the next frame closes only that connection.
        const hanging = yield* blockedWriter.write(new Uint8Array(90)).pipe(Effect.forkScoped);
        yield* Deferred.await(blocked.writeStarted);
        yield* blockedWriter.write("12345678901");
        yield* fastWriter.write("12345678901");

        expect(blocked.writes).toHaveLength(1);
        expect(blocked.writes[0]).toBeInstanceOf(Socket.CloseEvent);
        expect(blocked.writes[0]).toMatchObject({
          code: WS_BACKPRESSURE_CLOSE_CODE,
          reason: WS_BACKPRESSURE_CLOSE_REASON,
        });
        expect(fast.writes).toEqual(["12345678901"]);
        yield* Fiber.interrupt(hanging);
        yield* Fiber.interrupt(blockedRun);
        yield* Fiber.interrupt(fastRun);
      }),
    ),
  );

  it.effect("records accepted bytes and completion time only after a successful writer ack", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const summaries: Array<{
          readonly acceptedFrameBytes: number;
          readonly bufferedBytesHighWater: number;
          readonly lastSuccessfulFrameAtMs: number | null;
        }> = [];
        const successful = yield* makeSocketHarness();
        const socket = withWebSocketBackpressure(successful.socket, {
          bufferedBytesLimit: 100,
          onSummary: (summary) => summaries.push(summary),
        });
        const run = yield* socket.reader.pipe(Effect.forkScoped);
        yield* Deferred.await(successful.opened);
        const writer = yield* socket.writer;
        yield* writer.write("é");
        yield* Fiber.interrupt(run);

        expect(summaries.at(-1)).toMatchObject({
          acceptedFrameBytes: 2,
          bufferedBytesHighWater: 2,
        });
        expect(summaries.at(-1)?.lastSuccessfulFrameAtMs).toBeTypeOf("number");

        const failedSummaries: typeof summaries = [];
        const failed = yield* makeSocketHarness({ failWrites: true });
        const failedSocket = withWebSocketBackpressure(failed.socket, {
          bufferedBytesLimit: 100,
          onSummary: (summary) => failedSummaries.push(summary),
        });
        const failedRun = yield* failedSocket.reader.pipe(Effect.forkScoped);
        yield* Deferred.await(failed.opened);
        const failedWriter = yield* failedSocket.writer;
        yield* Effect.exit(failedWriter.write("not accepted"));
        yield* Fiber.interrupt(failedRun);

        // The failed frame still occupied the budget while attempted.
        expect(failedSummaries.at(-1)).toMatchObject({
          acceptedFrameBytes: 0,
          bufferedBytesHighWater: 12,
          lastSuccessfulFrameAtMs: null,
        });
      }),
    ),
  );
});
