import { PiInputDraftGuard } from "@t3tools/client-runtime/piInputDraft";
import type { ComposerEditorHandle } from "../../components/ComposerEditor";
import { appAtomRegistry } from "../../state/atom-registry";
import {
  clearComposerDraftContent,
  composerDraftsAtom,
  getComposerDraftSnapshot,
} from "../../state/use-composer-drafts";

export function createNativePiInputDraftGuard(options: {
  readonly draftKey: string;
  readonly readSource: () => object | null;
  readonly readEditor: () => ComposerEditorHandle | null;
  readonly moveCaret: (selection: { start: number; end: number }) => void;
}) {
  const guard = new PiInputDraftGuard({
    readSource: options.readSource,
    readDraft: () => {
      const draft = getComposerDraftSnapshot(options.draftKey);
      const editor = options.readEditor();
      const snapshot = editor?.readSnapshot?.();
      if (!editor || !snapshot || snapshot.value !== draft.text) return null;
      return {
        text: draft.text,
        editor,
        editorRevision: snapshot.eventCount,
        contentKey: JSON.stringify(draft, (key, value: unknown) =>
          key === "uploadedAttachmentId" || key === "uploadEnvironmentId" ? undefined : value,
        ),
      };
    },
    clear: () => {
      clearComposerDraftContent(options.draftKey);
      options.moveCaret({ start: 0, end: 0 });
    },
  });
  const unsubscribe = appAtomRegistry.subscribe(composerDraftsAtom, () => guard.observe());
  return {
    guard,
    dispose: () => {
      guard.dispose();
      unsubscribe();
    },
  };
}
