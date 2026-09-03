import {
  ApprovalRequestId,
  EventId,
  type PiSettings,
  type ProviderApprovalDecision,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderRuntimeEvent,
  type RuntimeTaskUsage,
  type ToolPresentationEnvelope,
  type ToolLifecycleItemType,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderSessionStartInput,
  type ProviderUserInputAnswers,
  RuntimeItemId,
  RuntimeRequestId,
  RuntimeTaskId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import type { ProviderAdapterShape, ProviderThreadSnapshot } from "../Services/ProviderAdapter.ts";

const PROVIDER = ProviderDriverKind.make("pi");
const PI_RESUME_VERSION = 1 as const;
const REASONING_DETAIL_LIMIT = 16_000;
const REASONING_EMIT_INTERVAL = 500;
const TAKOMI_EXTENSION_NAMES = [
  "takomi-runtime",
  "takomi-subagents",
  "oauth-router",
  "takomi-context-manager",
  "notify-sound",
] as const;
const encoder = new TextEncoder();
const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const decodeJsonString = Schema.decodeUnknownExit(UnknownFromJsonString);
const encodeJsonString = Schema.encodeUnknownExit(UnknownFromJsonString);

function jsonString(value: unknown): string | undefined {
  const encoded = encodeJsonString(value);
  return Exit.isSuccess(encoded) ? encoded.value : undefined;
}

export interface PiAdapterOptions {
  readonly instanceId: ProviderInstanceId;
  readonly environment: NodeJS.ProcessEnv;
}

type PiRpcMessage = Record<string, unknown> & { readonly type: string };

type PiUiMethod = "confirm" | "select" | "input" | "editor";

interface PendingUiRequest {
  readonly method: PiUiMethod;
  readonly requestId: ApprovalRequestId;
}

interface PiTurnSnapshot {
  readonly id: TurnId;
  readonly items: Array<unknown>;
}

interface PiSessionContext {
  session: ProviderSession;
  readonly scope: Scope.Closeable;
  readonly process: ChildProcessSpawner.ChildProcessHandle;
  readonly input: Queue.Queue<Uint8Array>;
  readonly pendingUi: Map<ApprovalRequestId, PendingUiRequest>;
  readonly pendingRpc: Map<string, Deferred.Deferred<PiRpcMessage>>;
  readonly toolActivityByCallId: Map<
    string,
    ReadonlyArray<NonNullable<ToolPresentationEnvelope["activity"]>[number]>
  >;
  readonly truncatedToolActivityCallIds: Set<string>;
  readonly takomiSubagentTaskTracker: TakomiSubagentTaskTracker;
  readonly reasoningBlocks: Map<
    number,
    { readonly taskId: RuntimeTaskId; text: string; lastEmittedLength: number }
  >;
  reasoningSequence: number;
  readonly turns: Array<PiTurnSnapshot>;
  activeTurnId: TurnId | undefined;
  abortingTurnId: TurnId | undefined;
  activeCompactionItemId: RuntimeItemId | undefined;
  defaultModelSlug: string | undefined;
  appliedModelSlug: string | undefined;
  appliedThinkingLevel: string | undefined;
  turnFailure: string | undefined;
  stopped: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPiToolCallId(value: unknown): string | undefined {
  // Pi guarantees a string ID for tool lifecycle events. Keep it byte-for-byte
  // so starts, updates, and completions share the provider's identity.
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPiResumeCursor(value: unknown): string | undefined {
  if (!isRecord(value) || value.schemaVersion !== PI_RESUME_VERSION) return undefined;
  return readString(value.sessionFile);
}

const TAKOMI_TOOL_FAMILIES = {
  takomi_mode: "status",
  takomi_apply_routing_policy: "configuration",
  takomi_config_routing: "configuration",
  takomi_workflow: "lifecycle",
  takomi_board: "lifecycle",
  takomi_subagent: "execution",
  skill_index: "collection",
  skill_manifest: "collection",
  skill_load: "collection",
  policy_manifest: "collection",
  policy_load: "collection",
  context_report: "report",
  todo: "lifecycle",
} as const;

type TakomiToolName = keyof typeof TAKOMI_TOOL_FAMILIES;

type PiResourceSettings = {
  readonly extensions: readonly string[];
  readonly packages: readonly string[];
};

function parsePiResourceSettings(raw: string): PiResourceSettings {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      extensions: Array.isArray(parsed.extensions)
        ? parsed.extensions.filter((value): value is string => typeof value === "string")
        : [],
      packages: Array.isArray(parsed.packages)
        ? parsed.packages.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return { extensions: [], packages: [] };
  }
}

function npmPackageName(source: string): string | undefined {
  if (!source.startsWith("npm:")) return undefined;
  const spec = source.slice("npm:".length);
  if (!spec) return undefined;
  if (!spec.startsWith("@")) return spec.split("@", 1)[0] || undefined;
  const slash = spec.indexOf("/");
  if (slash < 0) return undefined;
  const version = spec.indexOf("@", slash);
  return version < 0 ? spec : spec.slice(0, version);
}

function packageExtensionEntries(raw: string): readonly string[] {
  try {
    const parsed = JSON.parse(raw) as { pi?: { extensions?: unknown } };
    return Array.isArray(parsed.pi?.extensions)
      ? parsed.pi.extensions.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function discoverPiCompanionExtensions(input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly environment: NodeJS.ProcessEnv;
  readonly homePath: string;
}) {
  return Effect.gen(function* () {
    const configuredHome =
      readString(input.homePath) ?? readString(input.environment.PI_CODING_AGENT_DIR);
    const userHome =
      readString(input.environment.USERPROFILE) ?? readString(input.environment.HOME);
    const agentDir =
      configuredHome ?? (userHome ? input.path.join(userHome, ".pi", "agent") : undefined);
    if (!agentDir) return [];

    const settingsRaw = yield* input.fileSystem
      .readFileString(input.path.join(agentDir, "settings.json"))
      .pipe(Effect.orElseSucceed(() => ""));
    const resourceSettings = parsePiResourceSettings(settingsRaw);
    const candidates = resourceSettings.extensions.map((extensionPath) =>
      input.path.isAbsolute(extensionPath)
        ? extensionPath
        : input.path.resolve(agentDir, extensionPath),
    );

    const globalExtensionsDir = input.path.join(agentDir, "extensions");
    const globalEntries = yield* input.fileSystem
      .readDirectory(globalExtensionsDir)
      .pipe(Effect.orElseSucceed(() => [] as string[]));
    for (const entry of globalEntries) {
      const extensionName = entry.replace(/\.ts$/u, "");
      if (
        TAKOMI_EXTENSION_NAMES.includes(extensionName as (typeof TAKOMI_EXTENSION_NAMES)[number])
      ) {
        continue;
      }
      candidates.push(
        entry.endsWith(".ts")
          ? input.path.join(globalExtensionsDir, entry)
          : input.path.join(globalExtensionsDir, entry, "index.ts"),
      );
    }

    for (const source of resourceSettings.packages) {
      const packageName = npmPackageName(source);
      if (!packageName) continue;
      const packageDir = input.path.join(
        agentDir,
        "npm",
        "node_modules",
        ...packageName.split("/"),
      );
      const manifestRaw = yield* input.fileSystem
        .readFileString(input.path.join(packageDir, "package.json"))
        .pipe(Effect.orElseSucceed(() => ""));
      for (const extensionPath of packageExtensionEntries(manifestRaw)) {
        candidates.push(input.path.resolve(packageDir, extensionPath));
      }
    }

    const existing = yield* Effect.filter([...new Set(candidates)], (candidate) =>
      input.fileSystem.exists(candidate).pipe(Effect.orElseSucceed(() => false)),
    );
    return existing;
  });
}

function takomiFamily(toolName: string): ToolPresentationEnvelope["family"] | undefined {
  const normalized = toolName.toLowerCase();
  if (normalized.startsWith("takomi_flow_")) return "execution";
  return TAKOMI_TOOL_FAMILIES[normalized as TakomiToolName];
}

function classifyTool(toolName: string): ToolLifecycleItemType {
  const name = toolName.toLowerCase();
  if (name === "takomi_subagent") return "collab_agent_tool_call";
  if (takomiFamily(name)) return "dynamic_tool_call";
  if (name.includes("bash") || name.includes("command") || name.includes("shell")) {
    return "command_execution";
  }
  // Pi's built-in `read` and common `read_file` extension tool are read-only.
  // Check them before the broad file-name fallback below.
  if (name === "read" || name === "read_file") return "dynamic_tool_call";
  if (
    name.includes("edit") ||
    name.includes("write") ||
    name.includes("patch") ||
    name.includes("file")
  ) {
    return "file_change";
  }
  if (name.includes("subagent") || name.includes("agent") || name.includes("task")) {
    return "collab_agent_tool_call";
  }
  if (name.includes("web") || name.includes("search")) return "web_search";
  if (name.includes("image")) return "image_view";
  if (name.includes("mcp")) return "mcp_tool_call";
  return "dynamic_tool_call";
}

function filePathsFromToolArgs(args: unknown): Array<{ readonly path: string }> {
  const input = isRecord(args) ? args : undefined;
  if (!input) return [];
  const paths = new Set<string>();
  for (const value of [input.path, input.filePath, input.filename, input.newPath, input.oldPath]) {
    const path = readString(value);
    if (path) paths.add(path);
  }
  const patch = typeof input.patch === "string" ? input.patch : undefined;
  if (patch) {
    for (const match of patch.matchAll(/^\*\*\* (?:Add|Delete|Update) File: (.+)$/gmu)) {
      const path = readString(match[1]);
      if (path) paths.add(path);
    }
  }
  return [...paths].map((path) => ({ path }));
}

export function normalizePiToolWorkLog(input: {
  readonly toolCallId: unknown;
  readonly syntheticToolCallId?: string;
  readonly toolName: string;
  readonly args: unknown;
  readonly result: unknown;
  readonly partialResult: unknown;
}) {
  const suppliedToolCallId = readPiToolCallId(input.toolCallId);
  const toolCallId = suppliedToolCallId ?? input.syntheticToolCallId;
  if (!toolCallId) return undefined;

  const itemType = classifyTool(input.toolName);
  const rawOutput = input.partialResult ?? input.result;
  const args = firstRecord(input.args);
  const command = readString(args?.command ?? args?.cmd);
  const data = {
    toolCallId,
    ...(suppliedToolCallId
      ? {}
      : {
          warning: "Pi tool lifecycle event was missing toolCallId; rendered as an isolated item.",
        }),
    toolName: input.toolName,
    args: input.args,
    ...(input.result !== undefined ? { result: input.result } : {}),
    ...(input.partialResult !== undefined ? { partialResult: input.partialResult } : {}),
    ...(itemType === "command_execution"
      ? {
          ...(command ? { command } : {}),
          ...(rawOutput !== undefined ? { rawOutput } : {}),
        }
      : {}),
    ...(itemType === "file_change" ? { files: filePathsFromToolArgs(input.args) } : {}),
  };
  return { itemType, data };
}

const PRESENTATION_DETAIL_LIMIT = 600;
const PRESENTATION_INSPECTOR_DETAIL_LIMIT = 16_000;
const PRESENTATION_ITEM_LIMIT = 12;
const PRESENTATION_ACTIVITY_LIMIT = 120;
const PRESENTATION_ARTIFACT_LIMIT = 8;
const SETTLED_TOOL_CALL_ID_LIMIT = 100;

type TakomiTaskStatus =
  | "pending"
  | "running"
  | "waiting"
  | "idle"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type TakomiSubagentTask = {
  readonly taskId: string;
  readonly description: string;
  readonly status: TakomiTaskStatus;
  readonly summary?: string;
  readonly lastToolName?: string;
  readonly error?: string;
  readonly title?: string;
  readonly role?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly typedUsage?: RuntimeTaskUsage;
  readonly parentAgentId?: string;
  readonly workflowName?: string;
  readonly agentIndex?: number;
  readonly phaseIndex?: number;
  readonly phaseTitle?: string;
  /** Native identifier for inspection only; taskId stays Pi-tool-call based. */
  readonly runHandles?: { readonly runId: string };
  readonly taskType: "local_agent" | "local_workflow";
};

export type TakomiSubagentTaskEvent =
  | { readonly type: "started"; readonly task: TakomiSubagentTask }
  | { readonly type: "progress"; readonly task: TakomiSubagentTask }
  | { readonly type: "updated"; readonly task: TakomiSubagentTask }
  | {
      readonly type: "completed";
      readonly task: TakomiSubagentTask;
      readonly completionStatus: "completed" | "failed" | "stopped";
    };

export interface TakomiSubagentTaskTracker {
  observe(input: {
    readonly toolCallId: string;
    readonly tasks: readonly TakomiSubagentTask[];
    readonly lifecycleStatus: "inProgress" | "completed" | "failed";
  }): readonly TakomiSubagentTaskEvent[];
}

function boundedText(value: unknown, limit = PRESENTATION_DETAIL_LIMIT): string | undefined {
  const text = readString(value);
  if (!text) return undefined;
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | undefined {
  return values.find(isRecord);
}

function readFiniteCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

type ToolPresentationItem = NonNullable<
  NonNullable<ToolPresentationEnvelope["summary"]>["items"]
>[number];

function resolveTakomiChildIdentity(value: unknown, resultIndex: number): string {
  const record = isRecord(value) ? value : undefined;
  const rawId =
    record?.id ?? record?.taskId ?? record?.task_id ?? record?.agentId ?? record?.agent_id;
  const id =
    typeof rawId === "number" && Number.isFinite(rawId) ? String(rawId) : readString(rawId);
  return boundedText(id, 120) ?? `result-${resultIndex}`;
}

function normalizePresentationItems(
  value: unknown,
  itemLimit = PRESENTATION_ITEM_LIMIT,
  resolveItemId?: (entry: unknown, index: number) => string,
): ToolPresentationItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, itemLimit).flatMap((entry, index) => {
    const record = isRecord(entry) ? entry : undefined;
    const label = boundedText(
      record?.label ??
        record?.name ??
        record?.subject ??
        record?.title ??
        record?.agent ??
        record?.task ??
        record?.id ??
        entry,
      160,
    );
    if (!label) return [];
    const rawId =
      resolveItemId?.(entry, index) ??
      record?.id ??
      record?.taskId ??
      record?.task_id ??
      record?.agentId ??
      record?.agent_id ??
      `${index}`;
    const id = boundedText(typeof rawId === "number" ? String(rawId) : rawId, 120)!;
    const exitCode = typeof record?.exitCode === "number" ? record.exitCode : undefined;
    const status =
      boundedText(record?.status ?? record?.state, 80) ??
      (exitCode === undefined ? undefined : exitCode === 0 ? "completed" : "failed");
    const metadata = [record?.stage, record?.role, record?.agent, record?.model]
      .map(readString)
      .filter((value): value is string => value !== undefined)
      .join(" · ");
    const detail =
      boundedText(
        record?.detail ??
          record?.description ??
          record?.activeForm ??
          record?.message ??
          record?.reason ??
          record?.task,
        180,
      ) ?? metadata;
    return [{ id, label, ...(status ? { status } : {}), ...(detail ? { detail } : {}) }];
  });
}

type ToolPresentationActivity = NonNullable<ToolPresentationEnvelope["activity"]>[number];

type ToolPresentationArtifact = NonNullable<ToolPresentationEnvelope["artifactRefs"]>[number];

function normalizeSubagentActivity(
  source: Record<string, unknown>,
  lifecycleStatus: "inProgress" | "completed" | "failed",
): ToolPresentationActivity[] {
  const results = Array.isArray(source.results) ? source.results : [];
  const progressRows = Array.isArray(source.progress) ? source.progress : [];
  const activity: ToolPresentationActivity[] = [];

  for (const [resultIndex, value] of results.entries()) {
    const result = isRecord(value) ? value : undefined;
    if (!result) continue;
    const agent =
      boundedText(result.agent ?? result.agentName, 80) ?? `Subagent ${resultIndex + 1}`;
    const agentId = resolveTakomiChildIdentity(result, resultIndex);
    const agentLabel = results.length > 1 ? `Task ${resultIndex + 1} · ${agent}` : agent;
    const allMessages = Array.isArray(result.messages) ? result.messages : [];
    const messageOffset = Math.max(0, allMessages.length - 80);
    const messages = allMessages.slice(messageOffset);
    for (const [localMessageIndex, messageValue] of messages.entries()) {
      const messageIndex = messageOffset + localMessageIndex;
      const message = isRecord(messageValue) ? messageValue : undefined;
      if (!message) continue;
      const role = boundedText(message.role, 40) ?? "message";
      const content = Array.isArray(message.content) ? message.content : [];
      for (const [partIndex, partValue] of content.entries()) {
        const part = isRecord(partValue) ? partValue : undefined;
        if (!part) continue;
        if (part.type === "thinking") {
          const detail = boundedText(part.thinking, 2_400);
          if (detail) {
            activity.push({
              id: `result-${resultIndex}-message-${messageIndex}-thinking-${partIndex}`,
              agentId,
              kind: "thinking",
              label: `${agentLabel} thinking`,
              detail,
            });
          }
          continue;
        }
        if (part.type !== "toolCall" && part.type !== "tool_call") continue;
        const toolName = boundedText(part.name ?? part.toolName, 100) ?? "Tool call";
        const detail = boundedText(jsonString(part.arguments ?? part.args), 500);
        activity.push({
          id: `result-${resultIndex}-message-${messageIndex}-tool-${partIndex}`,
          agentId,
          kind: "tool",
          label: toolName,
          ...(detail ? { detail } : {}),
          status: "completed",
        });
      }
      const text = boundedText(extractText(message.content), 1_200);
      if (text) {
        activity.push({
          id: `result-${resultIndex}-message-${messageIndex}`,
          agentId,
          kind: "message",
          label:
            role === "assistant"
              ? `${agentLabel} response`
              : role === "user"
                ? `${agentLabel} prompt`
                : `${agentLabel} · ${role}`,
          detail: text,
        });
      }
    }

    const allToolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
    const toolCallOffset = Math.max(0, allToolCalls.length - 80);
    const toolCalls = allToolCalls.slice(toolCallOffset);
    for (const [localToolIndex, toolValue] of toolCalls.entries()) {
      const toolIndex = toolCallOffset + localToolIndex;
      const tool = isRecord(toolValue) ? toolValue : undefined;
      if (!tool) continue;
      const label = boundedText(tool.text, 180) ?? "Tool call";
      const detail = boundedText(tool.expandedText, 1_200);
      activity.push({
        id: `result-${resultIndex}-tool-summary-${toolIndex}`,
        agentId,
        kind: "tool",
        label,
        ...(detail && detail !== label ? { detail } : {}),
        status: "completed",
      });
    }

    const progress = firstRecord(result.progress, progressRows[resultIndex]);
    if (!progress) continue;
    const recentTools = Array.isArray(progress.recentTools) ? progress.recentTools.slice(-8) : [];
    for (const [toolIndex, toolValue] of recentTools.entries()) {
      const tool = isRecord(toolValue) ? toolValue : undefined;
      if (!tool) continue;
      const label = boundedText(tool.tool ?? tool.name, 100) ?? "Tool call";
      const detail = boundedText(tool.args, 500);
      const endedAt =
        typeof tool.endMs === "number" && Number.isFinite(tool.endMs) ? String(tool.endMs) : label;
      activity.push({
        id: `result-${resultIndex}-recent-tool-${toolIndex}-${endedAt}`,
        agentId,
        kind: "tool",
        label,
        ...(detail ? { detail } : {}),
        status: "completed",
      });
    }
    const currentTool = boundedText(progress.currentTool, 100);
    const recentOutput = Array.isArray(progress.recentOutput)
      ? progress.recentOutput.filter((line): line is string => typeof line === "string").slice(-8)
      : [];
    const activityDetail = boundedText(
      currentTool ? progress.currentToolArgs : recentOutput.join("\n"),
      1_200,
    );
    if (currentTool || activityDetail) {
      const resultStatus = normalizeTakomiTaskStatus(result.status ?? result.state);
      activity.push({
        id: `result-${resultIndex}-status`,
        agentId,
        kind: "status",
        label: currentTool ? `${agentLabel} · ${currentTool}` : `${agentLabel} latest output`,
        ...(activityDetail ? { detail: activityDetail } : {}),
        status:
          resultStatus && isTerminalTakomiTaskStatus(resultStatus)
            ? resultStatus
            : lifecycleStatus === "completed" || lifecycleStatus === "failed"
              ? lifecycleStatus
              : currentTool
                ? "running"
                : (boundedText(result.status ?? result.state, 80) ?? lifecycleStatus),
      });
    }
  }

  return activity;
}

function normalizeTakomiTaskStatus(value: unknown): TakomiTaskStatus | undefined {
  switch (readString(value)?.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_")) {
    case "pending":
    case "queued":
      return "pending";
    case "running":
    case "in_progress":
    case "active":
      return "running";
    case "waiting":
    case "blocked":
      return "waiting";
    case "idle":
    case "paused":
      return "idle";
    case "completed":
    case "complete":
    case "success":
    case "succeeded":
    case "done":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "detached":
    case "stopped":
    case "aborted":
    case "interrupted":
      return "interrupted";
    default:
      return undefined;
  }
}

function isTerminalTakomiTaskStatus(status: TakomiTaskStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
  );
}

function takomiTaskCompletionStatus(status: TakomiTaskStatus): "completed" | "failed" | "stopped" {
  switch (status) {
    case "completed":
    case "failed":
      return status;
    case "cancelled":
    case "interrupted":
      return "stopped";
    default:
      return "stopped";
  }
}

function readTakomiTaskId(value: Record<string, unknown>): string | undefined {
  return readString(value.taskId ?? value.task_id ?? value.agentId ?? value.agent_id ?? value.id);
}

function nativeTakomiTaskStatus(
  record: Record<string, unknown>,
  fallback: TakomiTaskStatus,
): TakomiTaskStatus {
  if (record.detached === true || record.interrupted === true || record.stopped === true) {
    return "interrupted";
  }
  if (readString(record.error ?? record.errorMessage)) return "failed";
  if (typeof record.exitCode === "number") return record.exitCode === 0 ? "completed" : "failed";
  return normalizeTakomiTaskStatus(record.status ?? record.state) ?? fallback;
}

function takomiTaskUsage(
  record: Record<string, unknown>,
  progress: Record<string, unknown> | undefined,
): RuntimeTaskUsage | undefined {
  const usage = firstRecord(record.usage, progress?.usage);
  const tokenUsage = firstRecord(record.totalTokens, progress?.totalTokens);
  const inputTokens = readFiniteCount(usage?.input ?? tokenUsage?.input);
  const cachedInputTokens = readFiniteCount(usage?.cacheRead ?? tokenUsage?.cacheRead);
  const outputTokens = readFiniteCount(usage?.output ?? tokenUsage?.output);
  const totalTokens =
    readFiniteCount(tokenUsage?.total) ??
    readFiniteCount(record.tokens ?? progress?.tokens) ??
    (inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined);
  const durationMs =
    readFiniteCount(record.durationMs ?? progress?.durationMs) ??
    (typeof record.startedAt === "number" && typeof record.endedAt === "number"
      ? readFiniteCount(record.endedAt - record.startedAt)
      : undefined);
  const toolUses = readFiniteCount(record.toolCount ?? progress?.toolCount);
  if (totalTokens === undefined && durationMs === undefined && toolUses === undefined) {
    return undefined;
  }
  return {
    totalTokens: totalTokens ?? 0,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(toolUses !== undefined ? { toolUses } : {}),
  };
}

function takomiTaskFromRecord(
  value: unknown,
  defaults: {
    readonly status: TakomiTaskStatus;
    readonly taskId?: string;
    readonly parentAgentId?: string;
    readonly workflowName?: string;
    readonly agentIndex?: number;
    readonly phaseIndex?: number;
    readonly phaseTitle?: string;
  },
): TakomiSubagentTask | undefined {
  const record = isRecord(value) ? value : undefined;
  if (!record) return undefined;
  const taskId = defaults.taskId ?? readTakomiTaskId(record);
  if (!taskId) return undefined;
  const progress = firstRecord(record.progress);
  const title = boundedText(
    record.title ??
      record.name ??
      record.label ??
      record.agentName ??
      record.agent ??
      record.description ??
      record.task,
    240,
  );
  const summary = boundedText(
    record.summary ??
      record.finalOutput ??
      record.detail ??
      record.message ??
      record.activity ??
      (Array.isArray(record.recentOutput)
        ? record.recentOutput.filter((line): line is string => typeof line === "string").join("\n")
        : undefined) ??
      (Array.isArray(progress?.recentOutput)
        ? progress.recentOutput
            .filter((line): line is string => typeof line === "string")
            .join("\n")
        : undefined),
    1_200,
  );
  const lastToolName = boundedText(
    record.lastToolName ?? record.last_tool_name ?? record.currentTool ?? progress?.currentTool,
    100,
  );
  const error = boundedText(record.error ?? record.errorMessage, 1_200);
  const role = boundedText(record.role ?? record.subagentType ?? record.subagent_type, 120);
  const model = boundedText(record.model ?? record.modelId ?? record.model_id, 160);
  const effort = boundedText(record.effort ?? record.thinkingLevel ?? record.thinking_level, 80);
  const typedUsage = takomiTaskUsage(record, progress);
  const agentIndex =
    readFiniteCount(record.agentIndex ?? record.agent_index ?? record.index ?? record.flatIndex) ??
    defaults.agentIndex;
  return {
    taskId,
    description: title ?? taskId,
    status: nativeTakomiTaskStatus(record, defaults.status),
    ...(summary ? { summary } : {}),
    ...(lastToolName ? { lastToolName } : {}),
    ...(error ? { error } : {}),
    ...(title ? { title } : {}),
    ...(role ? { role } : {}),
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
    ...(typedUsage ? { typedUsage } : {}),
    ...(defaults.parentAgentId ? { parentAgentId: defaults.parentAgentId } : {}),
    ...(defaults.workflowName ? { workflowName: defaults.workflowName } : {}),
    ...(agentIndex !== undefined ? { agentIndex } : {}),
    ...(defaults.phaseIndex !== undefined ? { phaseIndex: defaults.phaseIndex } : {}),
    ...(defaults.phaseTitle ? { phaseTitle: defaults.phaseTitle } : {}),
    taskType: "local_agent",
  };
}

function workflowGraphNodes(value: unknown): readonly Record<string, unknown>[] {
  const graph = isRecord(value) ? value : undefined;
  if (!graph || !Array.isArray(graph.nodes)) return [];
  const visit = (nodes: readonly unknown[]): Record<string, unknown>[] =>
    nodes.flatMap((node) => {
      const record = isRecord(node) ? node : undefined;
      if (!record) return [];
      return [record, ...visit(Array.isArray(record.children) ? record.children : [])];
    });
  return visit(graph.nodes);
}

function isTakomiDetails(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.results) ||
    Array.isArray(value.progress) ||
    Array.isArray(value.workflowGraph) ||
    isRecord(value.workflowGraph) ||
    readString(value.mode) !== undefined
  );
}

