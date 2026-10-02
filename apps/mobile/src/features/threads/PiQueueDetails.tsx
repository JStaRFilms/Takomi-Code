import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { piQueueStateLines } from "@t3tools/client-runtime/state/piQueueState";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useContext, useEffect } from "react";
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "../../components/AppText";
import { ContextSheetSize } from "../../components/ContextSheetSize";
import { environmentPiQueueState } from "../../state/piQueueState";

export function PiQueueButton({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open native queue state"
      className="px-3 py-2"
      onPress={() => registry.set(environmentPiQueueState.openAtom(threadRef), true)}
    >
      <Text className="text-xs text-foreground-muted">Native queue</Text>
    </Pressable>
  );
}

export function PiQueueDetails({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  const openAtom = environmentPiQueueState.openAtom(threadRef);
  const open = useAtomValue(openAtom);
  const navigation = useNavigation();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { environmentId, threadId } = threadRef;
  useEffect(() => {
    const close = () =>
      registry.set(environmentPiQueueState.openAtom({ environmentId, threadId }), false);
    const unsubscribe = navigation.addListener("blur", close);
    return () => {
      unsubscribe();
      close();
    };
  }, [registry, navigation, environmentId, threadId]);
  if (!open) return null;
  return (
    <Modal
      animationType="slide"
      presentationStyle={Platform.OS === "android" ? "overFullScreen" : "pageSheet"}
      transparent={Platform.OS === "android"}
      onRequestClose={() => registry.set(openAtom, false)}
    >
      <View className="flex-1 justify-end bg-backdrop">
        <View
          className="overflow-hidden rounded-t-3xl bg-sheet-solid"
          style={{ height: height - insets.top - 24 }}
        >
          <ContextSheetSize height={height - insets.top - 24} />
          <View className="flex-row items-center gap-3 border-b border-border px-4 pt-4 pb-2">
            <Text className="min-w-0 flex-1 text-base font-t3-semibold text-foreground">
              Native queue
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close native queue state"
              className="p-3"
              onPress={() => registry.set(openAtom, false)}
            >
              <Text className="text-foreground">Done</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: Math.max(20, insets.bottom) }}
          >
            <PiQueueContent threadRef={threadRef} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function PiQueueContent({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  const state = useAtomValue(environmentPiQueueState.stateAtom(threadRef));
  return (
    <View className="gap-3">
      {state.message ? (
        <Text
          accessibilityRole={state.status === "error" ? "alert" : "text"}
          accessibilityLiveRegion="polite"
          className="text-sm text-foreground-muted"
        >
          {state.message}
        </Text>
      ) : null}
      {state.snapshot
        ? piQueueStateLines(state.snapshot).map((line) => (
            <Text key={line} selectable className="text-sm text-foreground">
              {line}
            </Text>
          ))
        : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh native queue state"
        accessibilityState={{ disabled: !state.canRefresh, busy: state.status === "loading" }}
        disabled={!state.canRefresh}
        className="py-3"
        onPress={() => environmentPiQueueState.refresh(registry, threadRef)}
      >
        <Text className="text-sm text-foreground">Refresh</Text>
      </Pressable>
    </View>
  );
}
