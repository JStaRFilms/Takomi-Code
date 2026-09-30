// @effect-diagnostics nodeBuiltinImport:off - The integration tests launch only the synthetic Pi peer.
// @effect-diagnostics preferSchemaOverJson:off - Assert that synthetic runtime event serialization contains no private values.
import * as NodePath from "node:path";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ApprovalRequestId,
  PiSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { it as effectIt } from "@effect/vitest";
import { describe, expect, it } from "vite-plus/test";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { foldSubagentActivities } from "../../../../../packages/client-runtime/src/state/subagentRuntime.ts";
import {
  createTakomiSubagentTaskTracker,
  makePiAdapter,
  normalizePiToolWorkLog,
  normalizeTakomiPresentation,
  normalizeTakomiSubagentTasks,
  planStepsFromTodoTasks,
} from "./PiAdapter.ts";
import { ServerConfig } from "../../config.ts";
import type { ProviderAdapterError } from "../Errors.ts";

const decodePiSettings = Schema.decodeSync(PiSettings);
const piMockPeer = NodePath.join(import.meta.dirname, "../testFixtures/piMockPeer.mjs");
const piAdapterTestLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3code-pi-adapter-test-",
}).pipe(Layer.provideMerge(NodeServices.layer));

type TestPiAdapter = Effect.Success<ReturnType<typeof makePiAdapter>>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function runtimeWarningReason(event: ProviderRuntimeEvent): unknown {
  if (event.type !== "runtime.warning" || !isRecord(event.payload.detail)) return undefined;
  return event.payload.detail.reason;
}

function runPiProcessScenario(
  environment: NodeJS.ProcessEnv,
  use: (input: {
    readonly adapter: TestPiAdapter;
    readonly events: ProviderRuntimeEvent[];
    readonly nativeRecords: unknown[];
    readonly threadId: ThreadId;
    readonly waitFor: (predicate: (event: ProviderRuntimeEvent) => boolean) => Effect.Effect<void>;
  }) => Effect.Effect<void, ProviderAdapterError>,
  peerPath = piMockPeer,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      const nativeRecords: unknown[] = [];
      const adapter = yield* makePiAdapter(
        decodePiSettings({
          binaryPath: process.execPath,
          launchArgs: `"${peerPath}"`,
        }),
        {
          instanceId: ProviderInstanceId.make("pi-conformance"),
          environment,
          nativeEventLogger: {
            filePath: "synthetic-native.log",
            write: (event) =>
              environment.T3_PI_CONFORMANCE_NATIVE_LOG_FAIL === "1"
                ? Effect.die(new Error("sensitive native logger failure"))
                : Effect.sync(() => nativeRecords.push(event)),
            close: () => Effect.void,
          },
        },
      );
      const events: ProviderRuntimeEvent[] = [];
      const signals: Array<{
        readonly predicate: (event: ProviderRuntimeEvent) => boolean;
        readonly deferred: Deferred.Deferred<void>;
      }> = [];
      yield* Stream.runForEach(adapter.streamEvents, (event) =>
        Effect.gen(function* () {
          events.push(event);
          for (const signal of signals) {
            if (signal.predicate(event))
              yield* Deferred.succeed(signal.deferred, undefined).pipe(Effect.ignore);
          }
        }),
      ).pipe(Effect.forkScoped);
      const waitFor = (predicate: (event: ProviderRuntimeEvent) => boolean) =>
        Effect.gen(function* () {
          if (events.some(predicate)) return;
          const deferred = yield* Deferred.make<void>();
          signals.push({ predicate, deferred });
          yield* Deferred.await(deferred).pipe(
            Effect.timeout("15 seconds"),
            Effect.catchTag("TimeoutError", () =>
              Effect.die(
                new Error(`Timed out with events: ${events.map((event) => event.type).join(", ")}`),
              ),
            ),
          );
        });
      yield* use({
        adapter,
        events,
        nativeRecords,
        threadId: ThreadId.make("pi-decoder-process-path"),
        waitFor,
      });
    }),
  ).pipe(Effect.provide(piAdapterTestLayer));
}

const lifecyclePeer = String.raw`
let input = "";
let previousPrompt;
let heldPrompt;
let heldCount = 0;
let delayedPrompt;
const ambiguousPrompts = [];
const emit = (record) => process.stdout.write(JSON.stringify(record) + "\n");
const notify = (message) => emit({ type: "extension_ui_request", id: "notice-" + message, method: "notify", message });
const control = (id) => emit({ type: "extension_ui_request", id, method: "confirm", title: id, message: "Advance controlled peer" });
const ack = (id, disposition, success = true) => emit({ type: "response", id, command: "prompt", success,
  ...(success ? { data: { disposition } } : { error: "Synthetic rejection." }) });
const work = () => {
  emit({ type: "agent_start" });
  emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Native review text" } });
  emit({ type: "tool_execution_start", toolCallId: "review-read", toolName: "read", args: { path: "synthetic.txt" } });
  emit({ type: "tool_execution_end", toolCallId: "review-read", toolName: "read", result: {} });
};
process.stdin.on("data", (chunk) => {
  input += chunk;
  let newline;
  while ((newline = input.indexOf("\n")) >= 0) {
    const record = JSON.parse(input.slice(0, newline));
    input = input.slice(newline + 1);
    if (record.type === "get_state") {
      emit({ type: "response", id: record.id, command: record.type, success: true,
        data: { sessionFile: "/synthetic/lifecycle.jsonl", sessionId: "lifecycle" } });
    } else if (record.type === "get_commands") {
      emit({ type: "response", id: record.id, command: record.type, success: true,
        data: { commands: [] } });
    } else if (record.type === "prompt") {
      const text = record.message;
      if (text === "/delayed-a") {
        delayedPrompt = record.id;
        work();
        emit({ type: "agent_settled" });
      } else if (text.startsWith("/invalid-")) {
        const invalid = text.slice(9);
        const data = invalid === "data-null" ? null
          : invalid === "data-array" ? ["private-invalid-disposition"]
          : invalid === "missing" ? {}
          : { disposition: invalid === "null" ? null
              : invalid === "object" ? { value: "private-invalid-disposition" }
              : "private-invalid-disposition" };
        emit({ type: "response", id: record.id, command: "prompt", success: true, data });
        if (invalid !== "missing") {
          ack(record.id, "handled");
          ack(record.id, "started");
          ack(record.id, "handled");
        }
      } else if (text === "/ambiguous") {
        ambiguousPrompts.push(record.id);
        if (ambiguousPrompts.length === 2) {
          emit({ type: "extension_error", extensionPath: "command:ambiguous", event: "command", error: "Unattributed command failure." });
          for (const id of ambiguousPrompts) ack(id, "handled");
          notify("Ambiguous commands drained");
        }
      } else if (text === "/hold") {
        heldPrompt = record.id;
        if (++heldCount === 1) control("release-held");
        notify("Held prompt count: " + heldCount);
      } else if (text === "/run-before" || text === "/run-finished-before-ack" || text === "/fail-run-before") {
        work();
        if (text === "/run-finished-before-ack") emit({ type: "agent_settled" });
        if (text === "/fail-run-before") emit({ type: "extension_error", extensionPath: "command:fail-run-before", event: "command", error: "Synthetic extension failure." });
        ack(record.id, "handled");
        if (text !== "/run-finished-before-ack") control("settle-before");
        if (delayedPrompt) control("report-delayed-a");
      } else if (text === "/run-after") {
        ack(record.id, "handled");
        control("start-after");
      } else if (text === "/run-started" || text === "/run-queued") {
        ack(record.id, text.slice(5));
        // A contradictory duplicate cannot change the first authoritative disposition.
        ack(record.id, "handled");
        control("start-accepted");
      } else if (text === "/reject" || text === "/reject-active") {
        ack(record.id, undefined, false);
        ack(record.id, "handled");
      } else if (text === "/fail-command" || text === "/unrelated-error" || text === "input notice") {
        emit({ type: "extension_error", extensionPath: text === "/fail-command" ? "command:fail-command" : "command:other",
          event: text === "input notice" ? "input" : "command", error: "Synthetic extension failure." });
        ack(record.id, "handled");
      } else if (text === "steer input") {
        notify("Streaming behavior: " + record.streamingBehavior);
        ack(record.id, "queued");
        ack(record.id, "handled");
      } else {
        ack(record.id, "handled");
        ack(record.id, "handled");
        ack(record.id, undefined, false);
      }
      // A stale rejection for the preceding prompt must not affect this turn.
      if (previousPrompt) ack(previousPrompt, undefined, false);
      if (text !== "/hold" && text !== "/ambiguous" && text !== "/delayed-a") previousPrompt = record.id;
      notify("Prompt drained: " + text);
    } else if (record.type === "extension_ui_response") {
      if (record.id === "report-delayed-a") {
        emit({ type: "extension_error", extensionPath: "command:delayed-a", event: "command", error: "Delayed A failure." });
        ack(delayedPrompt, "handled");
        ack(delayedPrompt, "handled");
      } else if (record.id === "start-after" || record.id === "start-accepted") {
        work();
        control("settle-native");
      } else if (record.id.startsWith("settle-")) {
        emit({ type: "agent_end", messages: [], willRetry: false });
        notify("Low-level run ended");
        control("finish-settlement");
      } else if (record.id === "finish-settlement") {
        emit({ type: "agent_settled" });
        emit({ type: "agent_settled" });
      } else if (record.id === "release-held") {
        ack(heldPrompt, "handled");
        work();
      }
      notify("Control drained: " + record.id);
    }
  }
});
`;

function runPiLifecycleScenario(use: Parameters<typeof runPiProcessScenario>[1]) {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pi-lifecycle-"));
  const peerPath = NodePath.join(directory, "peer.mjs");
  NodeFS.writeFileSync(peerPath, lifecyclePeer);
  return runPiProcessScenario(process.env, use, peerPath).pipe(
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(directory, { recursive: true, force: true }))),
  );
}

type PiProcessScenario = Parameters<Parameters<typeof runPiProcessScenario>[1]>[0];

const advancePeer = Effect.fnUntraced(function* (scenario: PiProcessScenario, nativeId: string) {
  const { adapter, events, threadId, waitFor } = scenario;
  yield* waitFor(
    (event) =>
      event.type === "request.opened" && event.requestId?.endsWith(`-${nativeId}`) === true,
  );
  const request = events.findLast(
    (event) => event.type === "request.opened" && event.requestId?.endsWith(`-${nativeId}`),
  );
  if (!request?.requestId) throw new Error(`Missing controlled peer request: ${nativeId}`);
  yield* adapter.respondToRequest(threadId, ApprovalRequestId.make(request.requestId), "accept");
  yield* waitFor(
    (event) =>
      event.type === "runtime.warning" && event.payload.message === `Control drained: ${nativeId}`,
  );
});

describe("Pi adapter capabilities", () => {
  effectIt.effect("declares conversation rollback unsupported for provider preflight", () =>
    Effect.gen(function* () {
      const adapter = yield* Effect.scoped(
        makePiAdapter(
          decodePiSettings({ binaryPath: process.execPath, launchArgs: `"${piMockPeer}"` }),
          { instanceId: ProviderInstanceId.make("pi-capabilities"), environment: process.env },
        ),
      ).pipe(Effect.provide(piAdapterTestLayer));

      expect(adapter.capabilities.supportsConversationRollback).toBe(false);
    }),
  );
});

