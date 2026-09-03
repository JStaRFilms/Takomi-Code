import { describe, expect, it } from "vite-plus/test";

import { foldSubagentActivities } from "../../../../../packages/client-runtime/src/state/subagentRuntime.ts";
import {
  createTakomiSubagentTaskTracker,
  normalizePiToolWorkLog,
  normalizeTakomiPresentation,
  normalizeTakomiSubagentTasks,
} from "./PiAdapter.ts";

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
        runHandles: { runId: "run-native-7" },
      },
      {
        taskId: "call-native:result:1",
        parentAgentId: "call-native",
        status: "failed",
        error: "tests failed",
        taskType: "local_agent",
      },
      {
        taskId: "call-native",
        status: "failed",
        taskType: "local_workflow",
        runHandles: { runId: "run-native-7" },
      },
    ]);
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