/** Accept Pi's live Details payload and the final result wrapper. */
function takomiDetailsSnapshots(value: unknown): readonly Record<string, unknown>[] {
  const payload = isRecord(value) ? value : undefined;
  if (!payload) return [];
  const nestedDetails = firstRecord(payload.details);
  if (nestedDetails) return [nestedDetails];
  return isTakomiDetails(payload) ? [payload] : [];
}

/** Normalize native pi-subagents Details snapshots into Pi-tool-call-stable tasks. */
export function normalizeTakomiSubagentTasks(input: {
  readonly toolCallId: string;
  readonly result: unknown;
  readonly partialResult: unknown;
  readonly lifecycleStatus: "inProgress" | "completed" | "failed";
}): readonly TakomiSubagentTask[] {
  const sources = [
    ...takomiDetailsSnapshots(input.partialResult),
    ...takomiDetailsSnapshots(input.result),
  ];
  const fallbackStatus: TakomiTaskStatus =
    input.lifecycleStatus === "failed"
      ? "failed"
      : input.lifecycleStatus === "completed"
        ? "completed"
        : "running";
  const tasks = new Map<string, TakomiSubagentTask>();

  for (const source of sources) {
    const graph = firstRecord(source.workflowGraph);
    const nativeRunId = readString(source.runId ?? graph?.runId);
    const workflowName = boundedText(graph?.mode ?? source.mode, 240);
    const rows = new Map<number, Record<string, unknown>>();
    const add = (index: number | undefined, value: unknown) => {
      const row = isRecord(value) ? value : undefined;
      if (index === undefined || !row) return;
      rows.set(index, { ...rows.get(index), ...row });
    };

    if (Array.isArray(source.results)) {
      source.results.forEach((result, arrayIndex) => {
        const child = isRecord(result) ? result : undefined;
        // The native index survives sparse/reordered Details snapshots. Array
        // position is the stable fallback used by older Pi extension versions.
        const index = readFiniteCount(child?.index) ?? arrayIndex;
        add(index, result);
        const progress = firstRecord(child?.progress);
        if (progress) add(readFiniteCount(progress.index) ?? index, progress);
      });
    }
    if (Array.isArray(source.progress)) {
      source.progress.forEach((progress, arrayIndex) => {
        const record = isRecord(progress) ? progress : undefined;
        add(readFiniteCount(record?.index) ?? arrayIndex, progress);
      });
    }
    for (const node of workflowGraphNodes(graph)) {
      const flatIndex = readFiniteCount(node.flatIndex);
      if (flatIndex === undefined) continue;
      const { id: _graphNodeId, ...nodeFields } = node;
      add(flatIndex, nodeFields);
    }

    for (const [index, row] of rows) {
      const task = takomiTaskFromRecord(row, {
        status: fallbackStatus,
        taskId: `${input.toolCallId}:result:${index}`,
        parentAgentId: input.toolCallId,
        ...(workflowName ? { workflowName } : {}),
        agentIndex: index,
        ...(readFiniteCount(row.stepIndex) !== undefined
          ? { phaseIndex: readFiniteCount(row.stepIndex)! }
          : {}),
        ...(boundedText(row.phase, 120) ? { phaseTitle: boundedText(row.phase, 120)! } : {}),
      });
      if (!task) continue;
      tasks.set(task.taskId, {
        ...tasks.get(task.taskId),
        ...task,
        ...(nativeRunId ? { runHandles: { runId: nativeRunId } } : {}),
      });
    }

    if (rows.size > 0) {
      const children = [...tasks.values()].filter(
        (task) => task.parentAgentId === input.toolCallId,
      );
      const status = children.some((task) => task.status === "failed")
        ? "failed"
        : children.some((task) => task.status === "interrupted" || task.status === "cancelled")
          ? "interrupted"
          : children.length > 0 && children.every((task) => task.status === "completed")
            ? "completed"
            : nativeTakomiTaskStatus(source, fallbackStatus);
      tasks.set(input.toolCallId, {
        taskId: input.toolCallId,
        description: workflowName ?? input.toolCallId,
        status,
        ...(workflowName ? { title: workflowName, workflowName } : {}),
        ...(nativeRunId ? { runHandles: { runId: nativeRunId } } : {}),
        role: "coordinator",
        taskType: "local_workflow",
      });
    }
  }
  return [...tasks.values()];
}

