import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";
import {
  parseTimestampMs,
  tokenCount,
  totalTokens,
  type ProviderUsageReader,
  type TranscriptUsageFormat,
  type UsageRecord,
} from "@t3tools/provider-core/server/usage";
import * as HostProcess from "@t3tools/shared/HostProcess";
import type { PiSettings } from "../settings.ts";

const PiScanState = Schema.Struct({
  sessionId: Schema.mutableKey(Schema.String),
  model: Schema.mutableKey(Schema.String),
});
const Usage = Schema.Struct({
  input: Schema.optional(Schema.Unknown),
  input_tokens: Schema.optional(Schema.Unknown),
  output: Schema.optional(Schema.Unknown),
  output_tokens: Schema.optional(Schema.Unknown),
  cacheRead: Schema.optional(Schema.Unknown),
  cache_read_input_tokens: Schema.optional(Schema.Unknown),
  cacheWrite: Schema.optional(Schema.Unknown),
  cache_creation_input_tokens: Schema.optional(Schema.Unknown),
  reasoning: Schema.optional(Schema.Unknown),
  reasoning_output_tokens: Schema.optional(Schema.Unknown),
  cost: Schema.optional(Schema.Union([Schema.Number, Schema.Struct({ total: Schema.Unknown })])),
});
const Identity = {
  id: Schema.optional(Schema.NonEmptyString),
  timestamp: Schema.optional(Schema.Unknown),
};
const Model = {
  provider: Schema.optional(Schema.NonEmptyString),
  model: Schema.optional(Schema.NonEmptyString),
};
const Entry = Schema.Union([
  Schema.Struct({ type: Schema.Literal("session"), id: Schema.NonEmptyString }),
  Schema.Struct({ type: Schema.Literal("model_change"), modelId: Schema.NonEmptyString }),
  Schema.Struct({
    ...Identity,
    type: Schema.Literal("message"),
    costUSD: Schema.optional(Schema.Number),
    message: Schema.Union([
      Schema.Struct({
        ...Model,
        role: Schema.Literal("assistant"),
        modelId: Schema.optional(Schema.NonEmptyString),
        timestamp: Schema.optional(Schema.Unknown),
        responseModel: Schema.optional(Schema.NonEmptyString),
        usage: Usage,
      }),
      Schema.Struct({ role: Schema.Literal("toolResult"), usage: Usage }),
    ]),
  }),
  Schema.Struct({ ...Identity, ...Model, type: Schema.Literal("usage"), usage: Usage }),
  Schema.Struct({
    ...Identity,
    type: Schema.Literals(["compaction", "branch_summary"]),
    usage: Usage,
  }),
]);
const decodeEntry = Schema.decodeUnknownOption(Entry);

const timestamp = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : parseTimestampMs(value);

function parseRecord(parsed: unknown, state: typeof PiScanState.Type): readonly UsageRecord[] {
  const decoded = decodeEntry(parsed);
  if (Option.isNone(decoded)) return [];
  const entry = decoded.value;
  if (entry.type === "session") {
    state.sessionId = entry.id;
    return [];
  }
  if (entry.type === "model_change") {
    state.model = entry.modelId;
    return [];
  }
  const source = entry.type === "message" ? entry.message : entry;
  const timestampMs =
    timestamp(entry.timestamp) ?? ("timestamp" in source ? timestamp(source.timestamp) : null);
  if (timestampMs === null) return [];
  const usage = source.usage;
  const rateModel =
    entry.type === "usage" || ("role" in source && source.role === "assistant")
      ? (("responseModel" in source ? source.responseModel : undefined) ??
        ("model" in source ? source.model : undefined) ??
        ("modelId" in source ? source.modelId : undefined) ??
        (state.model || "unknown"))
      : undefined;
  // Auxiliary records have no conversation-model attribution in Pi's own breakdown.
  const model =
    rateModel === undefined
      ? "Tools/summaries"
      : "provider" in source && source.provider
        ? `${source.provider}/${rateModel}`
        : rateModel;
  const outputTokens = tokenCount(usage.output ?? usage.output_tokens);
  const totals = {
    uncachedInputTokens: tokenCount(usage.input ?? usage.input_tokens),
    cachedInputTokens: tokenCount(usage.cacheRead ?? usage.cache_read_input_tokens),
    cacheCreationTokens: tokenCount(usage.cacheWrite ?? usage.cache_creation_input_tokens),
    outputTokens,
    reasoningTokens: Math.min(
      outputTokens,
      tokenCount(usage.reasoning ?? usage.reasoning_output_tokens),
    ),
  };
  const cost =
    typeof usage.cost === "number"
      ? usage.cost
      : (usage.cost?.total ?? ("costUSD" in entry ? entry.costUSD : undefined));
  const reportedCostUsd =
    typeof cost === "number" && Number.isFinite(cost) && cost > 0 ? cost : null;
  if (totalTokens(totals) === 0 && reportedCostUsd === null) return [];
  return [
    {
      // Preserve saved Takomi usage summaries and client provider filters.
      provider: "takomi",
      timestampMs,
      model,
      ...(rateModel === undefined ? {} : { rateModel }),
      sessionId: state.sessionId,
      totals,
      reportedCostUsd,
      speed: "standard",
      // Forks copy IDs verbatim. Timestamp/model avoid unrelated eight-hex-ID collisions.
      dedupeKey:
        entry.id === undefined
          ? null
          : JSON.stringify(["pi", entry.id, entry.timestamp ?? timestampMs, model]),
    },
  ];
}

export const piUsageFormat: TranscriptUsageFormat<typeof PiScanState.Type> = {
  selectFields: {
    type: true,
    id: true,
    timestamp: true,
    provider: true,
    model: true,
    modelId: true,
    usage: true,
    costUSD: true,
    message: {
      role: true,
      provider: true,
      model: true,
      modelId: true,
      timestamp: true,
      responseModel: true,
      usage: true,
    },
  },
  usageMarkers: ['"usage"', '"session"', '"model_change"'],
  parseLine: (line, state) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return [];
    }
    return parseRecord(parsed, state);
  },
  parseProjected: parseRecord,
  state: { initial: () => ({ sessionId: "", model: "" }), schema: PiScanState },
};

export const piUsageReader = {
  kind: "transcripts",
  provider: "takomi",
  format: piUsageFormat,
  directories: Effect.fn("piUsageReader.directories")(function* ({ environment, config }) {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const home = yield* HostProcess.HomeDirectory;
    const sessionDir = environment.PI_CODING_AGENT_SESSION_DIR?.trim();
    if (sessionDir) return [{ dir: path.resolve(expandHomePath(sessionDir, home)) }];
    const agentDir = config?.homePath.trim() || environment.PI_CODING_AGENT_DIR?.trim();
    if (agentDir) {
      const root = path.resolve(expandHomePath(agentDir, home));
      for (const dir of [path.join(root, "agent", "sessions"), path.join(root, "sessions")]) {
        if (yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false))) return [{ dir }];
      }
      return [{ dir: root }];
    }
    const current = path.join(home, ".pi", "agent", "sessions");
    const legacy = path.join(home, ".pi", "sessions");
    return [
      {
        dir: (yield* fs.exists(current).pipe(Effect.orElseSucceed(() => false))) ? current : legacy,
      },
    ];
  }),
} satisfies ProviderUsageReader<PiSettings, Path.Path | FileSystem.FileSystem>;
