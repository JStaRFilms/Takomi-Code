import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import {
  DURABLE_SUBSCRIPTION_QUEUE_BYTES,
  DURABLE_SUBSCRIPTION_QUEUE_ITEMS,
  makeBoundedDurableLiveStream,
} from "./ws.ts";

describe("durable subscription backpressure", () => {
  it.effect("replaces a shell count overflow with snapshot and synchronization completion", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const buffer = yield* makeBoundedDurableLiveStream<string, never, never>({
          name: "shell.events",
          source: Stream.never,
          authoritativeSnapshot: Effect.succeed("snapshot"),
          overflowCompletion: "synchronized",
        });
        for (let index = 0; index <= DURABLE_SUBSCRIPTION_QUEUE_ITEMS; index += 1) {
          yield* buffer.offer(`event-${index}`);
        }
        expect(Array.from(yield* buffer.takeAll)).toEqual(["snapshot", "synchronized"]);
      }),
    ),
  );

  it.effect("allows one oversized item but recovers if another item queues behind it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const buffer = yield* makeBoundedDurableLiveStream<string, never, never>({
          name: "server.config",
          source: Stream.never,
          authoritativeSnapshot: Effect.succeed("config-snapshot"),
        });
        const oversized = "x".repeat(DURABLE_SUBSCRIPTION_QUEUE_BYTES);
        yield* buffer.offer(oversized);
        expect(Array.from(yield* buffer.takeAll)).toEqual([oversized]);

        yield* buffer.offer(oversized);
        yield* buffer.offer("next-update");
        expect(Array.from(yield* buffer.takeAll)).toEqual(["config-snapshot"]);
      }),
    ),
  );

  it.effect("isolates a stalled subscriber from a fast subscriber", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const makeBuffer = (name: string) =>
          makeBoundedDurableLiveStream<string, never, never>({
            name,
            source: Stream.never,
            authoritativeSnapshot: Effect.succeed(`${name}-snapshot`),
          });
        const stalled = yield* makeBuffer("stalled");
        const fast = yield* makeBuffer("fast");
        for (let index = 0; index <= DURABLE_SUBSCRIPTION_QUEUE_ITEMS; index += 1) {
          yield* stalled.offer(`event-${index}`);
          yield* fast.offer(`event-${index}`);
          expect(Array.from(yield* fast.takeAll)).toEqual([`event-${index}`]);
        }
        expect(Array.from(yield* stalled.takeAll)).toEqual(["stalled-snapshot"]);
      }),
    ),
  );
});
