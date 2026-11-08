import { use, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { AsyncResult } from "effect/reactivity";
import { useAtomCommand } from "../../state/use-atom-command";
import { piVaultExportTake } from "../../state/piSessions";
import { Button } from "../ui/button";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";

const noExportPermission = Atom.make(false);

export function VaultNoticeTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "vault-notice" }>;
}) {
  const { threadRef } = use(TimelineRowCtx);
  const canExport = useAtomValue(
    threadRef ? piVaultExportTake.permissionAtom(threadRef.environmentId) : noExportPermission,
  );
  const takeExport = useAtomCommand(piVaultExportTake, {
    reportFailure: false,
    reportDefect: false,
  });
  const [key, setKey] = useState<string | null>(null);
  const archiveRef = useRef<{ filename: string; archive: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const download = async () => {
    if (!threadRef || !row.transferId || !canExport || busy) return;
    setBusy(true);
    setError(false);
    try {
      if (!archiveRef.current) {
        const result = await takeExport({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, transferId: row.transferId },
        });
        if (!AsyncResult.isSuccess(result)) {
          setError(true);
          return;
        }
        archiveRef.current = { filename: result.value.filename, archive: result.value.archive };
        setKey(result.value.key);
      }
      const archive = archiveRef.current;
      if (!archive) return;
      const raw = atob(archive.archive);
      const bytes = new Uint8Array(raw.length);
      for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = archive.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm" role="status">
      <div className="mb-1 text-xs font-medium text-muted-foreground">Vault</div>
      <div className="whitespace-pre-wrap wrap-break-word text-foreground">{row.message}</div>
      {row.transferId ? (
        <Button
          type="button"
          size="sm"
          className="mt-2"
          disabled={!canExport || busy}
          onClick={() => void download()}
        >
          {busy ? "Downloading…" : key ? "Download archive again" : "Download archive and show key"}
        </Button>
      ) : null}
      {key ? (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">
            Save this key separately. It will disappear when you leave this thread.
          </p>
          <code
            className="block select-text break-all rounded bg-background p-2 text-xs"
            aria-label="Vault transfer key"
          >
            {key}
          </code>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Could not download the vault archive. The key may already have been retrieved.
        </p>
      ) : null}
    </div>
  );
}
