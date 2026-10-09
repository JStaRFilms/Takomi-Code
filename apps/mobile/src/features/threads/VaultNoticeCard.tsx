import { AsyncResult } from "effect/reactivity";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { piVaultExportTake } from "../../state/piVaultTransfer";
import { useAtomCommand } from "../../state/use-atom-command";
import { RequestActionButton } from "./RequestActionButton";

export function VaultNoticeCard(props: {
  readonly message: string;
  readonly transferId?: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const takeExport = useAtomCommand(piVaultExportTake, {
    reportFailure: false,
    reportDefect: false,
  });
  const [key, setKey] = useState<string | null>(null);
  const archiveRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const share = async () => {
    if (!props.transferId || busy) return;
    setBusy(true);
    setError(false);
    try {
      const Sharing = await import("expo-sharing");
      if (!(await Sharing.isAvailableAsync())) {
        setError(true);
        return;
      }
      if (!archiveRef.current) {
        const result = await takeExport({
          environmentId: props.environmentId,
          input: { threadId: props.threadId, transferId: props.transferId },
        });
        if (!AsyncResult.isSuccess(result)) {
          setError(true);
          return;
        }
        archiveRef.current = result.value.archive;
        setKey(result.value.key);
      }
      const archive = archiveRef.current;
      if (!archive) return;
      const { File, Paths } = await import("expo-file-system");
      const file = new File(Paths.cache, `vault-${props.transferId}.transfer`);
      try {
        file.create({ overwrite: true });
        file.write(archive, { encoding: "base64" });
        await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
      } finally {
        if (file.exists) file.delete();
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      className="mb-3 gap-2 rounded-[16px] border border-border bg-card-alt px-3 py-2.5"
      accessible
    >
      <Text className="font-t3-bold text-xs text-foreground-secondary">Vault</Text>
      <Text className="font-sans text-sm leading-normal text-foreground" selectable>
        {props.message}
      </Text>
      {props.transferId ? (
        <RequestActionButton
          label={
            busy ? "Preparing archive…" : key ? "Save archive again" : "Save archive and show key"
          }
          disabled={busy}
          onPress={() => void share()}
        />
      ) : null}
      {key ? (
        <View className="gap-1">
          <Text className="font-sans text-xs text-foreground-secondary">
            Save this key separately. It disappears when this card closes.
          </Text>
          <Text
            className="font-sans text-sm text-foreground"
            selectable
            accessibilityLabel="Vault transfer key"
          >
            {key}
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="font-sans text-xs text-danger-foreground">
          Could not save the archive. The key may already have been retrieved.
        </Text>
      ) : null}
    </View>
  );
}