describe("Pi work-log normalization", () => {
  it("normalizes Pi bash calls into canonical command data", () => {
    const workLog = normalizePiToolWorkLog({
      toolCallId: "call-bash-1",
      toolName: "bash",
      args: { command: "git status --short" },
      result: { content: [{ type: "text", text: " M PiAdapter.ts" }] },
      partialResult: undefined,
    });

    expect(workLog).toEqual({
      itemType: "command_execution",
      data: {
        toolCallId: "call-bash-1",
        toolName: "bash",
        args: { command: "git status --short" },
        result: { content: [{ type: "text", text: " M PiAdapter.ts" }] },
        command: "git status --short",
        rawOutput: { content: [{ type: "text", text: " M PiAdapter.ts" }] },
      },
    });
  });

  it("normalizes edit, write, and apply_patch paths as file changes", () => {
    expect(
      normalizePiToolWorkLog({
        toolCallId: "call-edit-1",
        toolName: "edit",
        args: { path: "apps/server/src/provider/Layers/PiAdapter.ts" },
        result: {},
        partialResult: undefined,
      }),
    ).toMatchObject({
      itemType: "file_change",
      data: { files: [{ path: "apps/server/src/provider/Layers/PiAdapter.ts" }] },
    });
    expect(
      normalizePiToolWorkLog({
        toolCallId: "call-write-1",
        toolName: "write",
        args: { filePath: "apps/server/src/provider/Layers/PiAdapter.test.ts" },
        result: {},
        partialResult: undefined,
      }),
    ).toMatchObject({
      itemType: "file_change",
      data: { files: [{ path: "apps/server/src/provider/Layers/PiAdapter.test.ts" }] },
    });
    expect(
      normalizePiToolWorkLog({
        toolCallId: "call-patch-1",
        toolName: "apply_patch",
        args: { patch: "*** Update File: packages/contracts/src/providerRuntime.ts\n" },
        result: {},
        partialResult: undefined,
      }),
    ).toMatchObject({
      itemType: "file_change",
      data: { files: [{ path: "packages/contracts/src/providerRuntime.ts" }] },
    });
  });

  it("keeps read tools out of file-change classification", () => {
    expect(
      normalizePiToolWorkLog({
        toolCallId: "call-read-1",
        toolName: "read_file",
        args: { path: "README.md" },
        result: {},
        partialResult: undefined,
      })?.itemType,
    ).toBe("dynamic_tool_call");
  });

  it("keeps malformed lifecycle messages visible under an isolated synthetic ID", () => {
    expect(
      normalizePiToolWorkLog({
        toolCallId: undefined,
        syntheticToolCallId: "pi-malformed-tool-call-1",
        toolName: "bash",
        args: { command: "pwd" },
        result: {},
        partialResult: undefined,
      }),
    ).toMatchObject({
      data: {
        toolCallId: "pi-malformed-tool-call-1",
        warning: expect.stringContaining("missing toolCallId"),
      },
    });
  });

  it("bounds oversized dynamic tool payloads before they enter canonical data", () => {
    const workLog = normalizePiToolWorkLog({
      toolCallId: "oversized-tool",
      toolName: "bash",
      args: { command: "echo", extensionPayload: "x".repeat(1024 * 1024) },
      result: { content: [{ type: "text", text: "y".repeat(1024 * 1024) }] },
      partialResult: undefined,
    });
    expect(workLog?.data).toMatchObject({ payloadTruncated: true });
    expect(JSON.stringify(workLog?.data).length).toBeLessThan(200_000);
  });

  it("preserves all Takomi presentation families and takomi_flow namespace", () => {
    expect(
      normalizeTakomiPresentation({
        toolName: "takomi_mode",
        args: { mode: "build" },
        result: {},
        partialResult: {},
        isError: false,
        lifecycleStatus: "completed",
      })?.family,
    ).toBe("status");
    expect(
      normalizeTakomiPresentation({
        toolName: "takomi_flow_execute",
        args: {},
        result: {},
        partialResult: {},
        isError: false,
        lifecycleStatus: "completed",
      })?.namespace,
    ).toBe("takomi-flow");
    expect(
      normalizeTakomiPresentation({
        toolName: "takomi_board",
        args: { action: "show" },
        result: {},
        partialResult: {},
        isError: false,
        lifecycleStatus: "completed",
      })?.toolName,
    ).toBe("takomi_board");
  });
});

