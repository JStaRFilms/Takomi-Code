import { describe, expect, it } from "vite-plus/test";

import { reconcileTakomiLivenessStatus } from "./TakomiInspector";

describe("reconcileTakomiLivenessStatus", () => {
  it("interrupts stale active statuses after the Pi session disconnects", () => {
    expect(reconcileTakomiLivenessStatus("InProgress", false)).toBe("interrupted");
    expect(reconcileTakomiLivenessStatus("running", false)).toBe("interrupted");
  });

  it("preserves live and terminal statuses", () => {
    expect(reconcileTakomiLivenessStatus("running", true)).toBe("running");
    expect(reconcileTakomiLivenessStatus("completed", false)).toBe("completed");
    expect(reconcileTakomiLivenessStatus("failed", false)).toBe("failed");
  });
});
