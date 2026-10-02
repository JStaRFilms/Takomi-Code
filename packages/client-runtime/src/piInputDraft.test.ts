import { describe, expect, it } from "vite-plus/test";
import { PiInputDraftGuard, type PiInputDraftSnapshot } from "./piInputDraft.ts";

function fixture() {
  let draft: PiInputDraftSnapshot | null = {
    text: "authored",
    contentKey: "all attachments/context",
    editor: {},
    editorRevision: 1,
  };
  let source: object | null = {};
  let clears = 0;
  const guard = new PiInputDraftGuard({
    readDraft: () => draft,
    readSource: () => source,
    clear: () => {
      clears++;
    },
  });
  return {
    guard,
    clears: () => clears,
    draft: () => draft,
    setDraft: (value: PiInputDraftSnapshot | null) => {
      draft = value;
      guard.observe();
    },
    source: () => source,
    setSource: (value: object | null) => {
      source = value;
      guard.observe();
    },
  };
}
describe("origin-local native input draft guard", () => {
  it("consumes an unchanged capture once", () => {
    const f = fixture();
    const capture = f.guard.capture();
    expect(capture?.isCurrent()).toBe(true);
    capture?.consume();
    capture?.consume();
    expect(f.clears()).toBe(1);
  });
  it.each(["text", "contentKey", "editor", "editorRevision"] as const)(
    "does not consume after %s changes and returns",
    (field) => {
      const f = fixture();
      const capture = f.guard.capture();
      const original = f.draft();
      if (!original) throw new Error("Missing draft");
      f.setDraft({
        ...original,
        [field]: field === "editor" ? {} : field === "editorRevision" ? 2 : "changed",
      });
      f.setDraft(original);
      capture?.consume();
      expect(f.clears()).toBe(0);
    },
  );
  it("does not consume after route/owner/generation/transport identity changes and returns", () => {
    const f = fixture();
    const original = f.source();
    const capture = f.guard.capture();
    f.setSource(null);
    f.setSource(original);
    capture?.consume();
    expect(f.clears()).toBe(0);
  });
  it("refuses missing editors or retired bindings", () => {
    const f = fixture();
    const capture = f.guard.capture();
    f.guard.dispose();
    capture?.consume();
    expect(f.guard.capture()).toBeNull();
    expect(f.clears()).toBe(0);
    const missing = fixture();
    missing.setDraft(null);
    expect(missing.guard.capture()).toBeNull();
  });
});
