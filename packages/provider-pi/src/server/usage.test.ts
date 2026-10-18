import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PiSettings } from "../settings.ts";
import { piUsageFormat, piUsageReader } from "./usage.ts";

const state = () => ({ sessionId: "", model: "" });
const when = "2026-08-01T10:00:05Z";

describe("Pi usage compatibility", () => {
  it("retains legacy session/model state, token aliases and the takomi key", () => {
    const scan = state();
    expect(piUsageFormat.parseProjected({ type: "session", id: "session-1" }, scan)).toEqual([]);
    expect(
      piUsageFormat.parseProjected({ type: "model_change", modelId: "gpt-5.6-terra" }, scan),
    ).toEqual([]);
    const [record] = piUsageFormat.parseLine(
      JSON.stringify({
        type: "message",
        id: "message-1",
        timestamp: when,
        message: {
          role: "assistant",
          usage: {
            input_tokens: 100,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 5,
            output_tokens: 10,
            reasoning_output_tokens: 12,
            cost: { total: 0.125 },
          },
        },
      }),
      scan,
    );
    expect(record).toMatchObject({
      provider: "takomi",
      model: "gpt-5.6-terra",
      sessionId: "session-1",
      reportedCostUsd: 0.125,
      totals: {
        uncachedInputTokens: 100,
        cachedInputTokens: 20,
        cacheCreationTokens: 5,
        outputTokens: 10,
        reasoningTokens: 10,
      },
    });
    const [nestedTimestamp] = piUsageFormat.parseProjected(
      {
        type: "message",
        costUSD: 0.25,
        message: {
          role: "assistant",
          modelId: "legacy-model",
          timestamp: Date.parse(when),
          usage: { input: 1 },
        },
      },
      scan,
    );
    expect(nestedTimestamp).toMatchObject({
      model: "legacy-model",
      timestampMs: Date.parse(when),
      reportedCostUsd: 0.25,
      dedupeKey: null,
    });
  });

  it("keeps upstream response-model, auxiliary usage and fork deduplication semantics", () => {
    const scan = state();
    piUsageFormat.parseProjected({ type: "session", id: "session-1" }, scan);
    const entry = {
      type: "message",
      id: "shared-id",
      timestamp: when,
      message: {
        role: "assistant",
        provider: "openai",
        model: "alias",
        responseModel: "real-model",
        usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, cost: { total: 0 } },
      },
    };
    const [record] = piUsageFormat.parseProjected(entry, scan);
    expect(record).toMatchObject({
      model: "openai/real-model",
      rateModel: "real-model",
      reportedCostUsd: null,
    });
    const copied = piUsageFormat.parseProjected(entry, { sessionId: "fork", model: "" })[0];
    expect(copied?.dedupeKey).toBe(record?.dedupeKey);
    const collision = piUsageFormat.parseProjected(
      { ...entry, timestamp: "2026-08-01T10:00:06Z" },
      scan,
    )[0];
    expect(collision?.dedupeKey).not.toBe(record?.dedupeKey);
    for (const type of ["compaction", "branch_summary"] as const) {
      expect(
        piUsageFormat.parseProjected(
          { type, id: type, timestamp: when, usage: { input: 2 } },
          scan,
        )[0]?.model,
      ).toBe("Tools/summaries");
    }
    expect(
      piUsageFormat.parseProjected(
        {
          type: "message",
          id: "tool",
          timestamp: when,
          message: { role: "toolResult", usage: { output: 2 } },
        },
        scan,
      )[0]?.model,
    ).toBe("Tools/summaries");
  });

  it("ignores non-assistant messages, corrupt JSON and invalid timestamps", () => {
    expect(piUsageFormat.parseLine("not json", state())).toEqual([]);
    for (const entry of [
      { type: "message", timestamp: when, message: { role: "user", usage: { output: 10 } } },
      { type: "usage", timestamp: "bad", model: "model", usage: { output: 10 } },
    ])
      expect(piUsageFormat.parseProjected(entry, state())).toEqual([]);
  });
});

it.effect(
  "resolves configured homes, legacy layouts and explicit session directories without leaving the fixture",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "pi-usage-test-" });
      const legacy = path.join(home, ".pi", "sessions");
      const current = path.join(home, ".pi", "agent", "sessions");
      const configured = path.join(home, "configured");
      yield* fs.makeDirectory(legacy, { recursive: true });
      yield* fs.makeDirectory(path.join(configured, "agent", "sessions"), { recursive: true });
      const directories = (homePath = "", environment: NodeJS.ProcessEnv = {}) =>
        piUsageReader
          .directories({
            instanceId: ProviderInstanceId.make("takomi"),
            configured: true,
            config: Schema.decodeSync(PiSettings)({ homePath }),
            environment,
          })
          .pipe(Effect.provideService(HostProcess.HomeDirectory, home));
      expect(yield* directories()).toEqual([{ dir: legacy }]);
      yield* fs.makeDirectory(current, { recursive: true });
      expect(yield* directories()).toEqual([{ dir: current }]);
      expect(yield* directories(configured, { PI_CODING_AGENT_DIR: "ignored" })).toEqual([
        { dir: path.join(configured, "agent", "sessions") },
      ]);
      expect(yield* directories("", { PI_CODING_AGENT_DIR: configured })).toEqual([
        { dir: path.join(configured, "agent", "sessions") },
      ]);
      const direct = path.join(home, "direct");
      yield* fs.makeDirectory(path.join(direct, "sessions"), { recursive: true });
      expect(yield* directories(direct)).toEqual([{ dir: path.join(direct, "sessions") }]);
      expect(yield* directories(legacy)).toEqual([{ dir: legacy }]);
      expect(yield* directories(configured, { PI_CODING_AGENT_SESSION_DIR: "~/explicit" })).toEqual(
        [{ dir: path.join(home, "explicit") }],
      );
    }).pipe(Effect.provide(NodeServices.layer)),
);
