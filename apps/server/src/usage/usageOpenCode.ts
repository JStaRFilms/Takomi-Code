// @effect-diagnostics nodeBuiltinImport:off - the reader streams SQLite rows
// outside the service's Effect FileSystem, like the transcript reader.
/**
 * OpenCode usage reading: discovers its SQLite stores and projects assistant
 * message rows into {@link UsageRecord}s.
 *
 * OpenCode keeps history in `$XDG_DATA_HOME/opencode/opencode.db` (plus
 * per-channel `opencode-*.db` siblings and whatever `OPENCODE_DB` points at)
 * rather than JSONL transcripts, so it reads through a source of its own
 * alongside the file scanners. Rows are projected in SQL — only token, model,
 * and cost scalars ever leave the database — and every table that can hold
 * assistant messages is read, because the store migrated from `message` to
 * `session_message` and machines carry both with overlapping rows.
 *
 * Token semantics, measured against a real 243 MB store: `tokens.input` is
 * cache-exclusive (Claude-style accounting), `tokens.total` re-adds reasoning
 * on top of the disjoint fields, and `reasoning` is NOT a subset of `output`
 * (319 of 1,510 rows exceed it). `outputTokens` therefore folds reasoning in
 * to preserve the shared contract invariant, and `total` is ignored. A
 * reported `cost` of exactly 0 means "subscription turn", not "free": it is
 * treated as unknown so the rate table can price the tokens.
 *
 * @module usageOpenCode
 */
import * as NodeSqlite from "node:sqlite";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import type { UsageTokenTotals } from "@t3tools/contracts";

import type { UsageRecord } from "./usageTranscripts.ts";

/** `opencode-<channel>.db` siblings of the stable database. */
const CHANNEL_DATABASE_PATTERN = /^opencode-[a-zA-Z0-9._-]+\.db$/;

