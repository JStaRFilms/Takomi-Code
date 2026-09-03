import { describe, expect, it } from "vite-plus/test";

import { reconcileTakomiLivenessStatus, subagentPresentationIdentity } from "./TakomiInspector";

describe("subagentPresentationIdentity", () => {
  it("prefers Pi's native presentation ID and only falls back to result-N", () => {
    expect(subagentPresentationIdentity("child-native", 0)).toBe("child-native");
    expect(subagentPresentationIdentity("", 2)).toBe("result-2");
  });
});

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
