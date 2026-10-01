import {
  EditorSuggestionActions,
  type EditorSuggestion,
  type EditorSuggestionDismissals,
} from "@t3tools/client-runtime/editorSuggestion";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useComposerDraftStore } from "../../composerDraftStore";
import type { ComposerPromptEditorHandle } from "../ComposerPromptEditor";

export function createComposerEditorSuggestionActions(options: {
  readonly threadRef: ScopedThreadRef;
  readonly readSource: () => EditorSuggestion | null;
  readonly readEditor: () => ComposerPromptEditorHandle | null;
  readonly moveCaret: (text: string, cursor: number) => void;
  readonly dismissals?: EditorSuggestionDismissals;
}) {
  let active = true;
  let revision = 0;
  let previous = useComposerDraftStore.getState().getComposerDraft(options.threadRef);
  const unsubscribe = useComposerDraftStore.subscribe((state) => {
    const current = state.getComposerDraft(options.threadRef);
    if (current !== previous) revision++;
    previous = current;
  });
  const actions = new EditorSuggestionActions(
    {
      readSource: () => (active ? options.readSource() : null),
      readDraft: () => {
        const draft = useComposerDraftStore.getState().getComposerDraft(options.threadRef);
        const text = draft?.prompt ?? "";
        const editor = options.readEditor();
        const snapshot = editor?.readSnapshot();
        // The editor may have typed text that has not reached the controlled store yet.
        if (snapshot && snapshot.value !== text) return null;
        return {
          revision,
          text,
          selection: editor?.readSelectionRange() ?? null,
          editorRevision: 0,
        };
      },
      writeText: (text, cursor) => {
        useComposerDraftStore.getState().setPrompt(options.threadRef, text);
        options.moveCaret(text, cursor);
      },
    },
    options.dismissals,
  );
  return {
    actions,
    dispose: () => {
      active = false;
      actions.observeSource();
      unsubscribe();
    },
  };
}
