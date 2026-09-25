import type { ApprovalRequestId } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { View } from "react-native";

import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { RequestActionButton } from "./RequestActionButton";

interface PiSecretInputCardProps {
  requestId: ApprovalRequestId;
  header: string;
  question: string;
  unavailable: boolean;
  onInputFocusChange?: (focused: boolean) => void;
  onRespond: (
    requestId: ApprovalRequestId,
    response: { value: string } | { cancelled: true },
  ) => Promise<boolean>;
}

/** The credential stays in this mounted card, never in a composer or shared draft. */
export function PiSecretInputCard({
  requestId,
  header,
  question,
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

  return (
    <View className="gap-2.5">
      <Text className="font-t3-bold text-xs uppercase tracking-[1px] text-foreground-muted">
        {header}
      </Text>
      <Text className="font-sans text-base leading-snug text-foreground">{question}</Text>
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
      <View className="flex-row flex-wrap gap-2.5">
        <RequestActionButton
          label={submitting ? "Submitting…" : "Submit"}
          disabled={unavailable || submitting}
          onPress={() => void respond({ value })}
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
          Could not respond to this request. Check the connection and try again.
        </Text>
      ) : null}
    </View>
  );
}
