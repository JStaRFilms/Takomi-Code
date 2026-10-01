import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
} from "@t3tools/contracts";
import {
  EditorSuggestionDismissals,
  type EditorSuggestion,
  type EditorSuggestionIntent,
} from "@t3tools/client-runtime/editorSuggestion";
import { createComposerEditorSuggestionActions } from "./components/chat/editorSuggestionActions";
import type { ComposerPromptEditorHandle } from "./components/ComposerPromptEditor";
import { useComposerDraftStore } from "./composerDraftStore";

const ref = { environmentId: EnvironmentId.make("one"), threadId: ThreadId.make("same-thread") };
const other = { ...ref, environmentId: EnvironmentId.make("two") };
function fixture(initial = "before selected after") {
  const store = useComposerDraftStore.getState();
  store.setPrompt(ref, initial);
  store.setPrompt(other, "another environment's draft");
  let source: EditorSuggestion | null = {
    scope: "one:thread",
    id: "one:thread:pi:generation:suggestion",
    text: "suggested",
    blocked: null,
    connectionGeneration: 1,
  };
  let selection = { start: 7, end: 15 };
  let editorText: string | null = null;
  const moveCaret = vi.fn((_text: string, cursor: number) => {
    selection = { start: cursor, end: cursor };
  });
  const readText = () => useComposerDraftStore.getState().getComposerDraft(ref)?.prompt ?? "";
  const editor: ComposerPromptEditorHandle = {
    focus: () => {},
    focusAt: () => {},
    focusAtEnd: () => {},
    requestCitationComment: () => {},
    isCaretOnVisualEdge: () => false,
    readSelectionRange: () => selection,
    readSnapshot: () => ({
      value: editorText ?? readText(),
      cursor: selection.end,
      expandedCursor: selection.end,
      contextIds: [],
    }),
  };
  const binding = createComposerEditorSuggestionActions({
    threadRef: ref,
    readSource: () => source,
    readEditor: () => editor,
    moveCaret,
    dismissals: new EditorSuggestionDismissals(),
  });
  return {
    ...binding,
    moveCaret,
    readText,
    select(value: typeof selection) {
      selection = value;
    },
    pendingEditor(value: string) {
      editorText = value;
    },
    changeSource(value: EditorSuggestion | null) {
      source = value;
      binding.actions.observeSource();
    },
  };
}
function intent(value: EditorSuggestionIntent | null) {
  if (!value) throw new Error("Expected intent");
  return value;
}
beforeEach(() =>
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  }),
);
afterEach(() =>
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  }),
);