function taskFingerprint(task: TakomiSubagentTask): string {
  return [
    task.status,
    task.description,
    task.summary ?? "",
    task.lastToolName ?? "",
    task.error ?? "",
    task.title ?? "",
    task.role ?? "",
    task.model ?? "",
    task.effort ?? "",
    task.typedUsage ? JSON.stringify(task.typedUsage) : "",
    task.parentAgentId ?? "",
    task.workflowName ?? "",
    task.agentIndex ?? "",
    task.phaseIndex ?? "",
    task.phaseTitle ?? "",
  ].join("\u001f");
}

export function createTakomiSubagentTaskTracker(): TakomiSubagentTaskTracker {
  const tasksByToolCallId = new Map<
    string,
    { readonly open: Map<string, TakomiSubagentTask>; readonly completed: Set<string> }
  >();
  const settledToolCallIds = new Set<string>();
  return {
    observe({ toolCallId, tasks, lifecycleStatus }) {
      if (settledToolCallIds.has(toolCallId)) return [];
      const state = tasksByToolCallId.get(toolCallId) ?? {
        open: new Map<string, TakomiSubagentTask>(),
        completed: new Set<string>(),
      };
      const events: TakomiSubagentTaskEvent[] = [];
      for (const task of tasks) {
        // A terminal snapshot may be repeated before the tool itself ends.
        // Never re-open a member that has already emitted task.completed.
        if (state.completed.has(task.taskId)) continue;
        const previous = state.open.get(task.taskId);
        const changed = !previous || taskFingerprint(previous) !== taskFingerprint(task);
        if (!previous) {
          events.push({ type: "started", task });
        } else if (changed) {
          events.push({ type: "updated", task });
        }
        // Native onUpdate repeatedly sends full Details snapshots. Re-emitting
        // an unchanged one makes the folded activity look like live progress.
        if (changed) events.push({ type: "progress", task });
        if (isTerminalTakomiTaskStatus(task.status)) {
          events.push({
            type: "completed",
            task,
            completionStatus: takomiTaskCompletionStatus(task.status),
          });
          state.open.delete(task.taskId);
          state.completed.add(task.taskId);
        } else {
          state.open.set(task.taskId, task);
        }
      }
      if (lifecycleStatus !== "inProgress") {
        const completionStatus = lifecycleStatus === "failed" ? "failed" : "completed";
        for (const task of state.open.values()) {
          events.push({ type: "completed", task, completionStatus });
          state.completed.add(task.taskId);
        }
        tasksByToolCallId.delete(toolCallId);
        settledToolCallIds.add(toolCallId);
        if (settledToolCallIds.size > SETTLED_TOOL_CALL_ID_LIMIT) {
          const oldestToolCallId = settledToolCallIds.values().next().value;
          if (oldestToolCallId) settledToolCallIds.delete(oldestToolCallId);
        }
      } else {
        tasksByToolCallId.set(toolCallId, state);
      }
      return events;
    },
  };
}

