import { useAtomValue } from "@effect/atom-react";
import type { ExtensionTextEntry } from "@t3tools/client-runtime/state/providerExtensionState";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { memo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "../../components/AppText";
import { ContextSheetSize } from "../../components/ContextSheetSize";
import { environmentExtensionState } from "../../state/providerExtensionState";

function TextDisclosure(props: {
  readonly entry: ExtensionTextEntry;
  readonly notice: string | null;
  readonly omitted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open extension text ${props.entry.key}`}
        className="py-2"
        onPress={() => setOpen(true)}
      >
        <Text numberOfLines={1} className="text-xs text-foreground-muted">
          {props.entry.key} {props.entry.text.split("\n", 1)[0]}
        </Text>
      </Pressable>
      {open ? (
        <Modal
          animationType="slide"
          presentationStyle={Platform.OS === "android" ? "overFullScreen" : "pageSheet"}
          transparent={Platform.OS === "android"}
          onRequestClose={() => setOpen(false)}
        >
          <View className="flex-1 justify-end bg-backdrop">
            <View
              className="overflow-hidden rounded-t-3xl bg-sheet-solid"
              style={{ height: height - insets.top - 24 }}
            >
              <ContextSheetSize height={height - insets.top - 24} />
              <View className="flex-row items-center gap-3 border-b border-border px-4 pt-4 pb-2">
                <Text className="min-w-0 flex-1 text-base font-t3-semibold text-foreground">
                  {props.entry.key}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close extension text"
                  className="p-3"
                  onPress={() => setOpen(false)}
                >
                  <Text className="text-foreground">Done</Text>
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: Math.max(20, insets.bottom) }}
              >
                {props.notice ? (
                  <Text className="text-xs text-foreground-muted">{props.notice}</Text>
                ) : null}
                {props.omitted ? (
                  <Text className="text-xs text-foreground-muted">
                    Some extension text was truncated or omitted.
                  </Text>
                ) : null}
                <Text selectable className="text-sm text-foreground">
                  {props.entry.text}
                </Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

export const ProviderExtensionText = memo(function ProviderExtensionText(props: {
  readonly threadRef: ScopedThreadRef;
  readonly section: "statuses" | "aboveEditor" | "belowEditor";
}) {
  const presentation = useAtomValue(environmentExtensionState.presentationAtom(props.threadRef));
  const showNotice = props.section === "statuses";
  const entries =
    showNotice && presentation.subtitle
      ? [presentation.subtitle, ...presentation.statuses]
      : presentation[props.section];
  if (entries.length === 0 && !(showNotice && (presentation.notice || presentation.omitted)))
    return null;
  return (
    <View accessibilityLabel={`Extension ${props.section}`} className="px-3">
      {showNotice && presentation.notice ? (
        <Text className="text-xs text-foreground-muted">{presentation.notice}</Text>
      ) : null}
      {showNotice && presentation.omitted ? (
        <Text className="text-xs text-foreground-muted">
          Some extension text was truncated or omitted.
        </Text>
      ) : null}
      <ScrollView style={{ maxHeight: 80 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {entries.map((entry) => (
          <TextDisclosure
            key={entry.id}
            entry={entry}
            notice={presentation.notice}
            omitted={presentation.omitted}
          />
        ))}
      </ScrollView>
    </View>
  );
});
