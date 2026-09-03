import { describe, expect, it } from "vite-plus/test";

import { subagentPresentationIdentity } from "./TakomiInspector";

describe("subagentPresentationIdentity", () => {
  it("prefers Pi's native presentation ID and only falls back to result-N", () => {
    expect(subagentPresentationIdentity("child-native", 0)).toBe("child-native");
    expect(subagentPresentationIdentity("", 2)).toBe("result-2");
  });
});