describe("Takomi subagent task synthesis", () => {
  // Matches pi-subagents Details and SingleResult. Native IDs remain metadata;
  // Pi's toolCallId owns lifecycle identity across partial and final snapshots.
  const nativeDetails = {
    mode: "chain",
    runId: "run-native-7",
    results: [
      {
        agent: "researcher",
        task: "Inspect the adapter",
        exitCode: 0,
        usage: { input: 12, output: 8, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
        model: "gpt-5-mini",
        progress: {
          index: 0,
          agent: "researcher",
          task: "Inspect the adapter",
          status: "completed",
          recentTools: [],
          recentOutput: ["Inspection complete"],
          toolCount: 1,
          tokens: 20,
          durationMs: 10,
        },
      },
      {
        agent: "builder",
        task: "Implement the fix",
        exitCode: 1,
        error: "tests failed",
        usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
      },
    ],
    progress: [
      {
        index: 1,
        agent: "builder",
        task: "Implement the fix",
        status: "failed",
        recentTools: [],
        recentOutput: [],
        toolCount: 1,
        tokens: 14,
        durationMs: 20,
        error: "tests failed",
      },
    ],
    workflowGraph: {
      runId: "run-native-7",
      mode: "chain",
      phases: [{ title: "Implementation", nodeIds: ["step-0", "step-1"] }],
      nodes: [
        {
          id: "step-0",
          kind: "step",
          agent: "researcher",
          label: "Inspect",
          status: "completed",
          flatIndex: 0,
          stepIndex: 0,
        },
        {
          id: "step-1",
          kind: "step",
          agent: "builder",
          label: "Implement",
          status: "failed",
          flatIndex: 1,
          stepIndex: 0,
          error: "tests failed",
        },
      ],
    },
  };

  it("uses the Pi tool call for task identities and native IDs only as metadata", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-native",
      partialResult: { details: nativeDetails },
      result: undefined,
      lifecycleStatus: "inProgress",
    });

    expect(tasks).toMatchObject([
      {
        taskId: "call-native:result:0",
        parentAgentId: "call-native",
        status: "completed",
        taskType: "local_agent",
        typedUsage: {
          totalTokens: 20,
          inputTokens: 12,
          cachedInputTokens: 0,
          outputTokens: 8,
          durationMs: 10,
          toolUses: 1,
        },
        runHandles: { runId: "run-native-7" },
      },
      {
        taskId: "call-native:result:1",
        parentAgentId: "call-native",
        status: "failed",
        error: "tests failed",
        taskType: "local_agent",
        typedUsage: {
          totalTokens: 14,
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 4,
          durationMs: 20,
          toolUses: 1,
        },
      },
      {
        taskId: "call-native",
        status: "failed",
        taskType: "local_workflow",
        runHandles: { runId: "run-native-7" },
      },
    ]);
  });

  it("uses live progress token totals when placeholder usage is still zero", () => {
    const [task] = normalizeTakomiSubagentTasks({
      toolCallId: "call-live-usage",
      partialResult: {
        details: {
          results: [
            {
              agent: "reviewer",
              task: "Review the change",
              usage: { input: 0, output: 0 },
              progress: { index: 0, status: "running", tokens: 37, durationMs: 15 },
            },
          ],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });

    expect(task?.typedUsage).toMatchObject({ totalTokens: 37, durationMs: 15 });
  });

  it("keeps live direct Details and final wrapped results on the same task IDs", () => {
    const tracker = createTakomiSubagentTaskTracker();
    const toolCallId = "pi-tool-call-42";
    const liveTasks = normalizeTakomiSubagentTasks({
      toolCallId,
      partialResult: {
        content: [{ type: "text", text: "researcher is working" }],
        details: {
          mode: "parallel",
          agentScope: "project",
          takomiUx: { status: "running" },
          results: [
            {
              agent: "researcher",
              task: "Inspect the adapter",
              progress: { index: 0, status: "running", currentTool: "read" },
            },
          ],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    const liveEvents = tracker.observe({
      toolCallId,
      tasks: liveTasks,
      lifecycleStatus: "inProgress",
    });

    expect(
      liveEvents.filter((event) => event.type === "started").map((event) => event.task.taskId),
    ).toEqual(["pi-tool-call-42:result:0", "pi-tool-call-42"]);
    expect(liveEvents.filter((event) => event.type === "progress")).toHaveLength(2);

    const finalTasks = normalizeTakomiSubagentTasks({
      toolCallId,
      partialResult: undefined,
      result: {
        content: [{ type: "text", text: "research complete" }],
        details: {
          mode: "parallel",
          runId: "native-run-arrived-late",
          results: [{ index: 0, agent: "researcher", task: "Inspect the adapter", exitCode: 0 }],
        },
      },
      lifecycleStatus: "completed",
    });
    const finalEvents = tracker.observe({
      toolCallId,
      tasks: finalTasks,
      lifecycleStatus: "completed",
    });

    expect(finalEvents.some((event) => event.type === "started")).toBe(false);
    expect(
      finalEvents
        .filter((event) => event.type === "completed")
        .map((event) => event.task.taskId)
        .sort(),
    ).toEqual(["pi-tool-call-42", "pi-tool-call-42:result:0"]);
    expect(finalTasks.map((task) => task.taskId).sort()).toEqual([
      "pi-tool-call-42",
      "pi-tool-call-42:result:0",
    ]);
  });

  it("uses sparse native child indexes when result and progress arrays are reordered", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-native",
      partialResult: {
        details: {
          mode: "parallel",
          runId: "run-sparse",
          results: [
            { index: 8, agent: "later", task: "Later child", exitCode: 0 },
            { index: 3, agent: "earlier", task: "Earlier child", exitCode: 0 },
          ],
          progress: [
            { index: 3, agent: "earlier", task: "Earlier child", status: "completed" },
            { index: 8, agent: "later", task: "Later child", status: "completed" },
          ],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });

    expect(tasks.map((task) => task.taskId)).toEqual([
      "call-native:result:8",
      "call-native:result:3",
      "call-native",
    ]);
  });

  it("maps stopped native children to interrupted before errors and exit codes", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-native",
      partialResult: {
        details: {
          mode: "parallel",
          runId: "run-stopped",
          results: [
            {
              index: 4,
              agent: "worker",
              task: "Stopped child",
              stopped: true,
              error: "process exited",
              exitCode: 1,
            },
          ],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });

    expect(tasks).toMatchObject([
      { taskId: "call-native:result:4", status: "interrupted" },
      { taskId: "call-native", status: "interrupted" },
    ]);
  });

  it("maps native detached and interrupted child results to stopped fold outcomes", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-native",
      partialResult: {
        details: {
          ...nativeDetails,
          results: [{ ...nativeDetails.results[0], exitCode: 1, detached: true }],
          progress: [],
          workflowGraph: {
            ...nativeDetails.workflowGraph,
            nodes: [{ ...nativeDetails.workflowGraph.nodes[0], status: "detached" }],
          },
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    const tracker = createTakomiSubagentTaskTracker();
    const events = tracker.observe({
      toolCallId: "call-native",
      tasks,
      lifecycleStatus: "inProgress",
    });
    const activities = events.map((event, index) => ({
      id: `event-${index}`,
      kind: `task.${event.type}`,
      payload: {
        taskId: event.task.taskId,
        taskType: event.task.taskType,
        title: event.task.title,
        parentAgentId: event.task.parentAgentId,
        agentKind: "agent",
        ...(event.type === "progress" ? { status: event.task.status } : {}),
        ...(event.type === "completed" ? { status: event.completionStatus } : {}),
      },
      createdAt: `2026-01-01T00:00:0${index}.000Z`,
    }));
    const folded = foldSubagentActivities(activities as never);
    expect(folded.find((agent) => agent.id === "call-native:result:0")?.status).toBe("interrupted");
    expect(folded.find((agent) => agent.id === "call-native")?.status).toBe("interrupted");
  });

  it("does not emit unchanged native progress snapshots twice", () => {
    const tracker = createTakomiSubagentTaskTracker();
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-native",
      partialResult: {
        details: {
          ...nativeDetails,
          results: [nativeDetails.results[0]],
          progress: [],
          workflowGraph: {
            ...nativeDetails.workflowGraph,
            nodes: [{ ...nativeDetails.workflowGraph.nodes[0], status: "running" }],
          },
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    expect(
      tracker.observe({ toolCallId: "call-native", tasks, lifecycleStatus: "inProgress" }),
    ).not.toEqual([]);
    expect(
      tracker.observe({ toolCallId: "call-native", tasks, lifecycleStatus: "inProgress" }),
    ).toEqual([]);
  });
});

describe("normalizeTakomiPresentation", () => {
  it("discloses independently truncated presentation dimensions", () => {
    const presentation = normalizeTakomiPresentation({
      toolName: "takomi_board",
      args: {},
      result: {
        stages: Array.from({ length: 13 }, (_, index) => ({ id: index, title: `Stage ${index}` })),
        artifacts: Array.from({ length: 9 }, (_, index) => ({ path: `artifact-${index}` })),
        output: "x".repeat(20_000),
      },
      partialResult: undefined,
      isError: false,
      lifecycleStatus: "completed",
    });

    expect(presentation?.summary?.items).toHaveLength(12);
    expect(presentation?.artifactRefs).toHaveLength(8);
    expect(presentation?.truncation).toMatchObject({
      items: true,
      artifactRefs: true,
      detailText: true,
      inspectorDetailText: true,
    });
  });

  it("uses the same ID-priority for subagent summaries and activities", () => {
    const presentation = normalizeTakomiPresentation({
      toolName: "takomi_subagent",
      args: {},
      result: {
        results: [
          {
            id: "canonical-child",
            agentId: "conflicting-agent",
            agent: "researcher",
            messages: [{ role: "assistant", content: [{ type: "text", text: "Found it" }] }],
          },
        ],
      },
      partialResult: undefined,
      isError: false,
      lifecycleStatus: "completed",
    });

    expect(presentation?.summary?.items?.[0]?.id).toBe("canonical-child");
    expect(presentation?.activity?.[0]?.agentId).toBe("canonical-child");
  });

  it("uses numeric subagent IDs and preserves the result-N fallback consistently", () => {
    const presentation = normalizeTakomiPresentation({
      toolName: "takomi_subagent",
      args: {},
      result: {
        results: [
          {
            id: 42,
            agentId: 7,
            agent: "researcher",
            messages: [{ role: "assistant", content: [{ type: "text", text: "Found it" }] }],
          },
          {
            agent: "builder",
            messages: [{ role: "assistant", content: [{ type: "text", text: "Built it" }] }],
          },
        ],
      },
      partialResult: undefined,
      isError: false,
      lifecycleStatus: "completed",
    });

    expect(presentation?.summary?.items?.map((item) => item.id)).toEqual(["42", "result-1"]);
    expect(presentation?.activity?.map((item) => item.agentId)).toEqual(["42", "result-1"]);
  });

  it("reconciles stale active subagent statuses when the tool has completed", () => {
    const presentation = normalizeTakomiPresentation({
      toolName: "takomi_subagent",
      args: {},
      result: {
        status: "InProgress",
        results: [
          {
            id: "child-1",
            agent: "reviewer",
            status: "InProgress",
            progress: { currentTool: "read", currentToolArgs: "PiAdapter.ts" },
          },
        ],
      },
      partialResult: undefined,
      isError: false,
      lifecycleStatus: "completed",
    });

    expect(presentation?.summary?.status).toBe("completed");
    expect(presentation?.summary?.items?.[0]?.status).toBe("completed");
    expect(presentation?.activity?.at(-1)?.status).toBe("completed");
  });

  it("preserves terminal child status when transport lifecycle differs", () => {
    const presentation = normalizeTakomiPresentation({
      toolName: "takomi_subagent",
      args: {},
      result: {
        status: "failed",
        results: [
          {
            id: "child-1",
            agent: "reviewer",
            status: "failed",
            progress: { currentTool: "read" },
          },
        ],
      },
      partialResult: undefined,
      isError: false,
      lifecycleStatus: "completed",
    });

    expect(presentation?.summary?.status).toBe("failed");
    expect(presentation?.summary?.items?.[0]?.status).toBe("failed");
    expect(presentation?.activity?.at(-1)?.status).toBe("failed");
  });

  it("preserves every non-deleted todo item", () => {
    const presentation = normalizeTakomiPresentation({
      toolName: "todo",
      args: {},
      result: {
        tasks: Array.from({ length: 25 }, (_, index) => ({
          id: `task-${index + 1}`,
          title: `Task ${index + 1}`,
          status: index === 24 ? "deleted" : "pending",
        })),
        output: "[pending] #1 Task 1\n[pending] #2 Task 2",
      },
      partialResult: {},
      isError: false,
      lifecycleStatus: "completed",
    });

    expect(presentation?.summary?.total).toBe(24);
    expect(presentation?.summary?.items).toHaveLength(12);
    expect(presentation?.summary?.items?.at(-1)?.label).toBe("Task 12");
    expect(presentation?.truncation?.items).toBe(true);
    expect(presentation?.detailText).toBeUndefined();
    expect(presentation?.inspectorDetailText).toBeUndefined();
  });
});

describe("planStepsFromTodoTasks", () => {
  it("maps todo statuses onto plan steps and drops deleted and cancelled tasks", () => {
    expect(
      planStepsFromTodoTasks([
        { id: "1", title: "Read files", status: "completed" },
        { id: "2", title: "Fix it", status: "in_progress" },
        { id: "3", title: "Run tests", status: "pending" },
        { id: "4", title: "Old task", status: "cancelled" },
        { id: "5", title: "Gone", status: "deleted" },
      ]),
    ).toEqual([
      { step: "Read files", status: "completed" },
      { step: "Fix it", status: "inProgress" },
      { step: "Run tests", status: "pending" },
    ]);
  });

  it("covers the full task list beyond the presentation truncation limit", () => {
    const tasks = Array.from({ length: 25 }, (_, index) => ({
      id: `task-${index + 1}`,
      title: `Task ${index + 1}`,
      status: index === 24 ? "deleted" : index % 2 === 0 ? "completed" : "pending",
    }));

    const plan = planStepsFromTodoTasks(tasks);

    expect(plan).toHaveLength(24);
    expect(plan?.[0]).toEqual({ step: "Task 1", status: "completed" });
    expect(plan?.at(-1)).toEqual({ step: "Task 24", status: "pending" });
  });

  it("falls back to a default step label for blank task titles", () => {
    expect(planStepsFromTodoTasks([{ id: "1", title: "   ", status: "running" }])).toEqual([
      { step: "Task", status: "inProgress" },
    ]);
  });

  it("returns an empty plan for an explicit cleared task list", () => {
    expect(planStepsFromTodoTasks(undefined)).toBeNull();
    expect(planStepsFromTodoTasks([])).toEqual([]);
    expect(planStepsFromTodoTasks([{ id: "1", title: "Gone", status: "deleted" }])).toEqual([]);
  });
});

describe("Pi Agents-surface parity (Claude reference)", () => {
  it("titles with the task description and keeps the agent kind as role", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-parity",
      partialResult: {
        details: {
          mode: "parallel",
          results: [
            {
              agent: "Explore",
              task: "Explore Takomi subagent backend",
              status: "running",
              progress: { index: 0, status: "running", currentTool: "Read" },
            },
          ],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    expect(tasks.find((task) => task.taskId === "call-parity:result:0")).toMatchObject({
      taskId: "call-parity:result:0",
      description: "Explore Takomi subagent backend",
      title: "Explore Takomi subagent backend",
      role: "Explore",
      lastToolName: "Read",
    });
  });

  it("suppresses placeholder zero usage so rows read — tok until live totals land", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-zero",
      partialResult: {
        details: { results: [{ agent: "worker", task: "Work", usage: { input: 0, output: 0 } }] },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    expect(tasks[0]?.typedUsage).toBeUndefined();
  });

  it("never merges an index-less progress entry into the wrong child", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-mismerge",
      partialResult: {
        details: {
          mode: "parallel",
          results: [
            { index: 0, agent: "researcher", task: "Inspect", status: "completed" },
            { index: 1, agent: "builder", task: "Implement", status: "running" },
          ],
          progress: [{ agent: "builder", status: "running", tokens: 41, toolCount: 3 }],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    const researcher = tasks.find((task) => task.taskId === "call-mismerge:result:0");
    const builder = tasks.find((task) => task.taskId === "call-mismerge:result:1");
    expect(researcher?.typedUsage).toBeUndefined();
    expect(builder?.typedUsage).toMatchObject({ totalTokens: 41, toolUses: 3 });
  });

  it("falls back to the session model when a child omits its own", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-model",
      partialResult: { details: { results: [{ agent: "worker", task: "Work" }] } },
      result: undefined,
      lifecycleStatus: "inProgress",
      fallbackModel: "openai/gpt-5.5",
    });
    expect(tasks[0]?.model).toBe("openai/gpt-5.5");
  });

  it("counts observed tool calls when native counters stay at zero", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-tools",
      partialResult: {
        details: {
          results: [
            {
              agent: "worker",
              task: "List the folders",
              status: "completed",
              exitCode: 0,
              usage: { input: 0, output: 0 },
              toolCount: 0,
              toolCalls: [
                { text: "read dir", expandedText: "listed 12 entries" },
                { text: "read dir", expandedText: "listed 3 entries" },
              ],
              messages: [
                {
                  role: "assistant",
                  content: [{ type: "toolCall", name: "read", arguments: "{}" }],
                },
              ],
            },
          ],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    expect(tasks[0]?.typedUsage).toMatchObject({ toolUses: 2 });
  });

  it("prefers a positive native tool count over the observed one", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-native-tools",
      partialResult: {
        details: {
          results: [
            {
              agent: "worker",
              task: "Work",
              toolCount: 46,
              usage: { input: 100, output: 56 },
              toolCalls: [{ text: "one" }],
            },
          ],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    expect(tasks[0]?.typedUsage).toMatchObject({ totalTokens: 156, toolUses: 46 });
  });

  it("keeps end-of-task totals when a stale progress entry reports zeros", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-clobber",
      partialResult: undefined,
      result: {
        details: {
          mode: "single",
          results: [
            {
              index: 0,
              agent: "worker",
              task: "List the folders",
              status: "completed",
              exitCode: 0,
              usage: { input: 1200, output: 300 },
              toolCount: 4,
              progress: { index: 0, status: "completed", tokens: 1500, toolCount: 4 },
            },
          ],
          progress: [{ index: 0, status: "running", tokens: 0, toolCount: 0 }],
        },
      },
      lifecycleStatus: "completed",
    });
    const child = tasks.find((task) => task.taskId === "call-clobber:result:0");
    expect(child?.status).toBe("completed");
    expect(child?.typedUsage).toMatchObject({ totalTokens: 1500, toolUses: 4 });
  });

  it("merges partial nested usage fields without discarding sibling counters", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-partial-usage",
      partialResult: {
        details: {
          results: [
            {
              index: 0,
              agent: "worker",
              task: "Work",
              usage: { input: 100, output: 20 },
              progress: { index: 0, usage: { cacheRead: 50 } },
            },
          ],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });

    expect(tasks.find((task) => task.taskId === "call-partial-usage:result:0")?.typedUsage).toEqual(
      {
        totalTokens: 120,
        inputTokens: 100,
        cachedInputTokens: 50,
        outputTokens: 20,
      },
    );
  });

  it("keeps a live total when the final frame regresses to placeholder zeros", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-regress",
      partialResult: {
        details: {
          results: [
            {
              index: 0,
              agent: "worker",
              task: "Work",
              status: "running",
              progress: { index: 0, status: "running", tokens: 41, toolCount: 3 },
            },
          ],
        },
      },
      result: {
        details: {
          results: [
            {
              index: 0,
              agent: "worker",
              task: "Work",
              status: "completed",
              exitCode: 0,
              usage: { input: 0, output: 0 },
              toolCount: 0,
            },
          ],
        },
      },
      lifecycleStatus: "completed",
    });
    const child = tasks.find((task) => task.taskId === "call-regress:result:0");
    expect(child?.status).toBe("completed");
    expect(child?.typedUsage).toMatchObject({ totalTokens: 41, toolUses: 3 });
  });

  it("re-emits real totals when the end-of-tool frame follows an early zero terminal snapshot", () => {
    // Production shape: an early partial already carried a terminal child
    // with placeholder zeros; the authoritative tool-end frame then delivers
    // usage, progressSummary counters, and toolCalls (6 tools, 6839 tokens).
    const toolCallId = "call-authoritative-end";
    const tracker = createTakomiSubagentTaskTracker();
    const early = normalizeTakomiSubagentTasks({
      toolCallId,
      partialResult: {
        details: {
          mode: "single",
          results: [{ agent: "worker", task: "List the folders", status: "completed" }],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    const earlyEvents = tracker.observe({
      toolCallId,
      tasks: early,
      lifecycleStatus: "inProgress",
    });
    expect(earlyEvents.filter((e) => e.type === "completed")).toHaveLength(2);

    const final = normalizeTakomiSubagentTasks({
      toolCallId,
      partialResult: undefined,
      result: {
        details: {
          mode: "single",
          results: [
            {
              agent: "worker",
              task: "List the folders",
              exitCode: 1,
              error: "Acceptance rejected",
              usage: { input: 6141, output: 698, cacheRead: 6144 },
              model: "openai-codex/gpt-5.6-luna:minimal",
              progressSummary: { toolCount: 6, tokens: 6839, durationMs: 22553 },
              toolCalls: Array.from({ length: 6 }, (_, i) => ({ text: `tool-${i}` })),
            },
          ],
        },
      },
      lifecycleStatus: "completed",
    });
    const finalChild = final.find((t) => t.taskId === `${toolCallId}:result:0`);
    expect(finalChild?.typedUsage).toMatchObject({ totalTokens: 6839, toolUses: 6 });
    const finalEvents = tracker.observe({ toolCallId, tasks: final, lifecycleStatus: "completed" });
    // Never re-opened, but the new totals are re-emitted for the fold.
    expect(finalEvents.some((e) => e.type === "started")).toBe(false);
    expect(
      finalEvents.filter((event) => event.type === "progress").map((event) => event.task.status),
    ).toEqual(["failed", "failed"]);
    const refresh = finalEvents.filter(
      (e) => e.type === "progress" && e.task.taskId === `${toolCallId}:result:0`,
    );
    expect(refresh).toHaveLength(1);
    if (refresh[0]?.type === "progress") {
      expect(refresh[0].task).toMatchObject({
        status: "failed",
        error: "Acceptance rejected",
      });
      expect(refresh[0].task.typedUsage).toMatchObject({ totalTokens: 6839, toolUses: 6 });
    }
  });

  it("forwards live counters that arrive after an early placeholder completion", () => {
    // Pi reported the child terminal with zeros, then kept working: later
    // live frames must flow (updated/progress) without re-opening (started).
    const toolCallId = "call-live-after-terminal";
    const tracker = createTakomiSubagentTaskTracker();
    const early = normalizeTakomiSubagentTasks({
      toolCallId,
      partialResult: {
        details: { results: [{ agent: "worker", task: "Work", status: "completed" }] },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    expect(
      tracker
        .observe({ toolCallId, tasks: early, lifecycleStatus: "inProgress" })
        .map((e) => e.type),
    ).toContain("completed");

    const live = normalizeTakomiSubagentTasks({
      toolCallId,
      partialResult: {
        details: {
          results: [
            {
              agent: "worker",
              task: "Work",
              status: "running",
              progress: {
                index: 0,
                status: "running",
                tokens: 1200,
                toolCount: 2,
                currentTool: "read",
              },
            },
          ],
        },
      },
      result: undefined,
      lifecycleStatus: "inProgress",
    });
    const liveEvents = tracker.observe({ toolCallId, tasks: live, lifecycleStatus: "inProgress" });
    const types = liveEvents.map((e) => e.type);
    expect(types).toContain("updated");
    expect(types).toContain("progress");
    expect(types).not.toContain("started");
    expect(types).not.toContain("completed");
    const progress = liveEvents.find((e) => e.type === "progress");
    if (progress?.type === "progress") {
      expect(progress.task.typedUsage).toMatchObject({ totalTokens: 1200, toolUses: 2 });
      expect(progress.task.lastToolName).toBe("read");
    }
  });

  it("reads the end-of-task progressSummary rollup when usage is absent", () => {
    const tasks = normalizeTakomiSubagentTasks({
      toolCallId: "call-summary-only",
      partialResult: undefined,
      result: {
        details: {
          mode: "single",
          results: [
            {
              agent: "worker",
              task: "Work",
              exitCode: 0,
              progressSummary: { toolCount: 6, tokens: 6839, durationMs: 22553 },
            },
          ],
        },
      },
      lifecycleStatus: "completed",
    });
    expect(tasks.find((t) => t.taskId === "call-summary-only:result:0")?.typedUsage).toMatchObject({
      totalTokens: 6839,
      toolUses: 6,
      durationMs: 22553,
    });
  });
});

describe("Pi adapter process-path JSONL decoding", () => {
  const startInput = (threadId: ThreadId) => ({
    threadId,
    provider: ProviderDriverKind.make("pi"),
    cwd: process.cwd(),
    runtimeMode: "full-access" as const,
  });

  effectIt.live("keeps delayed A command notices on A while native B is running", () =>
    runPiLifecycleScenario((scenario) =>
      Effect.gen(function* () {
        const { adapter, events, threadId, waitFor } = scenario;
        yield* adapter.startSession(startInput(threadId));
        const a = yield* adapter.sendTurn({ threadId, input: "/delayed-a", attachments: [] });
        yield* waitFor(
          (event) =>
            event.type === "runtime.warning" &&
            event.payload.message === "Prompt drained: /delayed-a",
        );
        expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
          { turnId: a.turnId, payload: { state: "completed" } },
        ]);
        const b = yield* adapter.sendTurn({ threadId, input: "/run-before", attachments: [] });
        yield* waitFor(
          (event) =>
            event.type === "runtime.warning" &&
            event.payload.message === "Prompt drained: /run-before",
        );
        yield* advancePeer(scenario, "report-delayed-a");
        const notices = events.filter(
          (event) =>
            event.type === "runtime.warning" && event.payload.message === "Delayed A failure.",
        );
        expect(notices).toHaveLength(2);
        expect(notices.map((event) => event.turnId)).toEqual([a.turnId, a.turnId]);
        expect(notices.map((event) => event.payload)).toMatchObject([
          { detail: { kind: "pi.extension-error" } },
          { detail: { kind: "pi.prompt-outcome", outcome: "failed", commandName: "delayed-a" } },
        ]);
        expect((yield* adapter.listSessions())[0]).toMatchObject({
          status: "running",
          activeTurnId: b.turnId,
        });
        expect(events.filter((event) => event.type === "turn.started")).toHaveLength(2);
        expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(1);
        yield* advancePeer(scenario, "settle-before");
        yield* advancePeer(scenario, "finish-settlement");
        expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
          { turnId: a.turnId, payload: { state: "completed" } },
          { turnId: b.turnId, payload: { state: "completed" } },
        ]);
        yield* adapter.stopSession(threadId);
      }),
    ),
  );

  for (const invalid of ["string", "null", "object", "data-null", "data-array"]) {
    for (const active of [false, true]) {
      effectIt.live(
        `rejects invalid prompt disposition ${invalid} with unrelated run active=${active}`,
        () =>
          runPiLifecycleScenario((scenario) =>
            Effect.gen(function* () {
              const { adapter, events, threadId, waitFor } = scenario;
              yield* adapter.startSession(startInput(threadId));
              if (active) {
                yield* adapter.sendTurn({ threadId, input: "/run-before", attachments: [] });
                yield* waitFor(
                  (event) =>
                    event.type === "runtime.warning" &&
                    event.payload.message === "Prompt drained: /run-before",
                );
              }
              const turn = yield* adapter.sendTurn({
                threadId,
                input: `/invalid-${invalid}`,
                attachments: [],
              });
              yield* waitFor(
                (event) =>
                  event.type === "runtime.warning" &&
                  event.payload.message === `Prompt drained: /invalid-${invalid}`,
              );
              const outcomes = events.filter(
                (event) =>
                  event.type === "runtime.warning" &&
                  isRecord(event.payload.detail) &&
                  event.payload.detail.kind === "pi.prompt-outcome",
              );
              expect(outcomes).toHaveLength(active ? 2 : 1);
              expect(outcomes.at(-1)).toMatchObject({
                turnId: turn.turnId,
                payload: {
                  message: "Pi returned an invalid prompt disposition.",
                  detail: {
                    outcome: "failed",
                    commandName: `invalid-${invalid}`,
                    requestId: expect.stringMatching(/^prompt-/),
                  },
                },
              });
              expect(JSON.stringify(events)).not.toContain("private-invalid-disposition");
              expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(
                active ? 0 : 1,
              );
              if (active) {
                expect((yield* adapter.listSessions())[0]).toMatchObject({
                  status: "running",
                  activeTurnId: turn.turnId,
                });
                yield* advancePeer(scenario, "settle-before");
                yield* advancePeer(scenario, "finish-settlement");
                expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
                  { turnId: turn.turnId, payload: { state: "completed" } },
                ]);
              } else {
                expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
                  {
                    turnId: turn.turnId,
                    payload: {
                      state: "failed",
                      errorMessage: "Pi returned an invalid prompt disposition.",
                    },
                  },
                ]);
                expect((yield* adapter.listSessions())[0]?.status).toBe("error");
              }
              yield* adapter.stopSession(threadId);
            }),
          ),
      );
    }
  }

  effectIt.live("preserves legacy absent disposition without treating it as invalid", () =>
    runPiLifecycleScenario(({ adapter, events, threadId, waitFor }) =>
      Effect.gen(function* () {
        yield* adapter.startSession(startInput(threadId));
        const turn = yield* adapter.sendTurn({
          threadId,
          input: "/invalid-missing",
          attachments: [],
        });
        yield* waitFor(
          (event) =>
            event.type === "runtime.warning" &&
            event.payload.message === "Prompt drained: /invalid-missing",
        );
        expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(0);
        expect(
          events.some(
            (event) =>
              event.type === "runtime.warning" &&
              isRecord(event.payload.detail) &&
              event.payload.detail.kind === "pi.prompt-outcome",
          ),
        ).toBe(false);
        expect((yield* adapter.listSessions())[0]).toMatchObject({
          status: "running",
          activeTurnId: turn.turnId,
        });
        yield* adapter.stopSession(threadId);
      }),
    ),
  );

  for (const input of ["/takomi-status", "consumed by an input handler"]) {
    effectIt.live(`settles handled input without a native run: ${input}`, () =>
      runPiLifecycleScenario(({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          const turn = yield* adapter.sendTurn({ threadId, input, attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === `Prompt drained: ${input}`,
          );
          expect(
            events.filter(
              (event) => event.type === "turn.completed" && event.turnId === turn.turnId,
            ),
          ).toMatchObject([{ payload: { state: "completed" } }]);
          expect((yield* adapter.listSessions())[0]?.status).toBe("ready");
          expect(
            events.some(
              (event) => event.type === "content.delta" || event.type === "item.completed",
            ),
          ).toBe(false);
          yield* adapter.stopSession(threadId);
          expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(1);
        }),
      ),
    );
  }

  for (const input of ["/run-before", "/run-after", "/run-started", "/run-queued"]) {
    effectIt.live(`keeps native work visible through settlement: ${input}`, () =>
      runPiLifecycleScenario((scenario) =>
        Effect.gen(function* () {
          const { adapter, events, threadId, waitFor } = scenario;
          yield* adapter.startSession(startInput(threadId));
          const submission = yield* adapter.sendTurn({ threadId, input, attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === `Prompt drained: ${input}`,
          );
          if (input === "/run-after") {
            expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
              { turnId: submission.turnId, payload: { state: "completed" } },
            ]);
            expect((yield* adapter.listSessions())[0]?.status).toBe("ready");
            yield* advancePeer(scenario, "start-after");
          } else if (input !== "/run-before") {
            expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(0);
            yield* advancePeer(scenario, "start-accepted");
          }
          const nativeTurn = (yield* adapter.listSessions())[0]?.activeTurnId;
          expect(nativeTurn).toBeDefined();
          expect((yield* adapter.listSessions())[0]?.status).toBe("running");
          expect(nativeTurn === submission.turnId).toBe(input !== "/run-after");
          expect(events.filter((event) => event.type === "turn.started")).toHaveLength(
            input === "/run-after" ? 2 : 1,
          );
          expect(events.find((event) => event.type === "content.delta")).toMatchObject({
            turnId: nativeTurn,
            payload: { delta: "Native review text" },
          });
          expect(
            events.find(
              (event) => event.type === "item.completed" && event.itemId === "review-read",
            ),
          ).toMatchObject({ turnId: nativeTurn });
          expect(
            events.some((event) => event.type === "turn.completed" && event.turnId === nativeTurn),
          ).toBe(false);
          yield* advancePeer(scenario, input === "/run-before" ? "settle-before" : "settle-native");
          // agent_end is not the session-level settlement boundary.
          expect((yield* adapter.listSessions())[0]?.status).toBe("running");
          expect(
            events.some((event) => event.type === "turn.completed" && event.turnId === nativeTurn),
          ).toBe(false);
          yield* advancePeer(scenario, "finish-settlement");
          expect(
            events.filter(
              (event) => event.type === "turn.completed" && event.turnId === nativeTurn,
            ),
          ).toMatchObject([{ payload: { state: "completed" } }]);
          expect((yield* adapter.listSessions())[0]?.status).toBe("ready");
          const snapshot = yield* adapter.readThread(threadId);
          expect(snapshot.turns.map((turn) => turn.id)).toEqual(
            events.filter((event) => event.type === "turn.started").map((event) => event.turnId),
          );
          expect(snapshot.turns.find((turn) => turn.id === nativeTurn)?.items).toHaveLength(1);
          yield* adapter.stopSession(threadId);
        }),
      ),
    );
  }

  effectIt.live(
    "waits for native settlement when an associated command failure precedes handled",
    () =>
      runPiLifecycleScenario((scenario) =>
        Effect.gen(function* () {
          const { adapter, events, threadId, waitFor } = scenario;
          yield* adapter.startSession(startInput(threadId));
          const turn = yield* adapter.sendTurn({
            threadId,
            input: "/fail-run-before",
            attachments: [],
          });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Prompt drained: /fail-run-before",
          );
          expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(0);
          expect((yield* adapter.listSessions())[0]?.status).toBe("running");
          // A subsequent handled input must not erase the run's recorded failure.
          yield* adapter.sendTurn({ threadId, input: "/takomi-status", attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Prompt drained: /takomi-status",
          );
          yield* advancePeer(scenario, "settle-before");
          yield* advancePeer(scenario, "finish-settlement");
          expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
            {
              turnId: turn.turnId,
              payload: { state: "failed", errorMessage: "Synthetic extension failure." },
            },
          ]);
          yield* adapter.stopSession(threadId);
        }),
      ),
  );

  effectIt.live(
    "keeps a command-name-only error unattributed when matching submissions overlap",
    () =>
      runPiLifecycleScenario(({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          const turn = yield* adapter.sendTurn({ threadId, input: "/ambiguous", attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Prompt drained: /ambiguous",
          );
          yield* adapter.sendTurn({ threadId, input: "/ambiguous", attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Ambiguous commands drained",
          );
          expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
            { turnId: turn.turnId, payload: { state: "completed" } },
          ]);
          expect(
            events.find(
              (event) =>
                event.type === "runtime.warning" &&
                event.payload.message === "Unattributed command failure.",
            )?.payload,
          ).toMatchObject({ detail: { kind: "pi.extension-error" } });
          expect(
            events.filter(
              (event) =>
                event.type === "runtime.warning" &&
                isRecord(event.payload.detail) &&
                event.payload.detail.outcome === "failed",
            ),
          ).toHaveLength(0);
          yield* adapter.stopSession(threadId);
        }),
      ),
  );

  effectIt.live(
    "bounds outstanding acknowledgement correlation and frees it on response and teardown",
    () =>
      runPiLifecycleScenario((scenario) =>
        Effect.gen(function* () {
          const { adapter, threadId, waitFor } = scenario;
          yield* adapter.startSession(startInput(threadId));
          for (let count = 1; count <= 100; count++) {
            yield* adapter.sendTurn({ threadId, input: "/hold", attachments: [] });
            yield* waitFor(
              (event) =>
                event.type === "runtime.warning" &&
                event.payload.message === `Held prompt count: ${count}`,
            );
          }
          const full = yield* Effect.exit(
            adapter.sendTurn({ threadId, input: "/hold", attachments: [] }),
          );
          expect(Exit.isFailure(full)).toBe(true);
          yield* advancePeer(scenario, "release-held");
          yield* adapter.sendTurn({ threadId, input: "/takomi-status", attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Prompt drained: /takomi-status",
          );
          yield* adapter.stopSession(threadId);
          yield* adapter.startSession(startInput(threadId));
          yield* adapter.sendTurn({ threadId, input: "/hold", attachments: [] });
          yield* adapter.stopSession(threadId);
        }),
      ),
  );

  effectIt.live(
    "ignores acknowledgements after native settlement without reopening a terminal turn",
    () =>
      runPiLifecycleScenario(({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          const turn = yield* adapter.sendTurn({
            threadId,
            input: "/run-finished-before-ack",
            attachments: [],
          });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Prompt drained: /run-finished-before-ack",
          );
          expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
            { turnId: turn.turnId, payload: { state: "completed" } },
          ]);
          const next = yield* adapter.sendTurn({
            threadId,
            input: "/takomi-status",
            attachments: [],
          });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Prompt drained: /takomi-status",
          );
          expect(events.filter((event) => event.type === "turn.started")).toHaveLength(2);
          expect(
            events.filter(
              (event) => event.type === "turn.completed" && event.turnId === next.turnId,
            ),
          ).toMatchObject([{ payload: { state: "completed" } }]);
          expect((yield* adapter.listSessions())[0]?.status).toBe("ready");
          yield* adapter.stopSession(threadId);
        }),
      ),
  );

  for (const input of [
    "/takomi-status",
    "consumed by an input handler",
    "steer input",
    "/reject-active",
    "/fail-command",
    "/unrelated-error",
  ]) {
    effectIt.live(`preserves an existing native run while submitting: ${input}`, () =>
      runPiLifecycleScenario((scenario) =>
        Effect.gen(function* () {
          const { adapter, events, threadId, waitFor } = scenario;
          yield* adapter.startSession(startInput(threadId));
          const active = yield* adapter.sendTurn({
            threadId,
            input: "/run-before",
            attachments: [],
          });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Prompt drained: /run-before",
          );
          const command = yield* adapter.sendTurn({ threadId, input, attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === `Prompt drained: ${input}`,
          );
          expect(command.turnId).toBe(active.turnId);
          expect(events.filter((event) => event.type === "turn.started")).toHaveLength(1);
          expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(0);
          expect((yield* adapter.listSessions())[0]).toMatchObject({
            status: "running",
            activeTurnId: active.turnId,
          });
          const outcomes = events.filter(
            (event) =>
              event.type === "runtime.warning" &&
              isRecord(event.payload.detail) &&
              event.payload.detail.kind === "pi.prompt-outcome",
          );
          if (input !== "steer input") {
            expect(outcomes.at(-1)?.payload).toMatchObject({
              detail: {
                outcome:
                  input === "/reject-active" || input === "/fail-command" ? "failed" : "handled",
              },
            });
          } else {
            expect(
              events.some(
                (event) =>
                  event.type === "runtime.warning" &&
                  event.payload.message === "Streaming behavior: steer",
              ),
            ).toBe(true);
          }
          expect(events.filter((event) => event.type === "runtime.error")).toHaveLength(0);
          yield* advancePeer(scenario, "settle-before");
          yield* advancePeer(scenario, "finish-settlement");
          expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
            { turnId: active.turnId, payload: { state: "completed" } },
          ]);
          yield* adapter.stopSession(threadId);
        }),
      ),
    );
  }

  for (const [input, state] of [
    ["/reject", "failed"],
    ["/fail-command", "failed"],
    ["/unrelated-error", "completed"],
    ["input notice", "completed"],
  ] as const) {
    effectIt.live(`attributes only correlated prompt failures: ${input}`, () =>
      runPiLifecycleScenario(({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          const turn = yield* adapter.sendTurn({ threadId, input, attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === `Prompt drained: ${input}`,
          );
          expect(events.filter((event) => event.type === "turn.completed")).toMatchObject([
            { turnId: turn.turnId, payload: { state } },
          ]);
          expect((yield* adapter.listSessions())[0]?.status).toBe(
            state === "failed" ? "error" : "ready",
          );
          yield* adapter.stopSession(threadId);
        }),
      ),
    );
  }

  effectIt.live(
    "fences pending command acknowledgements and native work from a replaced generation",
    () =>
      runPiLifecycleScenario(({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          const old = yield* adapter.sendTurn({ threadId, input: "/hold", attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" && event.payload.message === "Prompt drained: /hold",
          );
          yield* adapter.startSession(startInput(threadId));
          const next = yield* adapter.sendTurn({
            threadId,
            input: "/takomi-status",
            attachments: [],
          });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Prompt drained: /takomi-status",
          );
          expect(
            events.filter(
              (event) => event.type === "turn.completed" && event.turnId === old.turnId,
            ),
          ).toMatchObject([{ payload: { state: "interrupted" } }]);
          expect(
            events.filter(
              (event) => event.type === "turn.completed" && event.turnId === next.turnId,
            ),
          ).toMatchObject([{ payload: { state: "completed" } }]);
          expect(events.filter((event) => event.type === "turn.started")).toHaveLength(2);
          expect(events.some((event) => event.type === "content.delta")).toBe(false);
          expect((yield* adapter.listSessions())[0]?.status).toBe("ready");
          yield* adapter.stopSession(threadId);
        }),
      ),
  );

  effectIt.live(
    "matches discovery's trust gate when starting in an inferred Takomi checkout",
    () => {
      const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pi-inferred-suite-"));
      const argsPath = NodePath.join(cwd, "launch-args.json");
      const agentDir = NodePath.join(cwd, "agent");
      NodeFS.mkdirSync(agentDir);
      NodeFS.writeFileSync(NodePath.join(cwd, "package.json"), '{"name":"takomi"}');
      NodeFS.writeFileSync(
        NodePath.join(agentDir, "settings.json"),
        '{"defaultProjectTrust":"ask"}',
      );
      NodeFS.mkdirSync(NodePath.join(cwd, ".pi", "prompts"), { recursive: true });
      for (const name of [
        "takomi-runtime",
        "takomi-subagents",
        "oauth-router",
        "takomi-context-manager",
        "notify-sound",
        "antigravity-provider",
      ]) {
        const extension = NodePath.join(cwd, ".pi", "extensions", name);
        NodeFS.mkdirSync(extension, { recursive: true });
        NodeFS.writeFileSync(NodePath.join(extension, "index.ts"), "");
      }
      return runPiProcessScenario(
        {
          ...process.env,
          HOME: cwd,
          USERPROFILE: cwd,
          PI_CODING_AGENT_DIR: agentDir,
          T3_PI_CONFORMANCE_LAUNCH_ARGS_PATH: argsPath,
        },
        ({ adapter, threadId }) =>
          Effect.gen(function* () {
            yield* adapter.startSession({ ...startInput(threadId), cwd });
            const args = NodeFS.readFileSync(argsPath, "utf8");
            expect(args).toContain('"--no-extensions"');
            expect(args).not.toContain('"--extension"');
            yield* adapter.stopSession(threadId);
          }),
      ).pipe(
        Effect.ensuring(Effect.sync(() => NodeFS.rmSync(cwd, { recursive: true, force: true }))),
      );
    },
  );

  effectIt.live("preserves fragmented UTF-8 and surfaces malformed and oversized records", () =>
    runPiProcessScenario(
      {
        ...process.env,
        T3_PI_CONFORMANCE_MALFORMED: "1",
        T3_PI_CONFORMANCE_OVERSIZED: "1",
      },
      ({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          yield* adapter.sendTurn({ threadId, input: "Synthetic only", attachments: [] });
          yield* waitFor((event) => event.type === "turn.completed");
          yield* waitFor(
            () =>
              events.filter(
                (event) =>
                  event.type === "runtime.warning" &&
                  event.payload.message === "Pi emitted an invalid RPC record.",
              ).length >= 2,
          );
          const malformedWarnings = events.filter(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Pi emitted an invalid RPC record.",
          );
          expect(malformedWarnings.map(runtimeWarningReason)).toEqual(
            expect.arrayContaining(["invalid-json", "oversized"]),
          );
          expect(new Set(malformedWarnings.map((event) => event.eventId)).size).toBe(
            malformedWarnings.length,
          );
          expect(
            events.find(
              (event) =>
                event.type === "content.delta" && event.payload.delta === "split €\u2028\u2029",
            ),
          ).toBeDefined();
          yield* adapter.stopSession(threadId);
        }),
    ),
  );

  effectIt.live("rejects oversized native UI IDs before canonical request persistence", () =>
    runPiProcessScenario(
      { ...process.env, T3_PI_CONFORMANCE_INVALID_UI_ID: "1" },
      ({ adapter, events, nativeRecords, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          yield* adapter.sendTurn({ threadId, input: "Invalid UI ID", attachments: [] });
          yield* waitFor((event) => event.type === "turn.completed");
          expect(
            nativeRecords.some(
              (record) =>
                isRecord(record) &&
                isRecord(record.event) &&
                isRecord(record.event.payload) &&
                record.event.payload.id === "x".repeat(513),
            ),
          ).toBe(true);
          expect(
            events.some(
              (event) =>
                (event.type === "request.opened" || event.type === "user-input.requested") &&
                String(event.requestId).includes("x".repeat(513)),
            ),
          ).toBe(false);
          yield* adapter.stopSession(threadId);
        }),
    ),
  );

  effectIt.live("flushes an unterminated EOF frame before reporting process exit", () =>
    runPiProcessScenario(
      { ...process.env, T3_PI_CONFORMANCE_UNTERMINATED: "1" },
      ({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          yield* adapter.sendTurn({ threadId, input: "Synthetic EOF", attachments: [] });
          yield* waitFor((event) => runtimeWarningReason(event) === "invalid-json");
          yield* waitFor((event) => event.type === "session.exited");
          const warningIndex = events.findIndex(
            (event) => runtimeWarningReason(event) === "invalid-json",
          );
          const exitIndex = events.findIndex((event) => event.type === "session.exited");
          const opened = events.find((event) => event.type === "request.opened");
          expect(warningIndex).toBeGreaterThanOrEqual(0);
          expect(exitIndex).toBeGreaterThan(warningIndex);
          expect(opened).toBeDefined();
          expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(1);
          expect(events.filter((event) => event.type === "session.exited")).toHaveLength(1);
          expect(
            events.filter(
              (event) => event.type === "request.resolved" && event.requestId === opened?.requestId,
            ),
          ).toHaveLength(1);
        }),
    ),
  );

  effectIt.live("cleans the failed start generation after an abrupt process exit", () =>
    runPiProcessScenario(
      { ...process.env, T3_PI_CONFORMANCE_EARLY_EXIT: "1" },
      ({ adapter, threadId }) =>
        Effect.gen(function* () {
          const result = yield* Effect.exit(adapter.startSession(startInput(threadId)));
          expect(Exit.isFailure(result)).toBe(true);
          expect(yield* adapter.hasSession(threadId)).toBe(false);
        }),
    ),
  );

  effectIt.live("keeps a replacement generation registered when the prior process terminates", () =>
    runPiProcessScenario(process.env, ({ adapter, events, threadId, waitFor }) =>
      Effect.gen(function* () {
        yield* adapter.startSession(startInput(threadId));
        yield* adapter.startSession(startInput(threadId));
        expect(
          (yield* adapter.listSessions()).filter((session) => session.threadId === threadId),
        ).toHaveLength(1);
        yield* adapter.sendTurn({ threadId, input: "Replacement generation", attachments: [] });
        yield* waitFor((event) => event.type === "turn.completed");
        expect(events.filter((event) => event.type === "session.started")).toHaveLength(2);
        expect(
          (yield* adapter.listSessions()).filter((session) => session.threadId === threadId),
        ).toHaveLength(1);
        yield* adapter.stopSession(threadId);
      }),
    ),
  );

  effectIt.live(
    "routes vault secrets once without writing values to native records or runtime events",
    () =>
      runPiProcessScenario(
        {
          ...process.env,
          T3_PI_CONFORMANCE_VAULT_SECRET: "1",
          T3_PI_CONFORMANCE_CAPTURE_UI_RESPONSE: "1",
        },
        ({ adapter, events, nativeRecords, threadId, waitFor }) =>
          Effect.gen(function* () {
            yield* adapter.startSession(startInput(threadId));
            yield* adapter.sendTurn({ threadId, input: "Vault secret", attachments: [] });
            yield* waitFor(
              (event) =>
                event.type === "user-input.requested" &&
                event.payload.questions[0]?.sensitive === true,
            );
            const request = events.find(
              (event) =>
                event.type === "user-input.requested" &&
                event.payload.questions[0]?.sensitive === true,
            );
            if (!request?.requestId || !adapter.respondPiSecretInput)
              throw new Error("Missing secret request");
            const responseId = ApprovalRequestId.make(request.requestId);
            const wrongThread = yield* Effect.exit(
              adapter.respondPiSecretInput(
                ThreadId.make("other-thread"),
                responseId,
                "private-secret-value",
                false,
              ),
            );
            expect(Exit.isFailure(wrongThread)).toBe(true);
            const oversized = yield* Effect.exit(
              adapter.respondPiSecretInput(threadId, responseId, "x".repeat(16 * 1024 + 1), false),
            );
            expect(Exit.isFailure(oversized)).toBe(true);
            const empty = yield* Effect.exit(
              adapter.respondPiSecretInput(threadId, responseId, "", false),
            );
            expect(Exit.isFailure(empty)).toBe(true);
            const rejected = yield* Effect.exit(
              adapter.respondToUserInput(threadId, responseId, {
                [request.requestId]: "ordinary-secret",
              }),
            );
            expect(Exit.isFailure(rejected)).toBe(true);
            yield* adapter.respondPiSecretInput(
              threadId,
              responseId,
              "private-secret-value",
              false,
            );
            const replay = yield* Effect.exit(
              adapter.respondPiSecretInput(threadId, responseId, "private-secret-value", false),
            );
            expect(Exit.isFailure(replay)).toBe(true);
            yield* waitFor(
              (event) =>
                event.type === "runtime.warning" &&
                event.payload.message === "Synthetic UI response captured.",
            );
            expect(
              events.filter(
                (event) =>
                  event.type === "user-input.resolved" && event.requestId === request.requestId,
              ),
            ).toHaveLength(1);
            expect(
              events.find(
                (event) =>
                  event.type === "user-input.resolved" && event.requestId === request.requestId,
              )?.payload,
            ).toMatchObject({ answers: {}, privateResponse: true });
            const encode = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
            const eventText = yield* encode(events).pipe(Effect.orDie);
            expect(eventText).not.toContain("private-secret-value");
            expect(yield* encode(nativeRecords).pipe(Effect.orDie)).not.toContain(
              "private-secret-value",
            );
            expect(eventText).not.toContain("ordinary-secret");
            expect(eventText).not.toContain("Do not persist this hint");
            expect(yield* encode(nativeRecords).pipe(Effect.orDie)).not.toContain(
              "Do not persist this hint",
            );
            yield* adapter.startSession(startInput(threadId));
            yield* adapter.sendTurn({ threadId, input: "Next generation", attachments: [] });
            yield* waitFor(
              () =>
                events.filter(
                  (event) =>
                    event.type === "user-input.requested" &&
                    event.payload.questions[0]?.sensitive === true,
                ).length >= 2,
            );
            const stale = yield* Effect.exit(
              adapter.respondPiSecretInput(threadId, responseId, "private-secret-value", false),
            );
            expect(Exit.isFailure(stale)).toBe(true);
            const next = events.findLast(
              (event) =>
                event.type === "user-input.requested" &&
                event.payload.questions[0]?.sensitive === true,
            );
            if (!next?.requestId) throw new Error("Missing new secret request");
            yield* adapter.respondPiSecretInput(
              threadId,
              ApprovalRequestId.make(next.requestId),
              undefined,
              true,
            );
            yield* waitFor(
              (event) => event.type === "user-input.resolved" && event.requestId === next.requestId,
            );
            expect(
              events.find(
                (event) =>
                  event.type === "user-input.resolved" && event.requestId === next.requestId,
              )?.payload,
            ).toEqual({ answers: {} });
            yield* adapter.stopSession(threadId);
          }),
      ),
  );

  effectIt.live("does not settle unrelated extension commands on prompt acceptance", () =>
    runPiProcessScenario(
      { ...process.env, T3_PI_CONFORMANCE_VAULT_COMMAND: "1" },
      ({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          const turn = yield* adapter.sendTurn({
            threadId,
            input: "/fixture-command",
            attachments: [],
          });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Extension prompt accepted.",
          );
          expect(
            events.some((event) => event.type === "turn.completed" && event.turnId === turn.turnId),
          ).toBe(false);
          yield* adapter.stopSession(threadId);
        }),
    ),
  );

  effectIt.live("marks vault command notifications and labels deletion choices", () =>
    runPiProcessScenario(
      { ...process.env, T3_PI_CONFORMANCE_VAULT_COMMAND: "1" },
      ({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          const vaultTurn = yield* adapter.sendTurn({
            threadId,
            input: "/vault-list",
            attachments: [],
          });
          yield* waitFor(
            (event) => event.type === "turn.completed" && event.turnId === vaultTurn.turnId,
          );
          expect(
            events.find(
              (event) =>
                event.type === "runtime.warning" && event.payload.message.startsWith("Backend:"),
            ),
          ).toMatchObject({ payload: { category: "vault-command" } });
          const deleteTurn = yield* adapter.sendTurn({
            threadId,
            input: "/vault-delete",
            attachments: [],
          });
          yield* waitFor(
            (event) => event.type === "request.opened" && event.turnId === deleteTurn.turnId,
          );
          const request = events.find(
            (event) => event.type === "request.opened" && event.turnId === deleteTurn.turnId,
          );
          expect(request?.type === "request.opened" && request.payload.options).toEqual([
            { decision: "accept", label: "Delete credential" },
            { decision: "decline", label: "Cancel" },
          ]);
          yield* adapter.stopSession(threadId);
        }),
    ),
  );

  effectIt.live("delivers a vault export key and archive once without persisting the key", () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pi-vault-export-"));
    const archivePath = NodePath.join(directory, "vault.transfer");
    NodeFS.writeFileSync(archivePath, "synthetic encrypted archive");
    return runPiProcessScenario(
      {
        ...process.env,
        T3_PI_CONFORMANCE_VAULT_COMMAND: "1",
        T3_PI_CONFORMANCE_EXPORT_ARCHIVE_PATH: archivePath,
      },
      ({ adapter, events, nativeRecords, threadId, waitFor }) =>
        Effect.gen(function* () {
          if (!adapter.takePiVaultExport) throw new Error("Pi export method unavailable");
          yield* adapter.startSession(startInput(threadId));
          yield* adapter.sendTurn({ threadId, input: "/vault-export", attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" && event.payload.category === "vault-export-ready",
          );
          const ready = events.find(
            (event) =>
              event.type === "runtime.warning" && event.payload.category === "vault-export-ready",
          );
          if (ready?.type !== "runtime.warning" || !ready.payload.transferId)
            throw new Error("Missing vault export event");
          const delivered = yield* adapter.takePiVaultExport(threadId, ready.payload.transferId);
          expect(delivered).toEqual({
            filename: "vault.transfer",
            archive: Buffer.from("synthetic encrypted archive").toString("base64"),
            key: "a".repeat(64),
          });
          const second = yield* Effect.exit(
            adapter.takePiVaultExport(threadId, ready.payload.transferId),
          );
          expect(Exit.isFailure(second)).toBe(true);
          expect(JSON.stringify(events)).not.toContain("a".repeat(64));
          expect(JSON.stringify(nativeRecords)).not.toContain("a".repeat(64));
          yield* adapter.stopSession(threadId);
        }),
    ).pipe(
      Effect.ensuring(
        Effect.sync(() => NodeFS.rmSync(directory, { recursive: true, force: true })),
      ),
    );
  });

  effectIt.live("imports an archive through private file and key prompts", () =>
    runPiProcessScenario(
      {
        ...process.env,
        T3_PI_CONFORMANCE_VAULT_COMMAND: "1",
        T3_PI_CONFORMANCE_CAPTURE_UI_RESPONSE: "1",
      },
      ({ adapter, events, nativeRecords, threadId, waitFor }) =>
        Effect.gen(function* () {
          if (!adapter.respondPiSecretInput) throw new Error("Pi secret response unavailable");
          yield* adapter.startSession(startInput(threadId));
          yield* adapter.sendTurn({ threadId, input: "/vault-import", attachments: [] });
          yield* waitFor(
            (event) =>
              event.type === "user-input.requested" &&
              event.payload.questions[0]?.fileInput === "vault-archive",
          );
          const archive = events.find(
            (event) =>
              event.type === "user-input.requested" &&
              event.payload.questions[0]?.fileInput === "vault-archive",
          );
          if (!archive?.requestId) throw new Error("Missing archive prompt");
          yield* adapter.respondPiSecretInput(
            threadId,
            ApprovalRequestId.make(archive.requestId),
            "c3ludGhldGljIGFyY2hpdmU=",
            false,
          );
          yield* waitFor(
            (event) =>
              event.type === "user-input.requested" &&
              event.payload.questions[0]?.header === "Transfer key:",
          );
          const key = events.find(
            (event) =>
              event.type === "user-input.requested" &&
              event.payload.questions[0]?.header === "Transfer key:",
          );
          if (!key?.requestId) throw new Error("Missing key prompt");
          yield* adapter.respondPiSecretInput(
            threadId,
            ApprovalRequestId.make(key.requestId),
            "b".repeat(64),
            false,
          );
          yield* waitFor((event) => event.type === "turn.completed");
          expect(JSON.stringify(events)).not.toContain("c3ludGhldGljIGFyY2hpdmU=");
          expect(JSON.stringify(nativeRecords)).not.toContain("c3ludGhldGljIGFyY2hpdmU=");
          expect(JSON.stringify(events)).not.toContain("b".repeat(64));
          expect(JSON.stringify(nativeRecords)).not.toContain("b".repeat(64));
          yield* adapter.stopSession(threadId);
        }),
    ),
  );

  for (const handlerFails of [false, true]) {
    effectIt.live(
      `settles a discovered vault command after its UI prompt ${handlerFails ? "fails" : "succeeds"}`,
      () =>
        runPiProcessScenario(
          {
            ...process.env,
            T3_PI_CONFORMANCE_VAULT_COMMAND: "1",
            ...(handlerFails ? { T3_PI_CONFORMANCE_VAULT_ERROR: "1" } : {}),
            T3_PI_CONFORMANCE_CAPTURE_UI_RESPONSE: "1",
          },
          ({ adapter, events, nativeRecords, threadId, waitFor }) =>
            Effect.gen(function* () {
              yield* adapter.startSession(startInput(threadId));
              const turn = yield* adapter.sendTurn({
                threadId,
                input: "/vault-add API token",
                attachments: [],
              });
              yield* waitFor((event) => event.type === "user-input.requested");
              const request = events.find((event) => event.type === "user-input.requested");
              if (!request?.requestId || !adapter.respondPiSecretInput)
                throw new Error("Missing vault input request");
              yield* adapter.respondPiSecretInput(
                threadId,
                ApprovalRequestId.make(request.requestId),
                "private-secret-value",
                false,
              );
              yield* waitFor(
                (event) => event.type === "turn.completed" && event.turnId === turn.turnId,
              );
              yield* waitFor(
                (event) =>
                  event.type === "runtime.warning" &&
                  event.payload.message === "Synthetic UI response captured.",
              );
              const terminal = events.filter(
                (event) => event.type === "turn.completed" && event.turnId === turn.turnId,
              );
              expect(terminal).toHaveLength(1);
              expect(terminal[0]?.type === "turn.completed" && terminal[0].payload.state).toBe(
                handlerFails ? "failed" : "completed",
              );
              const encode = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
              expect(yield* encode(events).pipe(Effect.orDie)).not.toContain(
                "private-secret-value",
              );
              expect(yield* encode(nativeRecords).pipe(Effect.orDie)).not.toContain(
                "private-secret-value",
              );
              yield* adapter.stopSession(threadId);
            }),
        ),
    );
  }

  effectIt.live("renders long Pi select and multi-select fallback titles as question bodies", () =>
    runPiProcessScenario(
      { ...process.env, T3_PI_CONFORMANCE_LONG_UI_TITLE: "1" },
      ({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          yield* adapter.sendTurn({ threadId, input: "Long UI titles", attachments: [] });
          yield* waitFor((event) => event.type === "turn.completed");
          for (const [id, header, preview, repeats, method] of [
            ["long-select", "Choose a deployment target", "Option preview text. ", 140, "select"],
            [
              "long-multi-select",
              "Choose all applicable environments",
              "Environment preview text. ",
              130,
              "input",
            ],
          ] as const) {
            const request = events.find(
              (event) =>
                event.type === "user-input.requested" && event.requestId?.endsWith(`-${id}`),
            );
            expect(request?.type).toBe("user-input.requested");
            if (request?.type !== "user-input.requested")
              throw new Error(`Missing ${method} request`);
            const question = request.payload.questions[0];
            expect(question?.header).toBe(header);
            expect(question?.question).toBe(`${header}\n${preview.repeat(repeats)}`);
            expect(question?.options).toHaveLength(method === "select" ? 2 : 0);
          }
          const short = events.find(
            (event) =>
              event.type === "user-input.requested" && event.requestId?.endsWith("-select-1"),
          );
          if (short?.type !== "user-input.requested")
            throw new Error("Missing short select request");
          expect(short.payload.questions[0]?.header).toBe("Select");
          expect(short.payload.questions[0]?.question).toBe("Choose an option below.");
          yield* adapter.stopSession(threadId);
        }),
    ),
  );

  effectIt.live("scopes reused native UI IDs by generation", () =>
    runPiProcessScenario(
      { ...process.env, T3_PI_CONFORMANCE_CAPTURE_UI_RESPONSE: "1" },
      ({ adapter, events, nativeRecords, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          yield* adapter.sendTurn({ threadId, input: "First generation", attachments: [] });
          yield* waitFor((event) => event.type === "request.opened");
          const firstRequestId = events.find(
            (event) => event.type === "request.opened",
          )!.requestId!;
          const supersededRequestIds = events
            .filter(
              (event) => event.type === "request.opened" || event.type === "user-input.requested",
            )
            .map((event) => event.requestId!);

          yield* adapter.startSession(startInput(threadId));
          const supersededTerminalIds = events
            .filter(
              (event) => event.type === "request.resolved" || event.type === "user-input.resolved",
            )
            .map((event) => event.requestId);
          for (const requestId of supersededRequestIds) {
            expect(
              supersededTerminalIds.filter((terminalId) => terminalId === requestId),
            ).toHaveLength(1);
          }
          yield* adapter.sendTurn({ threadId, input: "Replacement generation", attachments: [] });
          yield* waitFor(
            () => events.filter((event) => event.type === "request.opened").length >= 2,
          );
          const requestIds = events
            .filter((event) => event.type === "request.opened")
            .map((event) => event.requestId);
          const replacementRequestId = requestIds.at(-1)!;
          expect(replacementRequestId).not.toBe(firstRequestId);

          const stale = yield* Effect.exit(
            adapter.respondToRequest(threadId, ApprovalRequestId.make(firstRequestId), "accept"),
          );
          expect(Exit.isFailure(stale)).toBe(true);
          yield* adapter.respondToRequest(
            threadId,
            ApprovalRequestId.make(replacementRequestId),
            "accept",
          );
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Synthetic UI response captured.",
          );
          expect(
            nativeRecords.some(
              (record) =>
                isRecord(record) &&
                isRecord(record.event) &&
                isRecord(record.event.payload) &&
                record.event.payload.type === "extension_ui_response_received" &&
                record.event.payload.id === "confirm-1" &&
                record.event.payload.confirmed === true,
            ),
          ).toBe(true);
          const terminalIds = events
            .filter((event) => event.type === "request.resolved")
            .map((event) => event.requestId);
          expect(terminalIds.filter((id) => id === replacementRequestId)).toHaveLength(1);
          yield* adapter.stopSession(threadId);
          const openedRequestIds = events
            .filter(
              (event) => event.type === "request.opened" || event.type === "user-input.requested",
            )
            .map((event) => event.requestId!);
          const terminalRequestIds = events
            .filter(
              (event) => event.type === "request.resolved" || event.type === "user-input.resolved",
            )
            .map((event) => event.requestId);
          for (const requestId of openedRequestIds) {
            expect(
              terminalRequestIds.filter((terminalId) => terminalId === requestId),
            ).toHaveLength(1);
          }
        }),
    ),
  );

  effectIt.live("writes each native Pi record and settles open UI waiters once on stop", () =>
    runPiProcessScenario(process.env, ({ adapter, events, nativeRecords, threadId, waitFor }) =>
      Effect.gen(function* () {
        yield* adapter.startSession(startInput(threadId));
        yield* adapter.sendTurn({ threadId, input: "Native logging", attachments: [] });
        yield* waitFor((event) => event.type === "turn.completed");
        yield* adapter.stopSession(threadId);
        // get_state, get_commands, and prompt responses plus every one of
        // the 32 synthetic native events.
        expect(nativeRecords).toHaveLength(35);
        const openedIds = events
          .filter(
            (event) => event.type === "request.opened" || event.type === "user-input.requested",
          )
          .map((event) => event.requestId!);
        const resolvedIds = events
          .filter(
            (event) => event.type === "request.resolved" || event.type === "user-input.resolved",
          )
          .map((event) => event.requestId);
        expect(openedIds.length).toBeGreaterThan(0);
        for (const requestId of openedIds) {
          expect(resolvedIds.filter((resolvedId) => resolvedId === requestId)).toHaveLength(1);
        }
      }),
    ),
  );

  effectIt.live(
    "keeps Pi normalization alive when native logging fails without exposing the logger error",
    () =>
      runPiProcessScenario(
        { ...process.env, T3_PI_CONFORMANCE_NATIVE_LOG_FAIL: "1" },
        ({ adapter, events, threadId, waitFor }) =>
          Effect.gen(function* () {
            yield* adapter.startSession(startInput(threadId));
            yield* adapter.sendTurn({ threadId, input: "Logger failure", attachments: [] });
            yield* waitFor((event) => event.type === "turn.completed");
            const diagnostics = events.filter(
              (event) =>
                event.type === "runtime.warning" &&
                event.payload.message === "Pi native event logging failed.",
            );
            expect(diagnostics.length).toBeGreaterThan(0);
            expect(diagnostics.map(runtimeWarningReason)).not.toContain(
              "sensitive native logger failure",
            );
            yield* adapter.stopSession(threadId);
          }),
      ),
  );

  effectIt.live("writes one Pi-compatible cancellation for an expired request", () =>
    runPiProcessScenario(
      {
        ...process.env,
        T3_PI_CONFORMANCE_UI_TIMEOUT_ONLY: "1",
        T3_PI_CONFORMANCE_CAPTURE_UI_RESPONSE: "1",
      },
      ({ adapter, events, nativeRecords, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          yield* adapter.sendTurn({ threadId, input: "Timeout cancellation", attachments: [] });
          yield* waitFor((event) => event.type === "request.opened");
          const opened = events.find((event) => event.type === "request.opened")!;
          yield* waitFor(
            (event) => event.type === "request.resolved" && event.requestId === opened.requestId,
          );
          yield* waitFor(
            (event) =>
              event.type === "runtime.warning" &&
              event.payload.message === "Synthetic UI response captured.",
          );
          expect(
            nativeRecords.filter(
              (record) =>
                isRecord(record) &&
                isRecord(record.event) &&
                isRecord(record.event.payload) &&
                record.event.payload.type === "extension_ui_response_received" &&
                record.event.payload.id === "timeout-confirm" &&
                record.event.payload.cancelled === true,
            ),
          ).toHaveLength(1);
          yield* adapter.stopSession(threadId);
        }),
    ),
  );

  effectIt.live(
    "publishes a timeout request before its one terminal settlement when abort races it",
    () =>
      runPiProcessScenario(
        {
          ...process.env,
          T3_PI_CONFORMANCE_UI_TIMEOUT_ONLY: "1",
          T3_PI_CONFORMANCE_CAPTURE_UI_RESPONSE: "1",
        },
        ({ adapter, events, threadId, waitFor }) =>
          Effect.gen(function* () {
            yield* adapter.startSession(startInput(threadId));
            const turn = yield* adapter.sendTurn({
              threadId,
              input: "Timeout and abort race",
              attachments: [],
            });
            yield* waitFor((event) => event.type === "request.opened");
            const opened = events.find((event) => event.type === "request.opened")!;
            yield* adapter.interruptTurn(threadId, turn.turnId);
            yield* waitFor(
              (event) => event.type === "request.resolved" && event.requestId === opened.requestId,
            );
            const openedIndex = events.findIndex(
              (event) => event.type === "request.opened" && event.requestId === opened.requestId,
            );
            const terminal = events.filter(
              (event) => event.type === "request.resolved" && event.requestId === opened.requestId,
            );
            expect(openedIndex).toBeGreaterThanOrEqual(0);
            expect(events.indexOf(terminal[0]!)).toBeGreaterThan(openedIndex);
            expect(terminal).toHaveLength(1);
            yield* waitFor((event) => event.type === "session.exited");
          }),
      ),
  );

  effectIt.live("fences buffered lifecycle output immediately after interruption", () =>
    runPiProcessScenario(process.env, ({ adapter, events, threadId, waitFor }) =>
      Effect.gen(function* () {
        yield* adapter.startSession(startInput(threadId));
        const turn = yield* adapter.sendTurn({
          threadId,
          input: "Interrupt before output is normalized",
          attachments: [],
        });
        yield* adapter.interruptTurn(threadId, turn.turnId);
        yield* waitFor((event) => event.type === "session.exited");
        expect(
          events.some(
            (event) =>
              (event.type === "item.updated" || event.type === "item.completed") &&
              event.itemId === "tool-late",
          ),
        ).toBe(false);
      }),
    ),
  );

  effectIt.live("mirrors todo tool updates onto turn.plan.updated", () =>
    runPiProcessScenario(
      { ...process.env, T3_PI_CONFORMANCE_TODO: "1" },
      ({ adapter, events, threadId, waitFor }) =>
        Effect.gen(function* () {
          yield* adapter.startSession(startInput(threadId));
          const turn = yield* adapter.sendTurn({
            threadId,
            input: "Work through the task list",
            attachments: [],
          });
          yield* waitFor((event) => event.type === "turn.plan.updated");
          yield* waitFor((event) => event.type === "turn.completed");
          const plans = events.filter((event) => event.type === "turn.plan.updated");
          expect(plans).toHaveLength(2);
          for (const plan of plans) {
            expect(plan.turnId).toBe(turn.turnId);
          }
          expect(plans[0]?.payload.plan).toEqual([
            { step: "Read files", status: "completed" },
            { step: "Fix Pi todos", status: "inProgress" },
          ]);
          expect(plans.at(-1)?.payload.plan).toEqual([
            { step: "Read files", status: "completed" },
            { step: "Fix Pi todos", status: "inProgress" },
            { step: "Run tests", status: "pending" },
          ]);
          yield* adapter.stopSession(threadId);
        }),
    ),
  );

  effectIt.live("emits thread.state.changed for Pi auto-compaction with token counts", () =>
    runPiProcessScenario(process.env, ({ adapter, events, threadId, waitFor }) =>
      Effect.gen(function* () {
        yield* adapter.startSession(startInput(threadId));
        yield* adapter.sendTurn({ threadId, input: "Synthetic only", attachments: [] });
        yield* waitFor(
          (event) => event.type === "thread.state.changed" && event.payload.state === "compacted",
        );
        yield* waitFor((event) => event.type === "turn.completed");
        const compacted = events.filter(
          (event): event is Extract<ProviderRuntimeEvent, { type: "thread.state.changed" }> =>
            event.type === "thread.state.changed" && event.payload.state === "compacted",
        );
        expect(compacted).toHaveLength(1);
        // Fixture reports tokensBefore 4 and estimatedTokensAfter 2.
        expect(compacted[0]?.payload.beforeTokens).toBe(4);
        expect(compacted[0]?.payload.afterTokens).toBe(2);
        yield* adapter.stopSession(threadId);
      }),
    ),
  );
});
