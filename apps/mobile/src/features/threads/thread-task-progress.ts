import type { OrchestrationThreadActivity, OrchestrationThreadShell } from "@t3tools/contracts";

export interface ThreadTaskStep {
  readonly step: string;
  readonly status: "pending" | "inProgress" | "completed";
}

export function activeThreadTasks(
  thread: {
    readonly latestTurn: Pick<
      NonNullable<OrchestrationThreadShell["latestTurn"]>,
      "turnId" | "startedAt" | "completedAt"
    > | null;
    readonly session: Pick<NonNullable<OrchestrationThreadShell["session"]>, "status"> | null;
  },
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): { readonly turnId: string; readonly steps: ReadonlyArray<ThreadTaskStep> } | null {
  const turn = thread.latestTurn;
  if (!turn || (turn.startedAt && turn.completedAt && thread.session?.status !== "running")) {
    return null;
  }

  const update = activities
    .filter((activity) => activity.turnId === turn.turnId && activity.kind === "turn.plan.updated")
    .sort((left, right) =>
      left.sequence !== undefined && right.sequence !== undefined
        ? left.sequence - right.sequence
        : left.createdAt.localeCompare(right.createdAt),
    )
    .at(-1);
  const payload = update?.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    !("plan" in payload) ||
    !Array.isArray(payload.plan)
  ) {
    return null;
  }

  const steps: ThreadTaskStep[] = [];
  const entries: ReadonlyArray<unknown> = payload.plan;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !("step" in entry) || typeof entry.step !== "string")
      continue;
    steps.push({
      step: entry.step,
      status:
        "status" in entry && (entry.status === "completed" || entry.status === "inProgress")
          ? entry.status
          : "pending",
    });
  }
  return steps.some((step) => step.status !== "completed") ? { turnId: turn.turnId, steps } : null;
}
