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

const makeSocketHarness = Effect.fn("TestWebSocketHarness.make")(function* (
  bufferedAmount: number,
  failWrites = false,
) {
  const writes: Array<Uint8Array | string | Socket.CloseEvent> = [];
  const opened = yield* Deferred.make<void>();
  const rawSocket = { bufferedAmount } as unknown as globalThis.WebSocket;
  const socket = Socket.make({
    runRaw: (handler, options) => {
      const handled = handler(new Uint8Array());
      return (options?.onOpen ?? Effect.void).pipe(
        Effect.andThen(Effect.isEffect(handled) ? handled : Effect.void),
        Effect.provideService(Socket.WebSocket, rawSocket),
        Effect.andThen(Deferred.succeed(opened, undefined)),
        Effect.andThen(Effect.never),
      );
    },
    writer: Effect.succeed((frame) =>
      Effect.sync(() => {
        writes.push(frame);
        if (failWrites) throw new Error("writer failed");
      }),
    ),
  });
  return { socket, writes, opened };
});

describe("websocket transport backpressure", () => {
  it.effect("closes a blocked writer without affecting a fast writer", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const blocked = yield* makeSocketHarness(90);
        const fast = yield* makeSocketHarness(0);
        const blockedSocket = withWebSocketBackpressure(blocked.socket, {
          bufferedBytesLimit: 100,
        });
        const fastSocket = withWebSocketBackpressure(fast.socket, { bufferedBytesLimit: 100 });
        const blockedRun = yield* blockedSocket.runRaw(() => undefined).pipe(Effect.forkChild);
        const fastRun = yield* fastSocket.runRaw(() => undefined).pipe(Effect.forkChild);
        yield* Deferred.await(blocked.opened);
        yield* Deferred.await(fast.opened);
        const blockedWrite = yield* blockedSocket.writer;
        const fastWrite = yield* fastSocket.writer;

        yield* blockedWrite("12345678901");
        yield* fastWrite("12345678901");

        expect(blocked.writes).toHaveLength(1);
        expect(blocked.writes[0]).toBeInstanceOf(Socket.CloseEvent);
        expect(blocked.writes[0]).toMatchObject({
          code: WS_BACKPRESSURE_CLOSE_CODE,
          reason: WS_BACKPRESSURE_CLOSE_REASON,
        });
        expect(fast.writes).toEqual(["12345678901"]);
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
        const successful = yield* makeSocketHarness(5);
        const socket = withWebSocketBackpressure(successful.socket, {
          bufferedBytesLimit: 100,
          onSummary: (summary) => summaries.push(summary),
        });
        const run = yield* socket.runRaw(() => undefined).pipe(Effect.forkChild);
        yield* Deferred.await(successful.opened);
        const write = yield* socket.writer;
        yield* write("é");
        yield* Fiber.interrupt(run);

        expect(summaries.at(-1)).toMatchObject({
          acceptedFrameBytes: 2,
          bufferedBytesHighWater: 7,
        });
        expect(summaries.at(-1)?.lastSuccessfulFrameAtMs).toBeTypeOf("number");

        const failedSummaries: typeof summaries = [];
        const failed = yield* makeSocketHarness(0, true);
        const failedSocket = withWebSocketBackpressure(failed.socket, {
          bufferedBytesLimit: 100,
          onSummary: (summary) => failedSummaries.push(summary),
        });
        const failedRun = yield* failedSocket.runRaw(() => undefined).pipe(Effect.forkChild);
        yield* Deferred.await(failed.opened);
        const failedWrite = yield* failedSocket.writer;
        yield* Effect.exit(failedWrite("not accepted"));
        yield* Fiber.interrupt(failedRun);

        expect(failedSummaries.at(-1)).toMatchObject({
          acceptedFrameBytes: 0,
          bufferedBytesHighWater: 0,
          lastSuccessfulFrameAtMs: null,
        });
      }),
    ),
  );
});
