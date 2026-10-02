import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { decodeNativePiSessionStats } from "./PiSessionStats.ts";
import { PiJsonlDecoder } from "./PiProtocolConformance.ts";
import * as Schema from "effect/Schema";

const data = {
  userMessages: 0,
  assistantMessages: 0,
  toolCalls: 0,
  toolResults: 0,
  totalMessages: 0,
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  cost: 0,
};
const response = (value: unknown) => ({
  type: "response",
  command: "get_session_stats",
  success: true,
  data: value,
});
const encode = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

describe("native session stats validation", () => {
  it.effect(
    "preserves native zeros, nullable context and strips unneeded fields at every level",
    () =>
      Effect.gen(function* () {
        const decoded = yield* decodeNativePiSessionStats(
          response({
            ...data,
            sessionFile: "/private",
            sessionId: "native",
            details: "secret",
            tokens: { ...data.tokens, secret: "ignored" },
            contextUsage: { tokens: null, percent: null, contextWindow: 200000, model: "private" },
          }),
        );
        expect(decoded.data).toEqual({
          ...data,
          contextUsage: { tokens: null, percent: null, contextWindow: 200000 },
        });
        const empty = yield* decodeNativePiSessionStats(response(data));
        expect(empty.data).not.toHaveProperty("contextUsage");
      }),
  );

  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "1", undefined]) {
    it.effect(`rejects invalid native counts ${String(value)}`, () =>
      Effect.gen(function* () {
        expect(
          Exit.isFailure(
            yield* decodeNativePiSessionStats(response({ ...data, totalMessages: value })).pipe(
              Effect.exit,
            ),
          ),
        ).toBe(true);
        expect(
          Exit.isFailure(
            yield* decodeNativePiSessionStats(
              response({ ...data, tokens: { ...data.tokens, cacheWrite: value } }),
            ).pipe(Effect.exit),
          ),
        ).toBe(true);
      }),
    );
  }
  for (const value of [-1, Infinity, NaN, "0", undefined]) {
    it.effect(`rejects invalid cost or context percentage ${String(value)}`, () =>
      Effect.gen(function* () {
        expect(
          Exit.isFailure(
            yield* decodeNativePiSessionStats(response({ ...data, cost: value })).pipe(Effect.exit),
          ),
        ).toBe(true);
        expect(
          Exit.isFailure(
            yield* decodeNativePiSessionStats(
              response({
                ...data,
                contextUsage: { tokens: 0, contextWindow: 200000, percent: value },
              }),
            ).pipe(Effect.exit),
          ),
        ).toBe(true);
      }),
    );
  }
  it.effect(
    "rejects missing counts, invalid windows, nullable whole context and mismatched responses",
    () =>
      Effect.gen(function* () {
        for (const value of [
          {},
          { ...data, contextUsage: null },
          { ...data, contextUsage: { tokens: 0, contextWindow: 0, percent: 0 } },
        ])
          expect(
            Exit.isFailure(yield* decodeNativePiSessionStats(response(value)).pipe(Effect.exit)),
          ).toBe(true);
        expect(
          Exit.isFailure(
            yield* decodeNativePiSessionStats({ ...response(data), command: "get_state" }).pipe(
              Effect.exit,
            ),
          ),
        ).toBe(true);
      }),
  );
  it("retains the JSONL ceiling for a stats record even when extra fields would be redacted", () => {
    const decoder = new PiJsonlDecoder();
    const frames = decoder.push(
      new TextEncoder().encode(
        `${encode(response({ ...data, details: "x".repeat(1024 * 1024) }))}\n`,
      ),
    );
    expect(frames.some((frame) => frame.type === "record")).toBe(false);
    expect(frames).toHaveLength(1);
  });
});
