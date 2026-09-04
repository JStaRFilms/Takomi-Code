import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { DURABLE_SUBSCRIPTION_QUEUE_ITEMS, makeBoundedEphemeralStream } from "./ws.ts";

type PreviewTestEvent = {
  readonly revision: number;
  readonly type: "navigated" | "closed";
};

describe("preview subscription backpressure", () => {
  it.effect("preserves terminal lifecycle when an ephemeral queue overflows", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const events: PreviewTestEvent[] = Array.from(
          { length: DURABLE_SUBSCRIPTION_QUEUE_ITEMS + 1 },
          (_, index) => ({ revision: index + 1, type: "navigated" }),
        );
        events.push({ revision: events.length + 1, type: "closed" });
        const stream = yield* makeBoundedEphemeralStream({
          name: "preview.events",
          source: Stream.fromIterable(events),
          isPriority: (event) => event.type === "closed",
        });
        const result = yield* Stream.runHead(stream);
        expect(Option.getOrUndefined(result)).toEqual({
          revision: DURABLE_SUBSCRIPTION_QUEUE_ITEMS + 2,
          type: "closed",
        });
      }),
    ),
  );
});
