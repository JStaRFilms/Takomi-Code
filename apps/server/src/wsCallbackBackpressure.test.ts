import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as Socket from "effect/unstable/socket/Socket";

import {
  DURABLE_SUBSCRIPTION_QUEUE_BYTES,
  DURABLE_SUBSCRIPTION_QUEUE_ITEMS,
  makeBoundedCallbackStream,
  makeBoundedClosingStream,
} from "./ws.ts";
import {
  WS_BACKPRESSURE_CLOSE_CODE,
  WS_BACKPRESSURE_CLOSE_REASON,
} from "./wsTransportBackpressure.ts";

describe("callback subscription backpressure", () => {
  it.effect("closes only the client whose callback queue overflows", () =>
    Effect.gen(function* () {
      const closed = yield* Queue.unbounded<{ readonly code: number; readonly reason: string }>();
      const webSocket = {
        close: (code: number, reason: string) => Queue.offerUnsafe(closed, { code, reason }),
      } as unknown as globalThis.WebSocket;
      const stream = makeBoundedCallbackStream<number, never, never>({
        name: "test.callback",
        register: (offer) =>
          Effect.forEach(
            Array.from({ length: DURABLE_SUBSCRIPTION_QUEUE_ITEMS + 1 }, (_, index) => index),
            offer,
            { discard: true },
          ).pipe(Effect.andThen(Effect.never)),
      });
      const consumer = yield* Stream.runDrain(stream).pipe(
        Effect.provideService(Socket.WebSocket, webSocket),
        Effect.forkChild,
      );

      expect(yield* Queue.take(closed)).toEqual({
        code: WS_BACKPRESSURE_CLOSE_CODE,
        reason: WS_BACKPRESSURE_CLOSE_REASON,
      });
      yield* Fiber.interrupt(consumer);
    }),
  );

  it.effect("closes when one callback item exceeds the UTF-8 byte budget", () =>
    Effect.gen(function* () {
      const closed = yield* Queue.unbounded<{ readonly code: number; readonly reason: string }>();
      const webSocket = {
        close: (code: number, reason: string) => Queue.offerUnsafe(closed, { code, reason }),
      } as unknown as globalThis.WebSocket;
      const stream = makeBoundedCallbackStream<string, never, never>({
        name: "test.callback-bytes",
        register: (offer) =>
          offer("😀".repeat(DURABLE_SUBSCRIPTION_QUEUE_BYTES)).pipe(Effect.andThen(Effect.never)),
      });
      const consumer = yield* Stream.runDrain(stream).pipe(
        Effect.provideService(Socket.WebSocket, webSocket),
        Effect.forkChild,
      );

      expect(yield* Queue.take(closed)).toEqual({
        code: WS_BACKPRESSURE_CLOSE_CODE,
        reason: WS_BACKPRESSURE_CLOSE_REASON,
      });
      yield* Fiber.interrupt(consumer);
    }),
  );

  it.effect("closes when an excluded subscription emits an oversized frame", () =>
    Effect.gen(function* () {
      const closed = yield* Queue.unbounded<{ readonly code: number; readonly reason: string }>();
      const webSocket = {
        close: (code: number, reason: string) => Queue.offerUnsafe(closed, { code, reason }),
      } as unknown as globalThis.WebSocket;
      const stream = makeBoundedClosingStream({
        name: "test.excluded",
        source: Stream.make("x".repeat(DURABLE_SUBSCRIPTION_QUEUE_BYTES)),
      });
      yield* Stream.runDrain(stream).pipe(
        Effect.provideService(Socket.WebSocket, webSocket),
        Effect.forkChild,
      );

      expect(yield* Queue.take(closed)).toEqual({
        code: WS_BACKPRESSURE_CLOSE_CODE,
        reason: WS_BACKPRESSURE_CLOSE_REASON,
      });
    }),
  );
});
