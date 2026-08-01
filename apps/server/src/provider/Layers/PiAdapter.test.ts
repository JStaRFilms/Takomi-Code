import { describe, expect, it } from "vite-plus/test";

import { normalizeTakomiPresentation } from "./PiAdapter.ts";

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
