import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { createComposerPiInputDraftGuard } from "./components/chat/piInputDraftActions";
import type { ComposerPromptEditorHandle } from "./components/ComposerPromptEditor";
import { useComposerDraftStore } from "./composerDraftStore";

const ref = {
  environmentId: EnvironmentId.make("native-input-one"),
  threadId: ThreadId.make("thread"),
};
const other = { ...ref, environmentId: EnvironmentId.make("native-input-two") };
const file = {
  type: "file" as const,
  id: "local-file",
  name: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: 4,
  file: new File(["note"], "notes.txt"),
};
function fixture() {
  const store = useComposerDraftStore.getState();
  store.setPrompt(ref, "authored");
  store.setPrompt(other, "other device/environment draft");
  store.addFiles(ref, [file], { appendReference: false });
  let source: object | null = {};
  let revision = 1;
  let nativeText: string | null = null;
  const readText = () => useComposerDraftStore.getState().getComposerDraft(ref)?.prompt ?? "";
  const editor: ComposerPromptEditorHandle = {
    focus: () => {},
    focusAt: () => {},
    focusAtEnd: () => {},
    requestCitationComment: () => {},
    isCaretOnVisualEdge: () => false,
    readSelectionRange: () => ({ start: 0, end: 0 }),
    readRevision: () => revision,
    readSnapshot: () => ({
      value: nativeText ?? readText(),
      cursor: 0,
      expandedCursor: 0,
      contextIds: [],
    }),
  };
  const clear = vi.fn();
  const binding = createComposerPiInputDraftGuard({
    threadRef: ref,
    readSource: () => source,
    readEditor: () => editor,
    onClear: clear,
  });
  return {
    ...binding,
    clear,
    readText,
    native(value: string) {
      nativeText = value;
      revision++;
    },
    source(value: object | null) {
      source = value;
      binding.guard.observe();
    },
    currentSource: () => source,
  };
}
beforeEach(() => useComposerDraftStore.setState({ draftsByThreadKey: {} }));
afterEach(() => useComposerDraftStore.setState({ draftsByThreadKey: {} }));
describe("web native input draft consumption", () => {
  it("clears unchanged authored content but not another environment", () => {
    const f = fixture();
    try {
      const captured = f.guard.capture();
      captured?.consume();
      expect(f.readText()).toBe("");
      expect(useComposerDraftStore.getState().getComposerDraft(ref)?.files ?? []).toEqual([]);
      expect(useComposerDraftStore.getState().getComposerDraft(other)?.prompt).toBe(
        "other device/environment draft",
      );
      expect(f.clear).toHaveBeenCalledOnce();
    } finally {
      f.dispose();
    }
  });
  it("does not treat its own upload references as user edits", () => {
    const f = fixture();
    try {
      const captured = f.guard.capture();
      useComposerDraftStore
        .getState()
        .setFileUpload(ref, file.id, ref.environmentId, "pending-upload");
      expect(captured?.isCurrent()).toBe(true);
      captured?.consume();
      expect(f.readText()).toBe("");
    } finally {
      f.dispose();
    }
  });
  it.each([
    "edit-and-undo",
    "attachment",
    "context",
    "ordinary-send",
    "native-revision",
    "pending-native",
    "away-and-back",
  ] as const)("keeps the draft after %s", (change) => {
    const f = fixture();
    try {
      const captured = f.guard.capture();
      const store = useComposerDraftStore.getState();
      if (change === "edit-and-undo") {
        store.setPrompt(ref, "newer");
        store.setPrompt(ref, "authored");
      }
      if (change === "attachment")
        store.addFiles(
          ref,
          [
            {
              ...file,
              id: "new-file",
              name: "changed.txt",
              file: new File(["edit"], "changed.txt"),
            },
          ],
          { appendReference: false },
        );
      if (change === "context")
        store.setTerminalContexts(ref, [
          {
            id: "terminal-context",
            threadId: ref.threadId,
            terminalId: "terminal",
            terminalLabel: "Shell",
            lineStart: 1,
            lineEnd: 2,
            text: "captured terminal",
            createdAt: "2026-09-30T00:00:00.000Z",
          },
        ]);
      if (change === "ordinary-send") {
        store.clearComposerContent(ref);
        store.setPrompt(ref, "authored");
      }
      if (change === "native-revision") f.native("authored");
      if (change === "pending-native") f.native("pending keystroke");
      if (change === "away-and-back") {
        const source = f.currentSource();
        f.source(null);
        f.source(source);
      }
      const before = store.getComposerDraft(ref);
      captured?.consume();
      expect(store.getComposerDraft(ref)).toEqual(before);
      expect(f.clear).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });
  it("detects an attachment mutation before React or the composer refs update", () => {
    const f = fixture();
    try {
      const captured = f.guard.capture();
      useComposerDraftStore.getState().removeFile(ref, file.id);
      captured?.consume();
      expect(f.readText()).toBe("authored");
      expect(f.clear).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });
});
