import { useAtomValue } from "@effect/atom-react";
import {
  currentEditorSuggestion,
  type EditorSuggestionAction,
  type EditorSuggestionIntent,
} from "@t3tools/client-runtime/editorSuggestion";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { environmentCatalog } from "../../connection/catalog";
import { AsyncResult } from "effect/unstable/reactivity";
import { environmentExtensionState } from "../../state/providerExtensionState";
import { environmentThreadShells } from "../../state/threads";
import type { ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { Button } from "../ui/button";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
import { createComposerEditorSuggestionActions } from "./editorSuggestionActions";

export function ProviderEditorSuggestion(props: {
  readonly threadRef: ScopedThreadRef;
  readonly canEdit: boolean;
  readonly editorRef: RefObject<ComposerPromptEditorHandle | null>;
  readonly moveCaret: (text: string, cursor: number) => void;
}) {
  const stateAtom = environmentExtensionState.stateAtom(props.threadRef);
  useAtomValue(stateAtom);
  const connectionAtom = environmentCatalog.stateAtom(props.threadRef.environmentId);
  useAtomValue(connectionAtom);
  const latest = useRef(props);
  const [binding, setBinding] = useState<ReturnType<
    typeof createComposerEditorSuggestionActions
  > | null>(null);
  const [intent, setIntent] = useState<EditorSuggestionIntent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const { environmentId, threadId } = props.threadRef;
  useLayoutEffect(() => {
    const ref = { environmentId, threadId };
    const scope = JSON.stringify([environmentId, threadId]);
    const next = createComposerEditorSuggestionActions({
      threadRef: ref,
      readSource: () => {
        if (
          !latest.current.canEdit ||
          JSON.stringify([
            latest.current.threadRef.environmentId,
            latest.current.threadRef.threadId,
          ]) !== scope
        )
          return null;
        const connection = appAtomRegistry.get(connectionAtom);
        return currentEditorSuggestion(
          ref,
          appAtomRegistry.get(stateAtom),
          appAtomRegistry.get(environmentThreadShells.threadShellAtom(ref))?.session ?? null,
          AsyncResult.isSuccess(connection) ? connection.value : null,
        );
      },
      readEditor: () => latest.current.editorRef.current,
      moveCaret: (text, cursor) => latest.current.moveCaret(text, cursor),
    });
    const unsubscribe = appAtomRegistry.subscribe(stateAtom, () => next.actions.observeSource());
    const unsubscribeConnection = appAtomRegistry.subscribe(connectionAtom, () =>
      next.actions.observeSource(),
    );
    const unsubscribeOwner = appAtomRegistry.subscribe(
      environmentThreadShells.threadShellAtom(ref),
      () => next.actions.observeSource(),
    );
    setBinding(next);
    setIntent(null);
    setNotice(null);
    return () => {
      unsubscribe();
      unsubscribeConnection();
      unsubscribeOwner();
      next.dispose();
    };
  }, [environmentId, threadId, stateAtom, connectionAtom]);
  useLayoutEffect(() => {
    latest.current = props;
    binding?.actions.observeSource();
  }, [binding, props]);
  const offer = binding?.actions.offer();
  const intentIsCurrent =
    intent &&
    offer &&
    offer.id === intent.source.id &&
    offer.text === intent.source.text &&
    offer.sourceRevision === intent.sourceRevision;
  if (!offer) return null;
  const request = (action: EditorSuggestionAction) => {
    setNotice(null);
    setIntent(binding?.actions.request(action) ?? null);
  };
  const apply = () => {
    if (!binding || !intent || !intentIsCurrent) return;
    const result = binding.actions.apply(intent);
    if (result.status === "refresh") {
      setIntent(result.intent);
      setNotice(
        "Your draft or selection changed. Nothing was replaced. Review the current draft, then confirm again.",
      );
    } else {
      setIntent(null);
      setNotice(null);
      refresh((value) => value + 1);
    }
  };
  const hasSelection = props.editorRef.current !== null;
  return (
    <section
      data-chat-composer-collapsed-controls="true"
      aria-label="Editor suggestion"
      className="min-w-0 px-3 py-1 sm:px-4"
    >
      <details>
        <summary className="cursor-pointer truncate text-xs text-muted-foreground">
          {offer.text === ""
            ? "Editor suggestion: clear draft text"
            : `Editor suggestion: ${offer.text.slice(0, 120)}`}
        </summary>
        <p className="text-xs text-muted-foreground">
          Full received plaintext. Preview abbreviation does not shorten the applied text.
        </p>
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">
          {offer.text || "Empty text proposal"}
        </pre>
      </details>
      {offer.blocked ? (
        <p role="status" className="text-xs text-muted-foreground">
          {offer.blocked}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1 py-1">
        <Button
          variant="outline"
          size="xs"
          disabled={Boolean(offer.blocked)}
          onClick={() => request("replace")}
        >
          Replace
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={Boolean(offer.blocked) || offer.text === ""}
          onClick={() => request(hasSelection ? "insert" : "append")}
        >
          {hasSelection ? "Insert" : "Append to draft"}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            if (binding?.actions.dismiss(offer)) {
              setIntent(null);
              refresh((value) => value + 1);
            }
          }}
        >
          Dismiss
        </Button>
      </div>
      <Dialog
        open={Boolean(intentIsCurrent)}
        onOpenChange={(open) => {
          if (!open) setIntent(null);
        }}
      >
        <DialogPopup>
          <DialogTitle>
            {intent?.action === "replace"
              ? offer.text === ""
                ? "Clear draft text?"
                : "Replace draft text?"
              : intent?.action === "append"
                ? "Append to draft?"
                : "Insert at selection?"}
          </DialogTitle>
          <DialogDescription>
            Only this device's draft text changes. Attachments and settings stay. Nothing is sent.
          </DialogDescription>
          {notice ? (
            <p role="status" className="text-sm">
              {notice}
            </p>
          ) : null}
          <div className="max-h-72 overflow-auto py-2">
            <p className="text-xs text-muted-foreground">Current draft</p>
            <pre className="whitespace-pre-wrap break-words text-sm">
              {intent?.draft.text || "Empty text"}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">Proposed draft</p>
            <pre className="whitespace-pre-wrap break-words text-sm">
              {intent?.text || "Empty text"}
            </pre>
          </div>
          {intent?.blocked ? (
            <p role="status" className="text-sm">
              {intent.blocked}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIntent(null)}>
              Cancel
            </Button>
            <Button disabled={Boolean(intent?.blocked)} onClick={apply}>
              {intent?.action === "replace"
                ? "Confirm replace"
                : intent?.action === "append"
                  ? "Confirm append"
                  : "Confirm insert"}
            </Button>
          </div>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
