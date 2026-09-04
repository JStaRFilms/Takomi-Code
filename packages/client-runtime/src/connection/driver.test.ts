import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import * as Tracer from "effect/Tracer";

import { withStageDeadline } from "./driver.ts";

const completeAfter = (gate: Deferred.Deferred<void>) =>
  Deferred.await(gate).pipe(Effect.as("complete" as const));

describe("connection driver stage deadlines", () => {
  it.effect("starts a fresh 15 second budget for every stage", () =>
    Effect.gen(function* () {
      const preparation = yield* Deferred.make<void>();
      const opening = yield* Deferred.make<void>();
      const synchronization = yield* Deferred.make<void>();
      const attempt = yield* Effect.gen(function* () {
        yield* withStageDeadline("preparing", "test", completeAfter(preparation));
        yield* withStageDeadline("opening", "test", completeAfter(opening));
        yield* withStageDeadline("synchronizing", "test", completeAfter(synchronization));
      }).pipe(Effect.forkChild);

      yield* TestClock.adjust("14 seconds");
      yield* Deferred.succeed(preparation, undefined);
      yield* TestClock.adjust("14 seconds");
      yield* Deferred.succeed(opening, undefined);
      yield* TestClock.adjust("14 seconds");
      yield* Deferred.succeed(synchronization, undefined);

      expect((yield* Fiber.await(attempt))._tag).toBe("Success");
    }),
  );

  it.effect("finalizes unique stage diagnostics on success and non-timeout failure", () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span: (options) => {
          const span = new Tracer.NativeSpan(options);
          const end = span.end.bind(span);
          span.end = (endTime, exit) => {
            end(endTime, exit);
            spans.push(span);
          };
          return span;
        },
      });

      yield* withStageDeadline("preparing", "test", Effect.void).pipe(
        Effect.provideService(Tracer.Tracer, tracer),
      );
      yield* withStageDeadline("opening", "test", Effect.fail("socket refused")).pipe(
        Effect.exit,
        Effect.provideService(Tracer.Tracer, tracer),
      );

      const preparing = spans.find((span) => span.name === "connection.stage.preparing");
      const opening = spans.find((span) => span.name === "connection.stage.opening");
      expect(preparing?.attributes.get("connection.stage")).toBe("preparing");
      expect(preparing?.attributes.get("connection.stage.preparing.outcome")).toBe("success");
      expect(opening?.attributes.get("connection.stage")).toBe("opening");
      expect(opening?.attributes.get("connection.stage.opening.outcome")).toBe("failure");
      expect(
        spans
          .find((span) => span.name === "connection.stage.opening")
          ?.attributes.get("connection.stage.opening.duration_ms"),
      ).toBeTypeOf("number");
    }),
  );

  it.effect("includes construction and opened acknowledgement in one opening budget", () =>
    Effect.gen(function* () {
      const constructed = yield* Deferred.make<void>();
      const opened = yield* Deferred.make<void>();
      const attempt = yield* withStageDeadline(
        "opening",
        "test",
        Deferred.await(constructed).pipe(Effect.andThen(Deferred.await(opened))),
      ).pipe(Effect.flip, Effect.forkChild);

      yield* TestClock.adjust("14 seconds");
      yield* Deferred.succeed(constructed, undefined);
      yield* TestClock.adjust("999 millis");
      expect(attempt.pollUnsafe()).toBeUndefined();
      yield* TestClock.adjust("1 milli");
      expect(yield* Fiber.join(attempt)).toMatchObject({
        _tag: "ConnectionTransientError",
        reason: "timeout",
        stage: "opening",
        elapsedMs: 15_000,
      });
    }),
  );
});
