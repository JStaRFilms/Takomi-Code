import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import type { PiInputDraftGuard } from "@t3tools/client-runtime/piInputDraft";
import type {
  PiInputIntent,
  ProviderSubmitPiQueuedInputInput,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import type { ComposerEditorHandle } from "../../components/ComposerEditor";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentPiInputSubmission } from "../../state/piInputSubmission";
import { createNativePiInputDraftGuard } from "./piInputDraftActions";
import { uuidv4 } from "../../lib/uuid";

export function PiInputActions(props: {
  readonly threadRef: ScopedThreadRef;
  readonly draftKey: string;
  readonly canSubmit: boolean;
  readonly editorRef: RefObject<ComposerEditorHandle | null>;
  readonly prepare: () => Promise<
    Pick<ProviderSubmitPiQueuedInputInput, "text" | "attachments" | "context">
  >;
  readonly moveCaret: (selection: { start: number; end: number }) => void;
}) {
  const sourceAtom = environmentPiInputSubmission.sourceAtom(props.threadRef);
  const source = useAtomValue(sourceAtom);
  const result = useAtomValue(environmentPiInputSubmission.stateAtom(props.threadRef));
  const state = AsyncResult.isSuccess(result) ? result.value : null;
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const navigation = useNavigation();
  const busy = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const guard = useRef<PiInputDraftGuard | null>(null);
  const { draftKey } = props;
  useLayoutEffect(() => {
    const binding = createNativePiInputDraftGuard({
      draftKey,
      readSource: () =>
        latest.current.canSubmit && navigation.isFocused() ? appAtomRegistry.get(sourceAtom) : null,
      readEditor: () => latest.current.editorRef.current,
      moveCaret: (selection) => latest.current.moveCaret(selection),
    });
    guard.current = binding.guard;
    const transport = appAtomRegistry.subscribe(sourceAtom, () => binding.guard.observe());
    const blur = navigation.addListener("blur", () => binding.guard.observe());
    const focus = navigation.addListener("focus", () => binding.guard.observe());
    return () => {
      binding.dispose();
      transport();
      blur();
      focus();
      guard.current = null;
    };
  }, [draftKey, navigation, sourceAtom]);
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
          requestId: uuidv4(),
          threadId: props.threadRef.threadId,
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
  const disabled = !props.canSubmit || preparing || Boolean(state?.pending);
  return (
    <View accessibilityLabel="Native Pi input" className="px-3 py-1">
      <View className="flex-row flex-wrap gap-3">
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => void submit("steer")}
          className="py-2"
        >
          <Text className="text-sm text-foreground">Steer native Pi</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => void submit("follow-up")}
          className="py-2"
        >
          <Text className="text-sm text-foreground">Native follow-up</Text>
        </Pressable>
      </View>
      <Text className="text-xs text-foreground-muted">
        Separate from Send and local waiting drafts. Does not start idle work. Submitting again may
        duplicate work.
      </Text>
      {notice || state?.message ? (
        <Text accessibilityRole="alert" className="text-xs text-foreground-muted">
          {notice ?? state?.message}
        </Text>
      ) : null}
    </View>
  );
}
