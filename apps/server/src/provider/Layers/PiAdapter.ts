import {
  ApprovalRequestId,
  EventId,
  type PiSettings,
  type ProviderApprovalDecision,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderRuntimeEvent,
  type ToolPresentationEnvelope,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderSessionStartInput,
  type ProviderUserInputAnswers,
  RuntimeItemId,
  RuntimeRequestId,
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
const TAKOMI_EXTENSION_NAMES = [
  "takomi-runtime",
  "takomi-subagents",
  "oauth-router",
  "takomi-context-manager",
  "notify-sound",
] as const;
const encoder = new TextEncoder();
const decodeJsonString = Schema.decodeUnknownExit(Schema.UnknownFromJsonString);
const encodeJsonString = Schema.encodeUnknownExit(Schema.UnknownFromJsonString);

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
} as const;

type TakomiToolName = keyof typeof TAKOMI_TOOL_FAMILIES;

function takomiFamily(toolName: string): ToolPresentationEnvelope["family"] | undefined {
  const normalized = toolName.toLowerCase();
  if (normalized.startsWith("takomi_flow_")) return "execution";
  return TAKOMI_TOOL_FAMILIES[normalized as TakomiToolName];
}

function classifyTool(toolName: string) {
  const name = toolName.toLowerCase();
  if (name === "takomi_subagent") return "collab_agent_tool_call" as const;
  if (takomiFamily(name)) return "dynamic_tool_call" as const;
  if (name.includes("bash") || name.includes("command") || name.includes("shell")) {
    return "command_execution" as const;
  }
  if (
    name.includes("edit") ||
    name.includes("write") ||
    name.includes("patch") ||
    name.includes("file")
  ) {
    return "file_change" as const;
  }
  if (name.includes("subagent") || name.includes("agent") || name.includes("task")) {
    return "collab_agent_tool_call" as const;
  }
  if (name.includes("web") || name.includes("search")) return "web_search" as const;
  if (name.includes("image")) return "image_view" as const;
  if (name.includes("mcp")) return "mcp_tool_call" as const;
  return "dynamic_tool_call" as const;
}

const PRESENTATION_DETAIL_LIMIT = 600;
const PRESENTATION_ITEM_LIMIT = 12;
const PRESENTATION_ARTIFACT_LIMIT = 8;

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

function normalizePresentationItems(value: unknown): ToolPresentationItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, PRESENTATION_ITEM_LIMIT).flatMap((entry, index) => {
    const record = isRecord(entry) ? entry : undefined;
    const label = boundedText(
      record?.label ??
        record?.name ??
        record?.title ??
        record?.agent ??
        record?.task ??
        record?.id ??
        entry,
      160,
    );
    if (!label) return [];
    const id = boundedText(record?.id ?? record?.taskId ?? record?.agentId ?? `${index}`, 120)!;
    const exitCode = typeof record?.exitCode === "number" ? record.exitCode : undefined;
    const status =
      boundedText(record?.status ?? record?.state, 80) ??
      (exitCode === undefined ? undefined : exitCode === 0 ? "completed" : "failed");
    const detail = boundedText(record?.detail ?? record?.message ?? record?.reason, 180);
    return [{ id, label, ...(status ? { status } : {}), ...(detail ? { detail } : {}) }];
  });
}

type ToolPresentationArtifact = NonNullable<ToolPresentationEnvelope["artifactRefs"]>[number];

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

function normalizeTakomiPresentation(input: {
  toolName: string;
  args: unknown;
  result: unknown;
  partialResult: unknown;
  isError: boolean;
}): ToolPresentationEnvelope | undefined {
  const family = takomiFamily(input.toolName);
  if (!family) return undefined;
  const args = firstRecord(input.args) ?? {};
  const result = firstRecord(input.result, input.partialResult) ?? {};
  const structuredContent = firstRecord(result.structuredContent, result.details) ?? {};
  const source = { ...args, ...result, ...structuredContent };
  const items = normalizePresentationItems(
    source.tasks ??
      source.stages ??
      source.agents ??
      source.items ??
      source.results ??
      (source.task ? [source.task] : undefined),
  );
  const artifactRefs = normalizeArtifactRefs(source.artifacts ?? source.files ?? source.assets);
  const detailText = boundedText(
    source.summary ?? source.message ?? source.detail ?? source.reason ?? source.output,
  );
  const action = boundedText(source.action ?? source.operation ?? source.phase, 120);
  const status = boundedText(source.status ?? source.state, 80);
  const sessionId = boundedText(source.sessionId ?? source.session ?? source.boardId, 120);
  const runId = boundedText(source.runId ?? source.run ?? source.workflowRunId, 120);
  const taskId = boundedText(source.taskId ?? source.task ?? source.id, 120);
  const count = readFiniteCount(source.count ?? source.totalCount);
  const completed = readFiniteCount(source.completed ?? source.completedCount);
  const total = readFiniteCount(source.total ?? source.totalCount);
  const summary = {
    ...(sessionId ? { sessionId } : {}),
    ...(runId ? { runId } : {}),
    ...(taskId ? { taskId } : {}),
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
          const toolCallId = readString(message.toolCallId) ?? (yield* randomId);
          const toolName = readString(message.toolName) ?? "tool";
          const rawDetail =
            extractText(message.partialResult) ??
            extractText(message.result) ??
            (message.args === undefined ? undefined : jsonString(message.args));
          const isEnd = message.type === "tool_execution_end";
          const presentation = normalizeTakomiPresentation({
            toolName,
            args: message.args,
            result: message.result,
            partialResult: message.partialResult,
            isError: message.isError === true,
          });
          // Takomi details cross the WebSocket boundary, so never reuse an
          // unbounded Pi result as the generic row preview.
          const detail = presentation
            ? (presentation.detailText ?? boundedText(rawDetail))
            : rawDetail;
          const item = {
            toolCallId,
            toolName,
            ...(presentation ? { presentation } : {}),
            args: message.args,
            result: message.result,
          };
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
              itemType: classifyTool(toolName),
              status: isEnd ? (message.isError === true ? "failed" : "completed") : "inProgress",
              title: toolName,
              ...(detail ? { detail } : {}),
              data: item,
            },
          });
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
      const takomiArgs = settings.suiteRoot
        ? [
            "--no-extensions",
            ...takomiExtensionPaths.flatMap((extensionPath) => ["--extension", extensionPath]),
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
