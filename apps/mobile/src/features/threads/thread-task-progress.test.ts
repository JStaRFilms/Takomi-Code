import { EventId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { activeThreadTasks } from "./thread-task-progress";

const turnId = TurnId.make("turn-1");
const thread = {
  latestTurn: { turnId, startedAt: "2026-01-01T00:00:00.000Z", completedAt: null },
  session: { status: "running" as const },
};

function update(sequence: number, plan: unknown, id = turnId): OrchestrationThreadActivity {
  return {
    id: EventId.make(`event-${sequence}`),
    turnId: id,
    kind: "turn.plan.updated",
    summary: "Plan updated",
    tone: "info",
    createdAt: "2026-01-01T00:00:01.000Z",
    sequence,
    payload: { plan },
  };
}

describe("activeThreadTasks", () => {
  it("shows the latest current-turn snapshot and status changes", () => {
    const activities = [
      update(2, [
        { step: "Inspect", status: "completed" },
        { step: "Implement", status: "inProgress" },
      ]),
      update(1, [{ step: "Inspect", status: "inProgress" }]),
      update(3, [{ step: "Other turn", status: "pending" }], TurnId.make("turn-2")),
    ];
    expect(activeThreadTasks(thread, activities)).toEqual({
      turnId,
      steps: [
        { step: "Inspect", status: "completed" },
        { step: "Implement", status: "inProgress" },
      ],
    });
  });

  it("hides cleared and settled plans without reviving a previous turn", () => {
    const activePlan = [update(1, [{ step: "Inspect", status: "pending" }])];
    const activities = [...activePlan, update(2, [])];
    expect(activeThreadTasks(thread, activities)).toBeNull();
    expect(
      activeThreadTasks(thread, [update(3, [{ step: "Inspect", status: "completed" }])]),
    ).toBeNull();
    expect(
      activeThreadTasks(
        { ...thread, latestTurn: { ...thread.latestTurn, turnId: TurnId.make("turn-2") } },
        activities,
      ),
    ).toBeNull();
    expect(
      activeThreadTasks(
        {
          ...thread,
          latestTurn: { ...thread.latestTurn, completedAt: "2026-01-01T00:00:02.000Z" },
          session: { status: "ready" },
        },
        activePlan,
      ),
    ).toBeNull();
  });
});
