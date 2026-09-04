// @effect-diagnostics nodeBuiltinImport:off - The integration tests launch only the synthetic Pi peer.
import * as Path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  PiSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
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
} from "./PiAdapter.ts";
import { ServerConfig } from "../../config.ts";
import type { ProviderAdapterError } from "../Errors.ts";

const decodePiSettings = Schema.decodeSync(PiSettings);
const piMockPeer = Path.join(import.meta.dirname, "../testFixtures/piMockPeer.mjs");
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
    readonly threadId: ThreadId;
    readonly waitFor: (predicate: (event: ProviderRuntimeEvent) => boolean) => Effect.Effect<void>;
  }) => Effect.Effect<void, ProviderAdapterError>,
) {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const adapter = yield* makePiAdapter(
          decodePiSettings({
            binaryPath: process.execPath,
            launchArgs: `"${piMockPeer}"`,
          }),
          { instanceId: ProviderInstanceId.make("pi-conformance"), environment },
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
                  new Error(
                    `Timed out with events: ${events.map((event) => event.type).join(", ")}`,
                  ),
                ),
              ),
            );
          });
        yield* use({
          adapter,
          events,
          threadId: ThreadId.make("pi-decoder-process-path"),
          waitFor,
        });
      }),
    ).pipe(Effect.provide(piAdapterTestLayer)),
  );
}

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
    expect(presentation?.summary?.items).toHaveLength(24);
    expect(presentation?.summary?.items?.at(-1)?.label).toBe("Task 24");
    expect(presentation?.detailText).toBeUndefined();
    expect(presentation?.inspectorDetailText).toBeUndefined();
  });
});

describe("Pi adapter process-path JSONL decoding", () => {
  const startInput = (threadId: ThreadId) => ({
    threadId,
    provider: ProviderDriverKind.make("pi"),
    cwd: process.cwd(),
    runtimeMode: "full-access" as const,
  });

  it("preserves fragmented UTF-8 and surfaces malformed and oversized records", async () => {
    await runPiProcessScenario(
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
          expect(
            events
              .filter((event) => event.type === "runtime.warning")
              .map((event) => event.payload.detail),
          ).toEqual(expect.arrayContaining([{ reason: "invalid-json" }, { reason: "oversized" }]));
          expect(
            events.find(
              (event) =>
                event.type === "content.delta" && event.payload.delta === "split €\u2028\u2029",
            ),
          ).toBeDefined();
          yield* adapter.stopSession(threadId);
        }),
    );
  });

  it("flushes an unterminated EOF frame before reporting process exit", async () => {
    await runPiProcessScenario(
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
          expect(warningIndex).toBeGreaterThanOrEqual(0);
          expect(exitIndex).toBeGreaterThan(warningIndex);
        }),
    );
  });

  it("keeps a replacement generation registered when the prior process terminates", async () => {
    await runPiProcessScenario(process.env, ({ adapter, events, threadId, waitFor }) =>
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
    );
  });
});
