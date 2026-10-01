import {
  EditorSuggestionActions,
  type EditorSuggestion,
  type EditorSuggestionDismissals,
} from "@t3tools/client-runtime/editorSuggestion";
import type { ComposerEditorHandle } from "../../components/ComposerEditor";
import { appAtomRegistry } from "../../state/atom-registry";
import {
  composerDraftsAtom,
  getComposerDraftSnapshot,
  rememberComposerDraftSelection,
  setComposerDraftSuggestionText,
} from "../../state/use-composer-drafts";

export function createNativeEditorSuggestionActions(options: {
  readonly draftKey: string;
  readonly readSource: () => EditorSuggestion | null;
  readonly readEditor: () => ComposerEditorHandle | null;
  readonly moveCaret: (selection: { start: number; end: number }) => void;
  readonly dismissals?: EditorSuggestionDismissals;
}) {
  let active = true;
  let revision = 0;
  let previous = appAtomRegistry.get(composerDraftsAtom)[options.draftKey];
  const unsubscribe = appAtomRegistry.subscribe(composerDraftsAtom, (drafts) => {
    const current = drafts[options.draftKey];
    if (current !== previous) revision++;
    previous = current;
  });
  const actions = new EditorSuggestionActions(
    {
      readSource: () => (active ? options.readSource() : null),
      readDraft: () => {
        const draft = getComposerDraftSnapshot(options.draftKey);
        const editor = options.readEditor()?.readSnapshot?.();
        if (editor && editor.value !== draft.text) return null;
        return {
          revision,
          text: draft.text,
          selection: editor?.selection ?? null,
          editorRevision: editor?.eventCount ?? 0,
        };
      },
      writeText: (text, cursor) => {
        setComposerDraftSuggestionText(options.draftKey, text);
        const selection = { start: cursor, end: cursor };
        rememberComposerDraftSelection(options.draftKey, text, selection);
        // Controlled value and selection travel together through the native revision guard.
        options.moveCaret(selection);
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