function normalizeArtifactRefs(value: unknown): ToolPresentationArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, PRESENTATION_ARTIFACT_LIMIT).flatMap((entry) => {
    const record = isRecord(entry) ? entry : undefined;
    const path = boundedText(record?.path ?? record?.filePath ?? record?.uri ?? entry, 260);
    if (!path) return [];
    const kind = boundedText(record?.kind ?? record?.type ?? "file", 80)!;
    const label = boundedText(record?.label ?? record?.name, 120);
    return [{ kind, path, ...(label ? { label } : {}) }];
  });
}

export function normalizeTakomiPresentation(input: {
  toolName: string;
  args: unknown;
  result: unknown;
  partialResult: unknown;
  isError: boolean;
  lifecycleStatus: "inProgress" | "completed" | "failed";
}): ToolPresentationEnvelope | undefined {
  const family = takomiFamily(input.toolName);
  if (!family) return undefined;
  const args = firstRecord(input.args) ?? {};
  const result = firstRecord(input.result, input.partialResult) ?? {};
  const structuredContent = firstRecord(result.structuredContent, result.details) ?? {};
  const source = { ...args, ...result, ...structuredContent };
  const takomiUx = firstRecord(source.takomiUx);
  const sourceTasks =
    input.toolName === "todo" && Array.isArray(source.tasks)
      ? source.tasks.filter((task) => !isRecord(task) || task.status !== "deleted")
      : source.tasks;
  const rawItems = normalizePresentationItems(
    sourceTasks ??
      takomiUx?.tasks ??
      source.stages ??
      source.agents ??
      source.items ??
      source.results ??
      (source.task ? [source.task] : undefined),
    // Todo is a durable task list, not a compact tool summary. Preserve the
    // entire list so its count and the expanded chat card stay truthful.
    input.toolName === "todo" ? Number.POSITIVE_INFINITY : PRESENTATION_ITEM_LIMIT,
    input.toolName === "takomi_subagent" ? resolveTakomiChildIdentity : undefined,
  );
  const items =
    input.toolName === "takomi_subagent" && input.lifecycleStatus !== "inProgress"
      ? rawItems.map((item) => {
          const status = normalizeTakomiTaskStatus(item.status);
          return status && isTerminalTakomiTaskStatus(status)
            ? item
            : { ...item, status: input.lifecycleStatus };
        })
      : rawItems;
  const artifactRefs = normalizeArtifactRefs(source.artifacts ?? source.files ?? source.assets);
  const modeDetail =
    input.toolName === "takomi_mode" && readString(source.mode)
      ? [
          `Mode: ${readString(source.mode)}`,
          readString(source.role) ? `Role: ${readString(source.role)}` : undefined,
          readString(source.stage) ? `Stage: ${readString(source.stage)}` : undefined,
          readString(source.reason) ? `Reason: ${readString(source.reason)}` : undefined,
        ]
          .filter(Boolean)
          .join("\n")
      : undefined;
  const rawDetailText =
    input.toolName === "todo" && items.length > 0
      ? undefined
      : (modeDetail ??
        source.summary ??
        source.message ??
        source.detail ??
        source.reason ??
        source.output ??
        extractText(input.result) ??
        extractText(input.partialResult));
  const detailText = boundedText(rawDetailText);
  const inspectorDetailText = boundedText(rawDetailText, PRESENTATION_INSPECTOR_DETAIL_LIMIT);
  const activity =
    input.toolName === "takomi_subagent"
      ? normalizeSubagentActivity(source, input.lifecycleStatus)
      : [];
  const action = boundedText(source.action ?? source.operation ?? source.phase, 120);
  const todoCompleted = items.filter((item) => item.status === "completed").length;
  const todoInProgress = items.some((item) => item.status === "in_progress");
  const sourceTakomiStatus = normalizeTakomiTaskStatus(source.status ?? source.state);
  const status = boundedText(
    (input.toolName === "takomi_subagent" && input.lifecycleStatus !== "inProgress"
      ? sourceTakomiStatus && isTerminalTakomiTaskStatus(sourceTakomiStatus)
        ? sourceTakomiStatus
        : input.lifecycleStatus
      : (source.status ?? source.state)) ??
      (input.toolName === "takomi_mode"
        ? source.mode
        : input.toolName === "takomi_subagent"
          ? input.lifecycleStatus
          : input.toolName === "todo"
            ? todoInProgress
              ? "in_progress"
              : items.length > 0 && todoCompleted === items.length
                ? "completed"
                : "pending"
            : undefined),
    80,
  );
  const sessionId = boundedText(source.sessionId ?? source.session ?? source.boardId, 120);
  const runId = boundedText(source.runId ?? source.run ?? source.workflowRunId, 120);
  const taskId = boundedText(source.taskId ?? source.task ?? source.id, 120);
  const mode = boundedText(
    input.toolName === "takomi_subagent" && (source.async === true || source.asyncId)
      ? "async"
      : source.mode,
    80,
  );
  const count = readFiniteCount(source.count ?? source.totalCount);
  const completed =
    input.toolName === "todo"
      ? todoCompleted
      : readFiniteCount(source.completed ?? source.completedCount);
  const total =
    input.toolName === "todo" ? items.length : readFiniteCount(source.total ?? source.totalCount);
  const summary = {
    ...(sessionId ? { sessionId } : {}),
    ...(runId ? { runId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(mode ? { mode } : {}),
    ...(status ? { status } : {}),
    ...(count !== undefined ? { count } : {}),
    ...(completed !== undefined ? { completed } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(items.length > 0 ? { items } : {}),
  };
  const errorMessage = boundedText(source.error ?? source.errorMessage ?? source.message);
  return {
    schemaVersion: 1,
    namespace: input.toolName.toLowerCase().startsWith("takomi_flow_") ? "takomi-flow" : "takomi",
    toolName: input.toolName,
    family,
    ...(action ? { action } : {}),
    ...(Object.keys(summary).length > 0 ? { summary } : {}),
    ...(detailText ? { detailText } : {}),
    ...(inspectorDetailText ? { inspectorDetailText } : {}),
    ...(activity.length > 0 ? { activity } : {}),
    ...(artifactRefs.length > 0 ? { artifactRefs } : {}),
    ...(input.isError
      ? { error: { severity: "error", message: errorMessage ?? "Tool call failed." } }
      : {}),
  };
}

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value
      .map(extractText)
      .filter((part): part is string => part !== undefined)
      .join("");
    return text.length > 0 ? text : undefined;
  }
  if (!isRecord(value)) return undefined;
  if (typeof value.text === "string") return value.text;
  if (value.content !== undefined) return extractText(value.content);
  return undefined;
}

function appendTurnItem(context: PiSessionContext, item: unknown): void {
  const turnId = context.activeTurnId;
  if (!turnId) return;
  let turn = context.turns.find((candidate) => candidate.id === turnId);
  if (!turn) {
    turn = { id: turnId, items: [] };
    context.turns.push(turn);
  }
  turn.items.push(item);
}

function firstAnswer(answers: ProviderUserInputAnswers, requestId: string): unknown {
  if (requestId in answers) return answers[requestId];
  return Object.values(answers)[0];
}

export function makePiAdapter(settings: PiSettings, options: PiAdapterOptions) {
  return Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const serverConfig = yield* ServerConfig;
    const sessions = new Map<ThreadId, PiSessionContext>();
    const runtimeEvents = yield* Queue.unbounded<ProviderRuntimeEvent>();
    const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
    const randomId = crypto.randomUUIDv4.pipe(
      Effect.mapError(
        (cause) =>
          new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "crypto/randomUUIDv4",
            detail: "Failed to generate a Pi runtime identifier.",
            cause,
          }),
      ),
    );

    const emit = (event: ProviderRuntimeEvent) =>
      Queue.offer(runtimeEvents, event).pipe(Effect.asVoid);
    const stamp = () =>
      Effect.all({
        eventId: randomId.pipe(Effect.map(EventId.make)),
        createdAt: nowIso,
      });
    const eventBase = (context: PiSessionContext, message?: PiRpcMessage) =>
      Effect.map(stamp(), (value) => ({
        ...value,
        provider: PROVIDER,
        providerInstanceId: options.instanceId,
        threadId: context.session.threadId,
        ...(context.activeTurnId ? { turnId: context.activeTurnId } : {}),
        ...(message
          ? {
              raw: {
                source: "pi.eventmsg" as const,
                ...(readString(message.type) ? { method: message.type } : {}),
                payload: message,
              },
            }
          : {}),
      }));

    const getReasoningBlock = (context: PiSessionContext, contentIndex: number) => {
      const existing = context.reasoningBlocks.get(contentIndex);
      if (existing) return existing;
      const block = {
        taskId: RuntimeTaskId.make(
          `pi-reasoning-${context.activeTurnId ?? context.session.threadId}-${context.reasoningSequence++}`,
        ),
        text: "",
        lastEmittedLength: 0,
      };
      context.reasoningBlocks.set(contentIndex, block);
      return block;
    };

    const emitReasoningProgress = Effect.fn("emitPiReasoningProgress")(function* (
      context: PiSessionContext,
      contentIndex: number,
      message: PiRpcMessage,
      force: boolean,
    ) {
      const block = context.reasoningBlocks.get(contentIndex);
      const text = boundedText(block?.text, REASONING_DETAIL_LIMIT);
      if (
        !block ||
        !text ||
        (!force && block.text.length - block.lastEmittedLength < REASONING_EMIT_INTERVAL)
      ) {
        return;
      }
      block.lastEmittedLength = block.text.length;
      yield* emit({
        ...(yield* eventBase(context, message)),
        type: "task.progress",
        payload: {
          taskId: block.taskId,
          taskType: "reasoning",
          description: "Thinking",
          summary: text,
        },
      });
    });

    const emitTakomiSubagentTasks = Effect.fn("emitPiTakomiSubagentTasks")(function* (
      context: PiSessionContext,
      message: PiRpcMessage,
      toolCallId: string,
      lifecycleStatus: "inProgress" | "completed" | "failed",
    ) {
      const tasks = normalizeTakomiSubagentTasks({
        toolCallId,
        result: message.result,
        partialResult: message.partialResult,
        lifecycleStatus,
      });
      for (const event of context.takomiSubagentTaskTracker.observe({
        toolCallId,
        tasks,
        lifecycleStatus,
      })) {
        const linkage = {
          taskType: event.task.taskType,
          ...(event.task.title ? { title: event.task.title } : {}),
          ...(event.task.role ? { role: event.task.role } : {}),
          ...(event.task.model ? { model: event.task.model } : {}),
          ...(event.task.effort ? { effort: event.task.effort } : {}),
          ...(event.task.parentAgentId ? { parentAgentId: event.task.parentAgentId } : {}),
          ...(event.task.workflowName ? { workflowName: event.task.workflowName } : {}),
          ...(event.task.agentIndex !== undefined ? { agentIndex: event.task.agentIndex } : {}),
          ...(event.task.phaseIndex !== undefined ? { phaseIndex: event.task.phaseIndex } : {}),
          ...(event.task.phaseTitle ? { phaseTitle: event.task.phaseTitle } : {}),
          ...(event.task.runHandles ? { runHandles: event.task.runHandles } : {}),
          timelineBypass: true,
        } as const;
        const base = yield* eventBase(context, message);
        switch (event.type) {
          case "started":
            yield* emit({
              ...base,
              type: "task.started",
              payload: {
                taskId: RuntimeTaskId.make(event.task.taskId),
                description: event.task.description,
                ...linkage,
              },
            });
            break;
          case "progress":
            yield* emit({
              ...base,
              type: "task.progress",
              payload: {
                taskId: RuntimeTaskId.make(event.task.taskId),
                description: event.task.description,
                ...(event.task.summary ? { summary: event.task.summary } : {}),
                ...(event.task.lastToolName ? { lastToolName: event.task.lastToolName } : {}),
                ...(event.task.error ? { error: event.task.error } : {}),
                ...(event.task.typedUsage ? { typedUsage: event.task.typedUsage } : {}),
                status: event.task.status,
                ...linkage,
              },
            });
            break;
          case "updated":
            yield* emit({
              ...base,
              type: "task.updated",
              payload: {
                taskId: RuntimeTaskId.make(event.task.taskId),
                ...(isTerminalTakomiTaskStatus(event.task.status)
                  ? {}
                  : { status: event.task.status }),
                ...(event.task.error ? { error: event.task.error } : {}),
                ...linkage,
              },
            });
            break;
          case "completed":
            yield* emit({
              ...base,
              type: "task.completed",
              payload: {
                taskId: RuntimeTaskId.make(event.task.taskId),
                status: event.completionStatus,
                ...(event.task.summary ? { summary: event.task.summary } : {}),
                ...(event.task.typedUsage ? { typedUsage: event.task.typedUsage } : {}),
                ...linkage,
              },
            });
            break;
        }
      }
    });

    const sendRpc = (context: PiSessionContext, message: Record<string, unknown>) =>
      Effect.gen(function* () {
        const encoded = jsonString(message);
        if (encoded === undefined) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: readString(message.type) ?? "rpc",
            detail: "Failed to encode a Pi RPC command.",
          });
        }
        yield* Queue.offer(context.input, encoder.encode(`${encoded}\n`));
      });

    const requestRpc = Effect.fn("requestPiRpc")(function* (
      context: PiSessionContext,
      command: Record<string, unknown> & { readonly type: string },
    ) {
      const id = `${command.type}-${yield* randomId}`;
      const response = yield* Deferred.make<PiRpcMessage>();
      context.pendingRpc.set(id, response);
      yield* sendRpc(context, { ...command, id }).pipe(
        Effect.onError(() => Effect.sync(() => context.pendingRpc.delete(id))),
      );
      const result = yield* Deferred.await(response).pipe(Effect.timeoutOption("30 seconds"));
      context.pendingRpc.delete(id);
      if (Option.isNone(result)) {
        return yield* new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: command.type,
          detail: `Timed out waiting for Pi RPC response to '${command.type}'.`,
        });
      }
      return result.value;
    });

    const ensureContext = (
      threadId: ThreadId,
    ): Effect.Effect<PiSessionContext, ProviderAdapterSessionNotFoundError> => {
      const context = sessions.get(threadId);
      if (!context || context.stopped) {
        return Effect.fail(
          new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId }),
        );
      }
      return Effect.succeed(context);
    };

    const completeTurn = Effect.fn("completePiTurn")(function* (
      context: PiSessionContext,
      state: "completed" | "failed" | "interrupted" | "cancelled",
      message?: string,
    ) {
      const turnId = context.activeTurnId;
      if (!turnId) return;
      yield* emit({
        ...(yield* eventBase(context)),
        type: "turn.completed",
        turnId,
        payload: {
          state,
          ...(message ? { errorMessage: message } : {}),
        },
      });
      context.activeTurnId = undefined;
      context.reasoningBlocks.clear();
      context.turnFailure = undefined;
      const nextSession = {
        ...context.session,
        status: state === "failed" ? ("error" as const) : ("ready" as const),
        updatedAt: yield* nowIso,
        ...(state === "failed" && message ? { lastError: message } : {}),
      };
      delete (nextSession as { activeTurnId?: TurnId }).activeTurnId;
      context.session = nextSession;
    });

    const handleUiRequest = Effect.fn("handlePiUiRequest")(function* (
      context: PiSessionContext,
      message: PiRpcMessage,
    ) {
      const id = readString(message.id);
      const method = readString(message.method);
      if (!id || !method) return;

      if (method === "notify") {
        const notification = readString(message.message);
        if (notification) {
          yield* emit({
            ...(yield* eventBase(context, message)),
            type: "runtime.warning",
            payload: { message: notification },
          });
        }
        return;
      }

      if (!(["confirm", "select", "input", "editor"] as const).includes(method as PiUiMethod)) {
        return;
      }

      const requestId = ApprovalRequestId.make(id);
      const uiMethod = method as PiUiMethod;
      context.pendingUi.set(requestId, { method: uiMethod, requestId });
      if (uiMethod === "confirm") {
        yield* emit({
          ...(yield* eventBase(context, message)),
          type: "request.opened",
          requestId: RuntimeRequestId.make(id),
          payload: {
            requestType: "dynamic_tool_call",
            detail:
              [readString(message.title), readString(message.message)].filter(Boolean).join("\n") ||
              "Pi requested confirmation.",
            args: message,
          },
        });
        return;
      }

      const options = Array.isArray(message.options)
        ? message.options
            .filter((option): option is string => typeof option === "string" && option.length > 0)
            .map((option) => ({ label: option, description: option }))
        : [];
      yield* emit({
        ...(yield* eventBase(context, message)),
        type: "user-input.requested",
        requestId: RuntimeRequestId.make(id),
        payload: {
          questions: [
            {
              id,
              header: readString(message.title) ?? "Pi input",
              question:
                readString(message.message) ??
                readString(message.placeholder) ??
                "Provide a response to continue.",
              options,
            },
          ],
        },
      });
    });

    const handleMessage = Effect.fn("handlePiRpcMessage")(function* (
      context: PiSessionContext,
      message: PiRpcMessage,
    ) {
      if (message.type === "extension_ui_request") {
        yield* handleUiRequest(context, message);
        return;
      }

      if (message.type === "response") {
        const responseId = readString(message.id);
        const pendingResponse = responseId ? context.pendingRpc.get(responseId) : undefined;
        const command = readString(message.command);
        if (command === "get_state" && message.success === true && isRecord(message.data)) {
          const sessionFile = readString(message.data.sessionFile);
          const sessionId = readString(message.data.sessionId);
          const model = isRecord(message.data.model) ? message.data.model : undefined;
          const modelProvider = readString(model?.provider);
          const modelId = readString(model?.id);
          const modelSlug = modelProvider && modelId ? `${modelProvider}/${modelId}` : undefined;
          if (modelSlug) {
            context.defaultModelSlug ??= modelSlug;
            context.appliedModelSlug = modelSlug;
          }
          if (sessionFile) {
            context.session = {
              ...context.session,
              resumeCursor: { schemaVersion: PI_RESUME_VERSION, sessionFile },
              updatedAt: yield* nowIso,
            };
          }
          if (sessionId) {
            yield* emit({
              ...(yield* eventBase(context, message)),
              type: "thread.started",
              payload: { providerThreadId: sessionId },
            });
          }
        } else if (command === "prompt" && message.success === false) {
          const error = readString(message.error) ?? "Pi rejected the prompt.";
          context.turnFailure = error;
          yield* emit({
            ...(yield* eventBase(context, message)),
            type: "runtime.error",
            payload: { message: error, class: "provider_error" },
          });
          yield* completeTurn(context, "failed", error);
        }
        if (pendingResponse) {
          yield* Deferred.succeed(pendingResponse, message).pipe(Effect.ignore);
        }
        return;
      }

      switch (message.type) {
        case "message_update": {
          const update = isRecord(message.assistantMessageEvent)
            ? message.assistantMessageEvent
            : undefined;
          const updateType = readString(update?.type);
          const delta = typeof update?.delta === "string" ? update.delta : undefined;
          const contentIndex =
            typeof update?.contentIndex === "number" && Number.isInteger(update.contentIndex)
              ? update.contentIndex
              : 0;
          if (updateType === "thinking_start") {
            getReasoningBlock(context, contentIndex);
          }
          if (updateType === "thinking_delta" && delta) {
            const block = getReasoningBlock(context, contentIndex);
            block.text += delta;
            yield* emitReasoningProgress(context, contentIndex, message, false);
          }
          if (delta && (updateType === "text_delta" || updateType === "thinking_delta")) {
            yield* emit({
              ...(yield* eventBase(context, message)),
              type: "content.delta",
              payload: {
                streamKind: updateType === "thinking_delta" ? "reasoning_text" : "assistant_text",
                delta,
              },
            });
          }
          if (updateType === "thinking_end") {
            const block = getReasoningBlock(context, contentIndex);
            const content = readString(update?.content);
            if (content) block.text = content;
            yield* emitReasoningProgress(context, contentIndex, message, true);
            context.reasoningBlocks.delete(contentIndex);
          }
          if (updateType === "error") {
            const error =
              readString(update?.error) ?? readString(update?.reason) ?? "Pi turn failed.";
            context.turnFailure = error;
            yield* emit({
              ...(yield* eventBase(context, message)),
              type: "runtime.error",
              payload: { message: error, class: "provider_error", detail: update },
            });
          }
          break;
        }
        case "message_end": {
          for (const contentIndex of context.reasoningBlocks.keys()) {
            yield* emitReasoningProgress(context, contentIndex, message, true);
            context.reasoningBlocks.delete(contentIndex);
          }
          const piMessage = isRecord(message.message) ? message.message : undefined;
          if (piMessage?.role === "assistant") {
            const detail = extractText(piMessage.content);
            const itemId = RuntimeItemId.make(yield* randomId);
            const item = { role: "assistant", detail, raw: piMessage };
            appendTurnItem(context, item);
            yield* emit({
              ...(yield* eventBase(context, message)),
              type: "item.completed",
              itemId,
              payload: {
                itemType: "assistant_message",
                status: "completed",
                title: "Assistant message",
                ...(detail ? { detail } : {}),
              },
            });
          }
          break;
        }
        case "tool_execution_start":
        case "tool_execution_update":
        case "tool_execution_end": {
          const toolName = readString(message.toolName) ?? "tool";
          const suppliedToolCallId = readPiToolCallId(message.toolCallId);
          // Never manufacture a shared fallback: each malformed lifecycle row
          // remains visible, but cannot accidentally attach to another row.
          const syntheticToolCallId = suppliedToolCallId
            ? undefined
            : `pi-malformed-tool-call-${yield* randomId}`;
          const normalizedWorkLog = normalizePiToolWorkLog({
            toolCallId: message.toolCallId,
            ...(syntheticToolCallId ? { syntheticToolCallId } : {}),
            toolName,
            args: message.args,
            result: message.result,
            partialResult: message.partialResult,
          });
          if (!normalizedWorkLog) break;
          const toolCallId = normalizedWorkLog.data.toolCallId;
          if (syntheticToolCallId) {
            yield* emit({
              ...(yield* eventBase(context, message)),
              type: "runtime.error",
              payload: {
                message:
                  "Pi tool lifecycle event was missing toolCallId; rendered as an isolated item.",
                class: "provider_error",
                detail: message,
              },
            });
          }
          const rawDetail =
            extractText(message.partialResult) ??
            extractText(message.result) ??
            (message.args === undefined ? undefined : jsonString(message.args));
          const isEnd = message.type === "tool_execution_end";
          const lifecycleStatus = isEnd
            ? message.isError === true
              ? ("failed" as const)
              : ("completed" as const)
            : ("inProgress" as const);
          let presentation = normalizeTakomiPresentation({
            toolName,
            args: message.args,
            result: message.result,
            partialResult: message.partialResult,
            isError: message.isError === true,
            lifecycleStatus,
          });
          if (presentation && toolName.toLowerCase() === "takomi_subagent") {
            const mergedActivity = new Map<string, ToolPresentationActivity>();
            for (const activity of context.toolActivityByCallId.get(toolCallId) ?? []) {
              mergedActivity.set(activity.id, activity);
            }
            for (const activity of presentation.activity ?? []) {
              mergedActivity.set(activity.id, activity);
            }
            const allActivity = [...mergedActivity.values()];
            const activity = allActivity.slice(-PRESENTATION_ACTIVITY_LIMIT);
            if (allActivity.length > PRESENTATION_ACTIVITY_LIMIT) {
              context.truncatedToolActivityCallIds.add(toolCallId);
            }
            if (activity.length > 0) {
              context.toolActivityByCallId.set(toolCallId, activity);
              presentation = {
                ...presentation,
                activity,
                ...(context.truncatedToolActivityCallIds.has(toolCallId)
                  ? { activityTruncated: true }
                  : {}),
              };
            }
          }
          // Takomi details cross the WebSocket boundary, so never reuse an
          // unbounded Pi result as the generic row preview.
          const normalizedDetail = presentation
            ? (presentation.detailText ?? boundedText(rawDetail))
            : rawDetail;
          const warning = normalizedWorkLog.data.warning;
          const detail = warning
            ? [warning, normalizedDetail]
                .filter((value): value is string => value !== undefined)
                .join("\n")
            : normalizedDetail;
          const item = {
            ...normalizedWorkLog.data,
            ...(presentation ? { presentation } : {}),
          };
          if (toolName.toLowerCase() === "takomi_subagent") {
            yield* emitTakomiSubagentTasks(context, message, toolCallId, lifecycleStatus);
          }
          if (isEnd) appendTurnItem(context, item);
          yield* emit({
            ...(yield* eventBase(context, message)),
            type:
              message.type === "tool_execution_start"
                ? "item.started"
                : isEnd
                  ? "item.completed"
                  : "item.updated",
            itemId: RuntimeItemId.make(toolCallId),
            payload: {
              itemType: normalizedWorkLog.itemType,
              status: lifecycleStatus,
              title: toolName,
              ...(detail ? { detail } : {}),
              data: item,
            },
          });
          if (isEnd) {
            context.toolActivityByCallId.delete(toolCallId);
            context.truncatedToolActivityCallIds.delete(toolCallId);
          }
          break;
        }
        case "compaction_start": {
          const itemId = RuntimeItemId.make(`compaction-${yield* randomId}`);
          context.activeCompactionItemId = itemId;
          yield* emit({
            ...(yield* eventBase(context, message)),
            type: "item.started",
            itemId,
            payload: {
              itemType: "context_compaction",
              status: "inProgress",
              title: "Compacting context",
            },
          });
          break;
        }
        case "compaction_end": {
          const itemId = context.activeCompactionItemId;
          if (!itemId) break;
          context.activeCompactionItemId = undefined;
          const failed = message.result === null && message.aborted !== true;
          yield* emit({
            ...(yield* eventBase(context, message)),
            type: "item.completed",
            itemId,
            payload: {
              itemType: "context_compaction",
              status: failed ? "failed" : "completed",
              title: "Context compaction",
              ...(readString(message.errorMessage)
                ? { detail: readString(message.errorMessage) }
                : {}),
            },
          });
          break;
        }
        case "extension_error": {
          const error = readString(message.error) ?? "A Pi extension failed.";
          yield* emit({
            ...(yield* eventBase(context, message)),
            type: "runtime.error",
            payload: { message: error, class: "provider_error", detail: message },
          });
          break;
        }
        case "agent_settled":
          for (const contentIndex of context.reasoningBlocks.keys()) {
            yield* emitReasoningProgress(context, contentIndex, message, true);
            context.reasoningBlocks.delete(contentIndex);
          }
          if (context.abortingTurnId) {
            context.abortingTurnId = undefined;
            yield* completeTurn(context, "interrupted");
          } else {
            yield* completeTurn(
              context,
              context.turnFailure ? "failed" : "completed",
              context.turnFailure,
            );
          }
          break;
        default:
          break;
      }
    });

    const resolvePendingUiAsCancelled = Effect.fn("resolvePendingPiUiAsCancelled")(function* (
      context: PiSessionContext,
    ) {
      for (const [requestId, pending] of context.pendingUi) {
        if (pending.method === "confirm") {
          yield* emit({
            ...(yield* eventBase(context)),
            type: "request.resolved",
            requestId: RuntimeRequestId.make(requestId),
            payload: { requestType: "dynamic_tool_call", decision: "cancel" },
          }).pipe(Effect.ignore);
        } else {
          yield* emit({
            ...(yield* eventBase(context)),
            type: "user-input.resolved",
            requestId: RuntimeRequestId.make(requestId),
            payload: { answers: {} },
          }).pipe(Effect.ignore);
        }
      }
      context.pendingUi.clear();
    });

    const stopContext = Effect.fn("stopPiContext")(function* (
      context: PiSessionContext,
      emitExit: boolean,
    ) {
      if (context.stopped) return;
      context.stopped = true;
      sessions.delete(context.session.threadId);
      if (emitExit && context.activeTurnId) {
        context.abortingTurnId = undefined;
        yield* completeTurn(context, "interrupted");
      }
      for (const [id, pending] of context.pendingRpc) {
        yield* Deferred.succeed(pending, {
          id,
          type: "response",
          success: false,
          error: "Pi session stopped.",
        }).pipe(Effect.ignore);
      }
      context.pendingRpc.clear();
      yield* resolvePendingUiAsCancelled(context);
      if (emitExit) {
        yield* emit({
          ...(yield* eventBase(context)),
          type: "session.exited",
          payload: { reason: "Pi session stopped", recoverable: true, exitKind: "graceful" },
        }).pipe(Effect.ignore);
      }
      yield* Queue.shutdown(context.input);
      yield* Scope.close(context.scope, Exit.void).pipe(Effect.ignore);
    });

    yield* Effect.addFinalizer(() =>
      Effect.forEach([...sessions.values()], (context) => stopContext(context, false), {
        concurrency: "unbounded",
        discard: true,
      }).pipe(Effect.ignore, Effect.ensuring(Queue.shutdown(runtimeEvents))),
    );

    const startSession: ProviderAdapterShape<ProviderAdapterError>["startSession"] = Effect.fn(
      "startPiSession",
    )(function* (input: ProviderSessionStartInput) {
      if (input.runtimeMode !== "full-access") {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "startSession",
          issue:
            "Pi/Takomi currently supports only full-access sessions. Approval enforcement must be implemented before safer T3 runtime modes can be enabled.",
        });
      }
      const existing = sessions.get(input.threadId);
      if (existing) yield* stopContext(existing, false);

      const cwd = input.cwd ?? serverConfig.cwd;
      const sessionScope = yield* Scope.make();
      const resumeFile = readPiResumeCursor(input.resumeCursor);
      const takomiExtensionPaths = settings.suiteRoot
        ? TAKOMI_EXTENSION_NAMES.map((name) =>
            path.join(settings.suiteRoot, ".pi", "extensions", name, "index.ts"),
          )
        : [];
      const takomiPromptPath = settings.suiteRoot
        ? path.join(settings.suiteRoot, ".pi", "prompts")
        : undefined;
      if (settings.suiteRoot) {
        const requiredPaths = [...takomiExtensionPaths, takomiPromptPath].filter(
          (candidate): candidate is string => candidate !== undefined,
        );
        const missingPaths = yield* Effect.filter(requiredPaths, (candidate) =>
          fileSystem.exists(candidate).pipe(
            Effect.orElseSucceed(() => false),
            Effect.map((exists) => !exists),
          ),
        );
        if (missingPaths.length > 0) {
          yield* Scope.close(sessionScope, Exit.void).pipe(Effect.ignore);
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "startSession",
            issue: `Takomi suite root is missing required assets: ${missingPaths.join(", ")}`,
          });
        }
      }
      const companionExtensionPaths = settings.suiteRoot
        ? yield* discoverPiCompanionExtensions({
            fileSystem,
            path,
            environment: options.environment,
            homePath: settings.homePath,
          })
        : [];
      const takomiArgs = settings.suiteRoot
        ? [
            "--no-extensions",
            ...[...companionExtensionPaths, ...takomiExtensionPaths].flatMap((extensionPath) => [
              "--extension",
              extensionPath,
            ]),
            ...(takomiPromptPath ? ["--prompt-template", takomiPromptPath] : []),
          ]
        : [];
      const args = [
        ...tokenizeCliArgs(settings.launchArgs),
        ...takomiArgs,
        "--mode",
        "rpc",
        ...(resumeFile ? ["--session", resumeFile] : []),
      ];
      const environment: NodeJS.ProcessEnv = {
        ...options.environment,
        ...(settings.homePath ? { PI_CODING_AGENT_DIR: settings.homePath } : {}),
      };
      const spawnCommand = yield* resolveSpawnCommand(settings.binaryPath, args, {
        env: environment,
      });
      const command = ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        cwd,
        env: environment,
        shell: spawnCommand.shell,
      });
      const process = yield* spawner.spawn(command).pipe(
        Effect.provideService(Scope.Scope, sessionScope),
        Effect.mapError(
          (cause) =>
            new ProviderAdapterProcessError({
              provider: PROVIDER,
              threadId: input.threadId,
              detail: `Failed to start '${settings.binaryPath} --mode rpc'.`,
              cause,
            }),
        ),
        Effect.onError(() => Scope.close(sessionScope, Exit.void).pipe(Effect.ignore)),
      );
      const rpcInput = yield* Queue.unbounded<Uint8Array>();
      const createdAt = yield* nowIso;
      const session: ProviderSession = {
        provider: PROVIDER,
        providerInstanceId: options.instanceId,
        status: "ready",
        runtimeMode: input.runtimeMode,
        cwd,
        ...(input.modelSelection && input.modelSelection.instanceId === options.instanceId
          ? { model: input.modelSelection.model }
          : {}),
        threadId: input.threadId,
        ...(resumeFile
          ? { resumeCursor: { schemaVersion: PI_RESUME_VERSION, sessionFile: resumeFile } }
          : {}),
        createdAt,
        updatedAt: createdAt,
      };
      const context: PiSessionContext = {
        session,
        scope: sessionScope,
        process,
        input: rpcInput,
        pendingUi: new Map(),
        pendingRpc: new Map(),
        toolActivityByCallId: new Map(),
        truncatedToolActivityCallIds: new Set(),
        takomiSubagentTaskTracker: createTakomiSubagentTaskTracker(),
        reasoningBlocks: new Map(),
        reasoningSequence: 0,
        turns: [],
        activeTurnId: undefined,
        abortingTurnId: undefined,
        activeCompactionItemId: undefined,
        defaultModelSlug: undefined,
        appliedModelSlug: undefined,
        appliedThinkingLevel: undefined,
        turnFailure: undefined,
        stopped: false,
      };
      sessions.set(input.threadId, context);

      yield* Stream.run(Stream.fromQueue(rpcInput), process.stdin).pipe(
        Effect.ignore,
        Effect.forkIn(sessionScope),
      );

      const decoder = new TextDecoder();
      let stdoutBuffer = "";
      yield* process.stdout.pipe(
        Stream.runForEach((chunk) => {
          stdoutBuffer += decoder.decode(chunk, { stream: true });
          const lines: string[] = [];
          while (true) {
            const newline = stdoutBuffer.indexOf("\n");
            if (newline < 0) break;
            let line = stdoutBuffer.slice(0, newline);
            stdoutBuffer = stdoutBuffer.slice(newline + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.trim().length > 0) lines.push(line);
          }
          return Effect.forEach(
            lines,
            (line) => {
              const decoded = decodeJsonString(line);
              if (
                Exit.isFailure(decoded) ||
                !isRecord(decoded.value) ||
                !readString(decoded.value.type)
              ) {
                return emit({
                  eventId: EventId.make(`pi-parse-${process.pid}`),
                  provider: PROVIDER,
                  providerInstanceId: options.instanceId,
                  threadId: input.threadId,
                  createdAt,
                  type: "runtime.warning",
                  payload: {
                    message: "Pi emitted an invalid RPC record.",
                    detail: { line },
                  },
                });
              }
              return handleMessage(context, decoded.value as PiRpcMessage);
            },
            { discard: true },
          );
        }),
        Effect.catchCause((cause) =>
          context.stopped
            ? Effect.void
            : emit({
                eventId: EventId.make(`pi-stdout-${process.pid}`),
                provider: PROVIDER,
                providerInstanceId: options.instanceId,
                threadId: input.threadId,
                createdAt,
                type: "runtime.error",
                payload: {
                  message: "Pi RPC output stream failed.",
                  class: "transport_error",
                  detail: Cause.pretty(cause),
                },
              }),
        ),
        Effect.forkIn(sessionScope),
      );

      yield* process.stderr.pipe(Stream.runDrain, Effect.ignore, Effect.forkIn(sessionScope));
      yield* process.exitCode.pipe(
        Effect.flatMap((code) =>
          context.stopped
            ? Effect.void
            : Effect.gen(function* () {
                context.stopped = true;
                sessions.delete(input.threadId);
                if (context.activeTurnId) {
                  context.abortingTurnId = undefined;
                  yield* completeTurn(
                    context,
                    "failed",
                    `Pi exited with code ${Number(code)} during the active turn.`,
                  );
                }
                yield* Queue.shutdown(context.input);
                for (const [id, pending] of context.pendingRpc) {
                  yield* Deferred.succeed(pending, {
                    id,
                    type: "response",
                    success: false,
                    error: `Pi exited with code ${Number(code)}.`,
                  }).pipe(Effect.ignore);
                }
                context.pendingRpc.clear();
                yield* resolvePendingUiAsCancelled(context);
                yield* emit({
                  ...(yield* eventBase(context)),
                  type: "session.exited",
                  payload: {
                    reason: `Pi exited with code ${Number(code)}.`,
                    recoverable: false,
                    exitKind: Number(code) === 0 ? "graceful" : "error",
                  },
                });
                yield* Scope.close(context.scope, Exit.void).pipe(Effect.ignore, Effect.forkDetach);
              }),
        ),
        Effect.ignore,
        Effect.forkIn(sessionScope),
      );

      yield* emit({
        ...(yield* eventBase(context)),
        type: "session.started",
        payload: { message: "Pi / Takomi RPC session started" },
      });
      const stateResponse = yield* requestRpc(context, { type: "get_state" });
      if (stateResponse.success !== true || context.session.resumeCursor === undefined) {
        yield* stopContext(context, false);
        return yield* new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "get_state",
          detail:
            readString(stateResponse.error) ??
            "Pi started but did not provide a persistent session file for resumption.",
        });
      }
      return context.session;
    });

    const sendTurn: ProviderAdapterShape<ProviderAdapterError>["sendTurn"] = Effect.fn(
      "sendPiTurn",
    )(function* (input: ProviderSendTurnInput) {
      const context = yield* ensureContext(input.threadId);
      if (!input.input && (!input.attachments || input.attachments.length === 0)) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "sendTurn",
          issue: "A Pi turn requires text or an image attachment.",
        });
      }

      if (input.modelSelection && input.modelSelection.instanceId === options.instanceId) {
        const selectedModel = input.modelSelection.model;
        const targetModel =
          selectedModel === "pi-default" ? context.defaultModelSlug : selectedModel;
        if (targetModel && targetModel !== context.appliedModelSlug) {
          const separator = targetModel.indexOf("/");
          if (separator <= 0 || separator === targetModel.length - 1) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue: `Pi model '${targetModel}' must use provider/model format.`,
            });
          }
          const response = yield* requestRpc(context, {
            type: "set_model",
            provider: targetModel.slice(0, separator),
            modelId: targetModel.slice(separator + 1),
          });
          if (response.success !== true) {
            return yield* new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "set_model",
              detail: readString(response.error) ?? `Pi rejected model '${targetModel}'.`,
            });
          }
          context.appliedModelSlug = targetModel;
          context.appliedThinkingLevel = undefined;
          context.session = { ...context.session, model: selectedModel };
        }

        const thinkingLevel = getModelSelectionStringOptionValue(
          input.modelSelection,
          "reasoningEffort",
        );
        if (thinkingLevel && thinkingLevel !== context.appliedThinkingLevel) {
          const response = yield* requestRpc(context, {
            type: "set_thinking_level",
            level: thinkingLevel,
          });
          if (response.success !== true) {
            return yield* new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "set_thinking_level",
              detail:
                readString(response.error) ?? `Pi rejected thinking level '${thinkingLevel}'.`,
            });
          }
          context.appliedThinkingLevel = thinkingLevel;
        }
      }

      const images: Array<Record<string, unknown>> = [];
      for (const attachment of input.attachments ?? []) {
        if (attachment.type !== "image") continue;
        const path = resolveAttachmentPath({
          attachmentsDir: serverConfig.attachmentsDir,
          attachment,
        });
        if (!path) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "prompt",
            detail: `Invalid attachment id '${attachment.id}'.`,
          });
        }
        const bytes = yield* fileSystem.readFile(path).pipe(
          Effect.mapError(
            (cause) =>
              new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "prompt",
                detail: `Failed to read attachment '${attachment.id}'.`,
                cause,
              }),
          ),
        );
        images.push({
          type: "image",
          data: Buffer.from(bytes).toString("base64"),
          mimeType: attachment.mimeType,
        });
      }

      const existingTurn = context.activeTurnId;
      const turnId = existingTurn ?? TurnId.make(`pi-turn-${yield* randomId}`);
      context.activeTurnId = turnId;
      context.turnFailure = undefined;
      context.session = {
        ...context.session,
        status: "running",
        activeTurnId: turnId,
        updatedAt: yield* nowIso,
      };
      if (!existingTurn) {
        context.turns.push({ id: turnId, items: [] });
        yield* emit({
          ...(yield* eventBase(context)),
          type: "turn.started",
          turnId,
          payload: input.modelSelection ? { model: input.modelSelection.model } : {},
        });
      }

      yield* sendRpc(context, {
        id: `prompt-${yield* randomId}`,
        type: "prompt",
        message: input.input ?? "",
        ...(images.length > 0 ? { images } : {}),
        ...(existingTurn ? { streamingBehavior: "steer" } : {}),
      });
      return {
        threadId: input.threadId,
        turnId,
        ...(context.session.resumeCursor ? { resumeCursor: context.session.resumeCursor } : {}),
      };
    });

    const interruptTurn: ProviderAdapterShape<ProviderAdapterError>["interruptTurn"] = Effect.fn(
      "interruptPiTurn",
    )(function* (threadId, turnId) {
      const context = yield* ensureContext(threadId);
      const activeTurnId = context.activeTurnId;
      if (!activeTurnId || (turnId && turnId !== activeTurnId)) return;
      context.abortingTurnId = activeTurnId;
      yield* emit({
        ...(yield* eventBase(context)),
        type: "turn.aborted",
        turnId: activeTurnId,
        payload: { reason: "Interrupted by user" },
      });
      // Best effort: give Pi a short grace window to abort cleanly, then cross
      // a hard process boundary so interrupted tools cannot continue in the
      // background even if the RPC response is rejected or never arrives.
      yield* sendRpc(context, { id: `abort-${yield* randomId}`, type: "abort" }).pipe(
        Effect.ignore,
      );
      yield* Effect.sleep("250 millis");
      if (context.activeTurnId === activeTurnId) {
        context.abortingTurnId = undefined;
        yield* completeTurn(context, "interrupted");
      }
      context.abortingTurnId = undefined;
      // Pi's abort acknowledgement can precede late tool events. Terminating the
      // RPC process is the only reliable boundary that prevents interrupted work
      // from continuing. ProviderService can resume the persisted Pi session on
      // the next user turn via the stored resume cursor.
      yield* stopContext(context, true);
    });

    const respondToRequest: ProviderAdapterShape<ProviderAdapterError>["respondToRequest"] =
      Effect.fn("respondToPiRequest")(function* (
        threadId: ThreadId,
        requestId: ApprovalRequestId,
        decision: ProviderApprovalDecision,
      ) {
        const context = yield* ensureContext(threadId);
        const pending = context.pendingUi.get(requestId);
        if (!pending || pending.method !== "confirm") {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "respondToRequest",
            issue: `Unknown Pi confirmation request '${requestId}'.`,
          });
        }
        context.pendingUi.delete(requestId);
        const confirmed = decision === "accept" || decision === "acceptForSession";
        yield* sendRpc(context, {
          type: "extension_ui_response",
          id: requestId,
          ...(decision === "cancel" ? { cancelled: true } : { confirmed }),
        });
        yield* emit({
          ...(yield* eventBase(context)),
          type: "request.resolved",
          requestId: RuntimeRequestId.make(requestId),
          payload: { requestType: "dynamic_tool_call", decision },
        });
      });

    const respondToUserInput: ProviderAdapterShape<ProviderAdapterError>["respondToUserInput"] =
      Effect.fn("respondToPiUserInput")(function* (
        threadId: ThreadId,
        requestId: ApprovalRequestId,
        answers: ProviderUserInputAnswers,
      ) {
        const context = yield* ensureContext(threadId);
        const pending = context.pendingUi.get(requestId);
        if (!pending || pending.method === "confirm") {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "respondToUserInput",
            issue: `Unknown Pi input request '${requestId}'.`,
          });
        }
        context.pendingUi.delete(requestId);
        const answer = firstAnswer(answers, requestId);
        yield* sendRpc(context, {
          type: "extension_ui_response",
          id: requestId,
          value: Array.isArray(answer) ? answer.join(", ") : String(answer ?? ""),
        });
        yield* emit({
          ...(yield* eventBase(context)),
          type: "user-input.resolved",
          requestId: RuntimeRequestId.make(requestId),
          payload: { answers },
        });
      });

    const readThread = (
      threadId: ThreadId,
    ): Effect.Effect<ProviderThreadSnapshot, ProviderAdapterError> =>
      ensureContext(threadId).pipe(
        Effect.map((context) => ({
          threadId,
          turns: context.turns.map((turn) => ({ id: turn.id, items: [...turn.items] })),
        })),
      );

    const adapter: ProviderAdapterShape<ProviderAdapterError> = {
      provider: PROVIDER,
      capabilities: { sessionModelSwitch: "in-session" },
      startSession,
      sendTurn,
      interruptTurn,
      respondToRequest,
      respondToUserInput,
      stopSession: (threadId) =>
        ensureContext(threadId).pipe(Effect.flatMap((context) => stopContext(context, true))),
      listSessions: () => Effect.succeed([...sessions.values()].map((context) => context.session)),
      hasSession: (threadId) => Effect.succeed(sessions.has(threadId)),
      readThread,
      rollbackThread: (threadId) =>
        Effect.fail(
          new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "rollbackThread",
            issue: `Pi RPC does not currently expose rollback for thread '${threadId}'.`,
          }),
        ),
      stopAll: () =>
        Effect.forEach([...sessions.values()], (context) => stopContext(context, true), {
          concurrency: "unbounded",
          discard: true,
        }),
      streamEvents: Stream.fromQueue(runtimeEvents),
    };

    return adapter;
  });
}
