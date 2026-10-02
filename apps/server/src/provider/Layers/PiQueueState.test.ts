import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { decodeNativePiQueueState } from "./PiQueueState.ts";
import { PiJsonlDecoder } from "./PiProtocolConformance.ts";

const data = {
  pendingMessageCount: 0,
  steeringMode: "all",
  followUpMode: "one-at-a-time",
  isStreaming: false,
  isCompacting: true,
};
const response = (value: unknown) => ({
  type: "response",
  command: "get_state",
  success: true,
  data: value,
});

describe("native queue state validation", () => {
  it.effect("preserves combined zero, modes and flags, stripping model/session/text fields", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeNativePiQueueState(
        response({
          ...data,
          sessionFile: "/private",
          sessionId: "private-id",
          model: { key: "private" },
          steering: ["private-text"],
          followUp: ["private-followup"],
        }),
      );
      expect(decoded.data).toEqual(data);
    }),
  );
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "0", null, undefined]) {
    it.effect(`rejects invalid combined count ${String(value)}`, () =>
      Effect.gen(function* () {
        expect(
          Exit.isFailure(
            yield* decodeNativePiQueueState(response({ ...data, pendingMessageCount: value })).pipe(
              Effect.exit,
            ),
          ),
        ).toBe(true);
      }),
    );
  }
  it.effect("requires both modes and boolean flags and a successful exact response", () =>
    Effect.gen(function* () {
      for (const [field, values] of [
        ["steeringMode", ["unknown", null, undefined, 0]],
        ["followUpMode", ["unknown", null, undefined, 0]],
        ["isStreaming", ["false", null, undefined, 0]],
        ["isCompacting", ["true", null, undefined, 1]],
      ] as const) {
        for (const value of values)
          expect(
            Exit.isFailure(
              yield* decodeNativePiQueueState(response({ ...data, [field]: value })).pipe(
                Effect.exit,
              ),
            ),
          ).toBe(true);
      }
      for (const value of [
        response({}),
        { ...response(data), command: "get_session_stats" },
        { ...response(data), success: false, error: "private" },
        { ...response(data), type: "agent_start" },
      ])
        expect(Exit.isFailure(yield* decodeNativePiQueueState(value).pipe(Effect.exit))).toBe(true);
    }),
  );
  it("retains the 1 MiB JSONL ceiling even for fields excluded by the queue schema", () => {
    const encode = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
    const decoder = new PiJsonlDecoder();
    const frames = decoder.push(
      new TextEncoder().encode(
        `${encode(response({ ...data, private: "x".repeat(1024 * 1024) }))}\n`,
      ),
    );
    expect(frames).toHaveLength(1);
    expect(frames.some((frame) => frame.type === "record")).toBe(false);
  });
});
