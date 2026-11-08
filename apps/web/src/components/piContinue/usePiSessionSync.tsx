import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { ArrowDownIcon } from "lucide-react";
import { useState } from "react";
import { piSessionSyncUpdates } from "../../state/piSessions";
import { useAtomCommand } from "../../state/use-atom-command";
import type { ComposerBannerStackItem } from "../chat/ComposerBannerStack";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { usePiSyncUpdate } from "./PiSyncGate";

const noSyncPermission = Atom.make(false);

export function usePiSessionSync(target: ScopedThreadRef | null) {
  const canSync = useAtomValue(
    target ? piSessionSyncUpdates.permissionAtom(target.environmentId) : noSyncPermission,
  );
  const scope = target ? JSON.stringify(target) : null;
  const current = usePiSyncUpdate(target);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sync = useAtomCommand(piSessionSyncUpdates, { reportFailure: false });
  const key = current ? JSON.stringify([scope, current.updateKey]) : null;
  const banner: ComposerBannerStackItem | null =
    target && current && key !== dismissed
      ? {
          id: `pi-sync:${key}`,
          variant: "info",
          icon: <ArrowDownIcon />,
          title: `${current.newMessages} new CLI message${current.newMessages === 1 ? "" : "s"}`,
          description: "Sync to show them here. Sending works either way.",
          actions: (
            <Button
              size="xs"
              variant="ghost"
              disabled={busy || !canSync}
              onClick={async () => {
                if (busy || !canSync) return;
                setBusy(true);
                const result = await sync({
                  environmentId: target.environmentId,
                  input: { threadId: target.threadId },
                });
                setBusy(false);
                if (result._tag === "Success") setDismissed(key);
                else toastManager.add({ type: "error", title: "Could not sync CLI messages" });
              }}
            >
              {busy ? "Syncing…" : "Sync"}
            </Button>
          ),
          dismissLabel: "Dismiss CLI sync notice",
          onDismiss: () => setDismissed(key),
        }
      : null;
  return { banner };
}
