import { useAtomValue } from "@effect/atom-react";
import type { PiInputDraftGuard } from "@t3tools/client-runtime/piInputDraft";
import type {
  PiInputIntent,
  ProviderSubmitPiQueuedInputInput,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useLayoutEffect, useRef, useState } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { environmentPiInputSubmission } from "../../state/piInputSubmission";
import { createComposerPiInputDraftGuard } from "./piInputDraftActions";
import type { ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { Button } from "../ui/button";
import { randomUUID } from "../../lib/utils";

export function PiInputActions(props: {
  readonly threadRef: ScopedThreadRef;
  readonly canSubmit: boolean;
  readonly editorRef: React.RefObject<ComposerPromptEditorHandle | null>;
  readonly prepare: () => Promise<
    Pick<ProviderSubmitPiQueuedInputInput, "text" | "attachments" | "context">
  >;
  readonly clear: () => void;
}) {
  const sourceAtom = environmentPiInputSubmission.sourceAtom(props.threadRef);
  const source = useAtomValue(sourceAtom);
  const result = useAtomValue(environmentPiInputSubmission.stateAtom(props.threadRef));
  const state = AsyncResult.isSuccess(result) ? result.value : null;
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const busy = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const guard = useRef<PiInputDraftGuard | null>(null);
  const { environmentId, threadId } = props.threadRef;
  useLayoutEffect(() => {
    const ref = { environmentId, threadId };
    const binding = createComposerPiInputDraftGuard({
      threadRef: ref,
      readSource: () => (latest.current.canSubmit ? appAtomRegistry.get(sourceAtom) : null),
      readEditor: () => latest.current.editorRef.current,
      onClear: () => latest.current.clear(),
    });
    guard.current = binding.guard;
    const transport = appAtomRegistry.subscribe(sourceAtom, () => binding.guard.observe());
    return () => {
      binding.dispose();
      transport();
      guard.current = null;
    };
  }, [environmentId, threadId, sourceAtom]);
  useLayoutEffect(() => guard.current?.observe());
  if (!source) return null;
  const submit = async (intent: PiInputIntent) => {
    if (busy.current || !props.canSubmit) return;
    const captured = appAtomRegistry.get(sourceAtom);
    const draft = guard.current?.capture();
    if (!captured || !draft) return;
    busy.current = true;
    setPreparing(true);
    setNotice(null);
    try {
      const content = await props.prepare();
      if (appAtomRegistry.get(sourceAtom) !== captured || !draft.isCurrent()) return;
      const submission = await environmentPiInputSubmission.submit.run(appAtomRegistry, {
        ref: props.threadRef,
        input: {
          ...content,
          requestId: randomUUID(),
          threadId,
          expectedProviderInstanceId: captured.owner,
          expectedGeneration: captured.generation,
          intent,
        },
        consume: draft.consume,
      });
      if (!AsyncResult.isSuccess(submission))
        setNotice(
          "Could not confirm recording. Your draft stays. Submitting again may duplicate native work.",
        );
    } catch {
      setNotice("Could not prepare native input. Your draft stays.");
    } finally {
      busy.current = false;
      setPreparing(false);
    }
  };
  return (
    <section
      aria-label="Native Pi input"
      data-chat-composer-collapsed-controls="true"
      className="px-3 py-1 sm:px-4"
    >
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="xs"
          disabled={!props.canSubmit || preparing || Boolean(state?.pending)}
          onClick={() => void submit("steer")}
        >
          Steer native Pi
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={!props.canSubmit || preparing || Boolean(state?.pending)}
          onClick={() => void submit("follow-up")}
        >
          Native follow-up
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Direct native input, separate from Send and local waiting drafts. Does not start idle work.
        Submitting again may duplicate work.
      </p>
      {notice || state?.message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice ?? state?.message}
        </p>
      ) : null}
    </section>
  );
}