describe("web composer native suggestion text mutations", () => {
  it.each(["replace", "insert", "append"] as const)(
    "applies %s to the captured local draft and selection only",
    (action) => {
      const f = fixture();
      try {
        const proposal = intent(f.actions.request(action));
        expect(f.readText()).toBe("before selected after");
        expect(f.actions.apply(proposal)).toEqual({ status: "applied" });
        expect(f.readText()).toBe(
          action === "replace"
            ? "suggested"
            : action === "insert"
              ? "before suggested after"
              : "before selected aftersuggested",
        );
        expect(f.moveCaret).toHaveBeenCalledWith(proposal.text, proposal.cursor);
        expect(useComposerDraftStore.getState().getComposerDraft(other)?.prompt).toBe(
          "another environment's draft",
        );
      } finally {
        f.dispose();
      }
    },
  );

  it("refreshes repeatedly on text/attachment edits and preserves every latest metadata field", () => {
    const f = fixture();
    try {
      const first = intent(f.actions.request("replace"));
      const store = useComposerDraftStore.getState();
      store.setPrompt(ref, "my newer edit @mention");
      const result = f.actions.apply(first);
      expect(result.status).toBe("refresh");
      if (result.status !== "refresh") throw new Error("Expected refresh");
      expect(f.readText()).toBe("my newer edit @mention");
      store.addImages(ref, [
        {
          type: "image",
          id: "image",
          name: "image.png",
          mimeType: "image/png",
          sizeBytes: 1,
          previewUrl: "blob:image",
          file: new File(["x"], "image.png"),
        },
      ]);
      store.addFiles(
        ref,
        [
          {
            id: "file",
            type: "file",
            name: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 1,
            file: new File(["x"], "notes.txt"),
          },
        ],
        { appendReference: false },
      );
      store.setModelSelection(ref, {
        instanceId: ProviderInstanceId.make("pi"),
        model: "model",
        options: [{ id: "thinking", value: "high" }],
      });
      store.setRuntimeMode(ref, "full-access");
      const second = f.actions.apply(result.intent);
      expect(second.status).toBe("refresh");
      if (second.status !== "refresh") throw new Error("Expected refresh");
      const before = store.getComposerDraft(ref);
      expect(f.readText()).toBe("my newer edit @mention");
      expect(f.actions.apply(second.intent)).toEqual({ status: "applied" });
      expect(store.getComposerDraft(ref)).toEqual({ ...before, prompt: "suggested" });
    } finally {
      f.dispose();
    }
  });

  it("detects edit-away/edit-back revisions and selection changes before final insertion", () => {
    const f = fixture();
    try {
      const proposal = intent(f.actions.request("insert"));
      const store = useComposerDraftStore.getState();
      store.setPrompt(ref, "transient edit");
      store.setPrompt(ref, "before selected after");
      const changed = f.actions.apply(proposal);
      expect(changed.status).toBe("refresh");
      if (changed.status !== "refresh") throw new Error("Expected refresh");
      f.select({ start: 0, end: 6 });
      const moved = f.actions.apply(changed.intent);
      expect(moved.status).toBe("refresh");
      if (moved.status !== "refresh") throw new Error("Expected refresh");
      expect(f.readText()).toBe("before selected after");
      expect(f.actions.apply(moved.intent)).toEqual({ status: "applied" });
      expect(f.readText()).toBe("suggested selected after");
    } finally {
      f.dispose();
    }
  });

  it("never retargets or writes after navigation/source replacement/disconnect", () => {
    for (const source of [
      null,
      {
        scope: "two:thread",
        id: "new generation",
        text: "new",
        blocked: null,
        connectionGeneration: 1,
      },
    ]) {
      const f = fixture();
      try {
        const proposal = intent(f.actions.request("replace"));
        f.changeSource(source);
        expect(f.actions.apply(proposal)).toEqual({ status: "stale" });
        expect(f.readText()).toBe("before selected after");
        expect(f.moveCaret).not.toHaveBeenCalled();
      } finally {
        f.dispose();
      }
    }
    const f = fixture();
    const proposal = intent(f.actions.request("replace"));
    f.dispose();
    expect(f.actions.apply(proposal)).toEqual({ status: "stale" });
  });

  it("blocks uncommitted editor text, oversized results and clears text without attachments", () => {
    const f = fixture();
    try {
      f.pendingEditor("typed before React caught up");
      expect(f.actions.request("replace")).toBeNull();
    } finally {
      f.dispose();
    }
    const clear = fixture();
    try {
      const store = useComposerDraftStore.getState();
      store.addFiles(
        ref,
        [
          {
            id: "file",
            type: "file",
            name: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 1,
            file: new File(["x"], "notes.txt"),
          },
        ],
        { appendReference: false },
      );
      const before = store.getComposerDraft(ref);
      clear.changeSource({
        scope: "one:thread",
        id: "clear",
        text: "",
        blocked: null,
        connectionGeneration: 1,
      });
      expect(clear.actions.apply(intent(clear.actions.request("replace")))).toEqual({
        status: "applied",
      });
      expect(store.getComposerDraft(ref)).toEqual({ ...before, prompt: "" });
      store.setPrompt(ref, "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS));
      clear.changeSource({
        scope: "one:thread",
        id: "append",
        text: "x",
        blocked: null,
        connectionGeneration: 1,
      });
      const proposal = intent(clear.actions.request("append"));
      expect(proposal.blocked).not.toBeNull();
      expect(clear.actions.apply(proposal).status).toBe("refresh");
      expect(clear.readText()).toHaveLength(PROVIDER_SEND_TURN_MAX_INPUT_CHARS);
    } finally {
      clear.dispose();
    }
  });
});