function int(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** Projects one `OPENCODE_DB` value onto an absolute database path. */
function resolveOpenCodeDatabaseOverride(
  override: string,
  dataDirectory: string,
): string | undefined {
  const trimmed = override.trim();
  // The in-memory database is never a durable usage source.
  if (trimmed.length === 0 || trimmed === ":memory:") return undefined;
  return NodePath.isAbsolute(trimmed)
    ? NodePath.resolve(trimmed)
    : NodePath.resolve(dataDirectory, trimmed);
}

/**
 * Lists the databases one OpenCode environment writes to.
 *
 * `OPENCODE_DB` replaces discovery entirely. Otherwise the stable
 * `opencode.db` is always included — even when missing, so the source reports
 * honest `missing` coverage — and channel siblings join it unless
 * `OPENCODE_DISABLE_CHANNEL_DB` is set.
 */
export async function listOpenCodeDatabases(input: {
  readonly environment: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
}): Promise<readonly string[]> {
  const dataDirectory = await resolveOpenCodeDataDirectory(input);
  const override = resolveOpenCodeDatabaseOverride(
    input.environment["OPENCODE_DB"] ?? "",
    dataDirectory,
  );
  if (override !== undefined) return [override];

  const stable = NodePath.join(dataDirectory, "opencode.db");
  const disabled = ["1", "true"].includes(
    (input.environment["OPENCODE_DISABLE_CHANNEL_DB"] ?? "").trim().toLowerCase(),
  );
  if (disabled) return [stable];

  let entries: readonly string[];
  try {
    entries = await NodeFSP.readdir(dataDirectory);
  } catch {
    // A missing data directory still reports the stable path as `missing`.
    return [stable];
  }
  const channels = entries
    .filter((name) => CHANNEL_DATABASE_PATTERN.test(name))
    .sort((a, b) => a.localeCompare(b));
  return [stable, ...channels.map((name) => NodePath.join(dataDirectory, name))];
}

async function resolveOpenCodeDataDirectory(input: {
  readonly environment: NodeJS.ProcessEnv;
  readonly homeDirectory: string;
}): Promise<string> {
  const xdg = (input.environment["XDG_DATA_HOME"] ?? "").trim();
  const environmentHome =
    (input.environment["HOME"] ?? "").trim() ||
    (input.environment["USERPROFILE"] ?? "").trim() ||
    input.homeDirectory;
  if (xdg.length > 0) {
    const expanded = xdg.startsWith("~") ? NodePath.join(environmentHome, xdg.slice(1)) : xdg;
    return NodePath.resolve(expanded, "opencode");
  }
  return NodePath.join(environmentHome, ".local", "share", "opencode");
}

/** Scalar projection of one assistant message row, extracted in SQL. */
export interface OpenCodeUsageRow {
  readonly id: unknown;
  readonly sessionId: unknown;
  readonly modelId: unknown;
  readonly completedMs: unknown;
  readonly inputTokens: unknown;
  readonly cachedReadTokens: unknown;
  readonly cacheWriteTokens: unknown;
  readonly outputTokens: unknown;
  readonly reasoningTokens: unknown;
  readonly cost: unknown;
}

function projectedUsageRow(row: Readonly<Record<string, unknown>>): OpenCodeUsageRow {
  return {
    id: row["id"],
    sessionId: row["sessionId"],
    modelId: row["modelId"],
    completedMs: row["completedMs"],
    inputTokens: row["inputTokens"],
    cachedReadTokens: row["cachedReadTokens"],
    cacheWriteTokens: row["cacheWriteTokens"],
    outputTokens: row["outputTokens"],
    reasoningTokens: row["reasoningTokens"],
    cost: row["cost"],
  };
}

/**
 * Turns one projected row into a {@link UsageRecord}, or `null` when the row
 * carries no usage (mid-stream snapshots, missing model, zero tokens).
 */
export function parseOpenCodeUsageRow(row: OpenCodeUsageRow): UsageRecord | null {
  if (typeof row.id !== "string" || row.id.length === 0) return null;
  const completedMs =
    typeof row.completedMs === "number" && Number.isFinite(row.completedMs)
      ? row.completedMs
      : null;
  if (completedMs === null || completedMs <= 0) return null;

  // The bare model ID, like Codex records: provider-prefixed IDs never
  // resolve against the rate table, and the same model reached through a
  // router prices the same as the same model reached directly.
  const model = typeof row.modelId === "string" ? row.modelId.trim() : "";
  if (model.length === 0) return null;

  // OpenCode reports reasoning disjoint from output; fold it in so the shared
  // invariant (reasoning ⊆ output) holds without dropping generated tokens.
  const output = int(row.outputTokens);
  const reasoning = int(row.reasoningTokens);
  const totals: UsageTokenTotals = {
    uncachedInputTokens: int(row.inputTokens),
    cachedInputTokens: int(row.cachedReadTokens),
    cacheCreationTokens: int(row.cacheWriteTokens),
    outputTokens: output + reasoning,
    reasoningTokens: reasoning,
  };
  if (
    totals.uncachedInputTokens +
      totals.cachedInputTokens +
      totals.cacheCreationTokens +
      totals.outputTokens ===
    0
  ) {
    return null;
  }

  // cost 0 is a subscription turn, not a free one: report unknown so the
  // rate table can price the tokens at API-equivalent rates.
  const reportedCostUsd =
    typeof row.cost === "number" && Number.isFinite(row.cost) && row.cost > 0 ? row.cost : null;

  return {
    provider: "opencode",
    timestampMs: completedMs,
    model,
    sessionId: typeof row.sessionId === "string" ? row.sessionId : "",
    totals,
    reportedCostUsd,
    // OpenCode message ids are unique per database, so the key only has to
    // stay stable within one scan. It exists for migrated rows that appear
    // in both tables.
    dedupeKey: `opencode:${row.id}`,
  };
}

/** Reads both tables in `session_message`-first order so current rows win. */
const OPEN_CODE_TABLES = ["session_message", "message"] as const;

/** Shared projection: never select `data`, only the usage scalars. */
const OPEN_CODE_ROW_PROJECTION = `
  COALESCE(json_extract(data, '$.modelID'), json_extract(data, '$.model.id')) AS modelId,
  json_extract(data, '$.time.completed') AS completedMs,
  json_extract(data, '$.tokens.input') AS inputTokens,
  json_extract(data, '$.tokens.cache.read') AS cachedReadTokens,
  json_extract(data, '$.tokens.cache.write') AS cacheWriteTokens,
  json_extract(data, '$.tokens.output') AS outputTokens,
  json_extract(data, '$.tokens.reasoning') AS reasoningTokens,
  COALESCE(json_extract(data, '$.cost'), json_extract(data, '$.cost.total')) AS cost`;

export interface OpenCodeUsageRead {
  readonly records: readonly UsageRecord[];
  /** In-window invalid JSON or assistant rows with no recognisable usage payload. */
  readonly malformedRecords: number;
  /** Tables that were read; empty when the database holds neither. */
  readonly tables: readonly string[];
}

/**
 * Reads one OpenCode database read-only and returns its usage records.
 *
 * Returns `null` when the database cannot be read at all (locked, corrupt,
 * not a database): that is a `failed` source, distinct from the `missing` of
 * an absent file. The connection never writes, creates, or migrates anything.
 */
export async function readOpenCodeUsage(
  databasePath: string,
  sinceMs: number,
): Promise<OpenCodeUsageRead | null> {
  let database: NodeSqlite.DatabaseSync;
  try {
    database = new NodeSqlite.DatabaseSync(databasePath, { readOnly: true });
  } catch {
    return null;
  }

  try {
    const present = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => (row as { name?: unknown }).name)
        .filter((name): name is string => typeof name === "string"),
    );

    const byMessageId = new Map<string, UsageRecord>();
    const tables: string[] = [];
    let malformedRecords = 0;
    for (const table of OPEN_CODE_TABLES) {
      if (!present.has(table)) continue;
      tables.push(table);
      const malformed = database
        .prepare(
          `SELECT COUNT(*) AS n FROM ${table} WHERE time_updated >= ? AND NOT json_valid(data)`,
        )
        .get(sinceMs) as { n?: unknown };
      malformedRecords += typeof malformed?.n === "number" ? malformed.n : 0;
      const rows = database
        .prepare(
          `SELECT id, session_id AS sessionId, ${OPEN_CODE_ROW_PROJECTION} FROM ${table}
           WHERE time_updated >= ?
             AND json_valid(data)
             AND (json_extract(data, '$.role') = 'assistant' OR json_extract(data, '$.type') = 'assistant')
             AND json_extract(data, '$.time.completed') >= ?
             AND json_extract(data, '$.tokens') IS NOT NULL`,
        )
        .all(sinceMs, sinceMs);
      for (const raw of rows) {
        const record = parseOpenCodeUsageRow(projectedUsageRow(raw));
        if (record === null) {
          malformedRecords += 1;
          continue;
        }
        // session_message is read first, so a row migrated between tables is
        // counted once from its current home. The parser always sets a
        // dedupe key; the fallback only exists to satisfy the type.
        const key = record.dedupeKey ?? `${record.sessionId}:${record.timestampMs}:${record.model}`;
        if (!byMessageId.has(key)) byMessageId.set(key, record);
      }
    }
    return { records: [...byMessageId.values()], malformedRecords, tables };
  } catch {
    return null;
  } finally {
    try {
      database.close();
    } catch {
      // A failed close never invalidates the rows already read.
    }
  }
}
