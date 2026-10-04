import { PI_VAULT_ARCHIVE_MAX_BYTES, type RuntimeRequestId } from "@t3tools/contracts";
import { beginForegroundHandoff } from "../../lib/foreground-handoff";
import { useRef, useState } from "react";
import { View } from "react-native";

import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { RequestActionButton } from "./RequestActionButton";

interface PiSecretInputCardProps {
  requestId: RuntimeRequestId;
  header: string;
  question: string;
  fileInput?: boolean;
  unavailable: boolean;
  onInputFocusChange?: (focused: boolean) => void;
  onRespond: (
    requestId: RuntimeRequestId,
    response: { value: string } | { cancelled: true },
  ) => Promise<boolean>;
}

/** The credential stays in this mounted card, never in a composer or shared draft. */
export function PiSecretInputCard({
  requestId,
  header,
  question,
  fileInput = false,
  unavailable,
  onInputFocusChange,
  onRespond,
}: PiSecretInputCardProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const respond = async (response: { value: string } | { cancelled: true }) => {
    if (unavailable || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setValue("");
    setError(false);
    try {
      if (!(await onRespond(requestId, response))) setError(true);
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const chooseArchive = async () => {
    if (unavailable || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(false);
    try {
      const { getDocumentAsync } = await import("expo-document-picker");
      const endHandoff = beginForegroundHandoff();
      let selected;
      try {
        selected = await getDocumentAsync({ copyToCacheDirectory: true });
      } finally {
        endHandoff();
      }
      if (selected.canceled || !selected.assets[0]) return;
      const { File } = await import("expo-file-system");
      const file = new File(selected.assets[0].uri);
      const size = file.size ?? selected.assets[0].size ?? 0;
      if (size < 1 || size > PI_VAULT_ARCHIVE_MAX_BYTES) {
        setError(true);
        return;
      }
      if (!(await onRespond(requestId, { value: await file.base64() }))) setError(true);
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View className="gap-2.5">
      <Text className="font-t3-bold text-xs uppercase tracking-[1px] text-foreground-muted">
        {header}
      </Text>
      <Text className="font-sans text-base leading-snug text-foreground">{question}</Text>
      {!fileInput ? (
        <TextInput
          accessibilityLabel="Secret response"
          secureTextEntry
          autoCorrect={false}
          autoCapitalize="none"
          textContentType="password"
          value={value}
          onChangeText={setValue}
          onFocus={() => onInputFocusChange?.(true)}
          onBlur={() => onInputFocusChange?.(false)}
          editable={!unavailable && !submitting}
        />
      ) : null}
      <View className="flex-row flex-wrap gap-2.5">
        <RequestActionButton
          label={submitting ? "Sending…" : fileInput ? "Choose archive" : "Submit"}
          disabled={unavailable || submitting}
          onPress={() => void (fileInput ? chooseArchive() : respond({ value }))}
        />
        <RequestActionButton
          label="Cancel"
          tone="secondary"
          disabled={unavailable || submitting}
          onPress={() => void respond({ cancelled: true })}
        />
      </View>
      {unavailable ? (
        <Text className="font-sans text-xs text-foreground-muted">Reconnect to respond.</Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="font-sans text-xs text-danger-foreground">
          {fileInput
            ? "Could not send the archive. Choose a file smaller than 12 MB and try again."
            : "Could not respond to this request. Check the connection and try again."}
        </Text>
      ) : null}
    </View>
  );
}
