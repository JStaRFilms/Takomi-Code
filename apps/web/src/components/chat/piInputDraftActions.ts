import { PiInputDraftGuard } from "@t3tools/client-runtime/piInputDraft";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useComposerDraftStore } from "../../composerDraftStore";
import type { ComposerPromptEditorHandle } from "../ComposerPromptEditor";

export function createComposerPiInputDraftGuard(options: {
  readonly threadRef: ScopedThreadRef;
  readonly readSource: () => object | null;
  readonly readEditor: () => ComposerPromptEditorHandle | null;
  readonly onClear: () => void;
}) {
  const files = new WeakMap<File, number>();
  let nextFile = 0;
  const guard = new PiInputDraftGuard({
    readSource: options.readSource,
    readDraft: () => {
      const draft = useComposerDraftStore.getState().getComposerDraft(options.threadRef);
      const editor = options.readEditor();
      if (!draft || !editor || editor.readSnapshot().value !== draft.prompt) return null;
      const contentKey = JSON.stringify(
        {
          prompt: draft.prompt,
          images: draft.images,
          files: draft.files,
          terminalContexts: draft.terminalContexts,
          previewAnnotations: draft.previewAnnotations,
          reviewComments: draft.reviewComments,
          activeProvider: draft.activeProvider,
          modelSelectionByProvider: draft.modelSelectionByProvider,
          runtimeMode: draft.runtimeMode,
          interactionMode: draft.interactionMode,
        },
        (key, value: unknown) => {
          if (key === "uploadedAttachmentId" || key === "uploadEnvironmentId") return undefined;
          if (value instanceof File) {
            let id = files.get(value);
            if (id === undefined) {
              id = nextFile++;
              files.set(value, id);
            }
            return id;
          }
          return value;
        },
      );
      return {
        text: draft.prompt,
        editor,
        editorRevision: editor.readRevision?.() ?? 0,
        contentKey,
      };
    },
    clear: () => {
      useComposerDraftStore.getState().clearComposerContent(options.threadRef);
      options.onClear();
    },
  });
  const unsubscribe = useComposerDraftStore.subscribe(() => guard.observe());
  return {
    guard,
    dispose: () => {
      guard.dispose();
      unsubscribe();
    },
  };
}
