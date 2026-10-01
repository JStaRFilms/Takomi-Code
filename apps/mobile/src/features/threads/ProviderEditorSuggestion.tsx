import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import {
  currentEditorSuggestion,
  type EditorSuggestionAction,
  type EditorSuggestionIntent,
} from "@t3tools/client-runtime/editorSuggestion";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "../../components/AppText";
import type { ComposerEditorHandle } from "../../components/ComposerEditor";
import { ContextSheetSize } from "../../components/ContextSheetSize";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentCatalog } from "../../connection/catalog";
import { AsyncResult } from "effect/unstable/reactivity";
import { environmentExtensionState } from "../../state/providerExtensionState";
import { environmentThreadShells } from "../../state/threads";
import { createNativeEditorSuggestionActions } from "./editorSuggestionActions";

export function ProviderEditorSuggestion(props: {
  readonly threadRef: ScopedThreadRef;
  readonly draftKey: string;
  readonly canEdit: boolean;
  readonly editorRef: RefObject<ComposerEditorHandle | null>;
  readonly moveCaret: (selection: { start: number; end: number }) => void;
}) {
  const stateAtom = environmentExtensionState.stateAtom(props.threadRef);
  useAtomValue(stateAtom);
  const connectionAtom = environmentCatalog.stateAtom(props.threadRef.environmentId);
  useAtomValue(connectionAtom);
  const navigation = useNavigation();
  const latest = useRef(props);
  const [binding, setBinding] = useState<ReturnType<
    typeof createNativeEditorSuggestionActions
  > | null>(null);
  const [intent, setIntent] = useState<EditorSuggestionIntent | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { environmentId, threadId } = props.threadRef;
  const { draftKey } = props;
  useLayoutEffect(() => {
    const ref = { environmentId, threadId };
    const scope = JSON.stringify([environmentId, threadId]);
    const next = createNativeEditorSuggestionActions({
      draftKey,
      readSource: () => {
        if (
          !latest.current.canEdit ||
          !navigation.isFocused() ||
          latest.current.draftKey !== draftKey ||
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
      moveCaret: (selection) => latest.current.moveCaret(selection),
    });
    const unsubscribe = appAtomRegistry.subscribe(stateAtom, () => next.actions.observeSource());
    const unsubscribeConnection = appAtomRegistry.subscribe(connectionAtom, () =>
      next.actions.observeSource(),
    );
    const unsubscribeOwner = appAtomRegistry.subscribe(
      environmentThreadShells.threadShellAtom(ref),
      () => next.actions.observeSource(),
    );
    const blur = navigation.addListener("blur", () => {
      next.actions.observeSource();
      setIntent(null);
      setDetail(null);
    });
    const focus = navigation.addListener("focus", () => {
      next.actions.observeSource();
      refresh((value) => value + 1);
    });
    setBinding(next);
    setIntent(null);
    setDetail(null);
    return () => {
      unsubscribe();
      unsubscribeConnection();
      unsubscribeOwner();
      blur();
      focus();
      next.dispose();
    };
  }, [environmentId, threadId, stateAtom, connectionAtom, draftKey, navigation]);
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
  const detailIsCurrent = offer && detail === JSON.stringify([offer.id, offer.sourceRevision]);
  if (!offer) return null;
  const request = (action: EditorSuggestionAction) => {
    setNotice(null);
    setIntent(binding?.actions.request(action) ?? null);
    setDetail(null);
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
      refresh((value) => value + 1);
    }
  };
  const hasSelection = props.editorRef.current?.readSnapshot?.().selection != null;
  const close = () => {
    setIntent(null);
    setDetail(null);
  };
  return (
    <View accessibilityLabel="Editor suggestion" className="px-3 py-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Read full editor suggestion"
        onPress={() => {
          setNotice(null);
          setDetail(JSON.stringify([offer.id, offer.sourceRevision]));
        }}
        className="py-2"
      >
        <Text numberOfLines={2} className="text-xs text-foreground-muted">
          {offer.text === ""
            ? "Editor suggestion: clear draft text"
            : `Editor suggestion: ${offer.text.slice(0, 120)}`}
        </Text>
      </Pressable>
      {offer.blocked ? (
        <Text accessibilityRole="alert" className="text-xs text-foreground-muted">
          {offer.blocked}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-3">
        <Pressable
          accessibilityRole="button"
          disabled={Boolean(offer.blocked)}
          onPress={() => request("replace")}
          className="py-2"
        >
          <Text className="text-sm text-foreground">Replace</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={Boolean(offer.blocked) || offer.text === ""}
          onPress={() => request(hasSelection ? "insert" : "append")}
          className="py-2"
        >
          <Text className="text-sm text-foreground">
            {hasSelection ? "Insert" : "Append to draft"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (binding?.actions.dismiss(offer)) {
              close();
              refresh((value) => value + 1);
            }
          }}
          className="py-2"
        >
          <Text className="text-sm text-foreground">Dismiss</Text>
        </Pressable>
      </View>
      {intentIsCurrent || detailIsCurrent ? (
        <Modal
          animationType="slide"
          presentationStyle={Platform.OS === "android" ? "overFullScreen" : "pageSheet"}
          transparent={Platform.OS === "android"}
          onRequestClose={close}
        >
          <View className="flex-1 justify-end bg-backdrop">
            <View
              className="overflow-hidden rounded-t-3xl bg-sheet-solid"
              style={{ height: height - insets.top - 24 }}
            >
              <ContextSheetSize height={height - insets.top - 24} />
              <View className="flex-row items-center gap-3 border-b border-border px-4 pt-4 pb-2">
                <Text className="min-w-0 flex-1 text-base font-t3-semibold text-foreground">
                  {intentIsCurrent && intent
                    ? intent.action === "replace"
                      ? offer.text === ""
                        ? "Clear draft text?"
                        : "Replace draft text?"
                      : intent.action === "append"
                        ? "Append to draft?"
                        : "Insert at selection?"
                    : "Full editor suggestion"}
                </Text>
                <Pressable accessibilityRole="button" onPress={close} className="p-3">
                  <Text className="text-foreground">Cancel</Text>
                </Pressable>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 16, paddingBottom: Math.max(20, insets.bottom) }}
              >
                <Text className="text-xs text-foreground-muted">
                  Only this device's draft text changes. Attachments and settings stay. Nothing is
                  sent.
                </Text>
                {notice ? (
                  <Text accessibilityRole="alert" className="text-sm text-foreground">
                    {notice}
                  </Text>
                ) : null}
                {intentIsCurrent && intent ? (
                  <>
                    <Text className="text-xs text-foreground-muted">Current draft</Text>
                    <Text selectable className="text-sm text-foreground">
                      {intent.draft.text || "Empty text"}
                    </Text>
                    <Text className="pt-3 text-xs text-foreground-muted">Proposed draft</Text>
                    <Text selectable className="text-sm text-foreground">
                      {intent.text || "Empty text"}
                    </Text>
                    {intent.blocked ? (
                      <Text accessibilityRole="alert" className="text-sm text-foreground">
                        {intent.blocked}
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(intent.blocked)}
                      onPress={apply}
                      className="py-4"
                    >
                      <Text className="text-sm font-t3-semibold text-foreground">
                        {intent.action === "replace"
                          ? "Confirm replace"
                          : intent.action === "append"
                            ? "Confirm append"
                            : "Confirm insert"}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text className="text-xs text-foreground-muted">
                      Full received plaintext. The compact preview is abbreviated.
                    </Text>
                    <Text selectable className="text-sm text-foreground">
                      {offer.text || "Empty text proposal"}
                    </Text>
                    {offer.blocked ? (
                      <Text className="text-xs text-foreground-muted">{offer.blocked}</Text>
                    ) : null}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
