import { PI_VAULT_ARCHIVE_MAX_BYTES, type ApprovalRequestId } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { Button } from "../ui/button";

interface ComposerPiSecretInputCardProps {
  requestId: ApprovalRequestId;
  header: string;
  question: string;
  fileInput?: boolean;
  unavailable: boolean;
  onRespond: (
    requestId: ApprovalRequestId,
    response: { value: string } | { cancelled: true },
  ) => Promise<boolean>;
}

/** The credential never enters a composer draft or a thread activity. */
export function ComposerPiSecretInputCard({
  requestId,
  header,
  question,
  fileInput = false,
  unavailable,
  onRespond,
}: ComposerPiSecretInputCardProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const respond = async (response: { value: string } | { cancelled: true }) => {
    if (unavailable || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setValue("");
    setError(null);
    try {
      if (!(await onRespond(requestId, response))) {
        setError("Could not respond to this request. Check the connection and try again.");
      }
    } catch {
      setError("Could not respond to this request. Check the connection and try again.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const chooseArchive = async (file: File | undefined) => {
    if (!file || unavailable || inFlight.current) return;
    if (file.size === 0 || file.size > PI_VAULT_ARCHIVE_MAX_BYTES) {
      setError("Choose an archive smaller than 12 MB.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 16384) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
      }
      if (!(await onRespond(requestId, { value: btoa(binary) }))) {
        setError("Could not send the archive. Check the connection and try again.");
      }
    } catch {
      setError("Could not send the archive. Check the connection and try again.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="px-3 py-2.5 sm:px-4" data-pi-secret-input>
      <div className="text-xs font-medium text-muted-foreground">{header}</div>
      <p className="mt-1 text-sm text-foreground/85 wrap-anywhere">{question}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {fileInput ? (
          <input
            type="file"
            aria-label="Encrypted vault archive"
            accept=".transfer,.json,application/json"
            disabled={unavailable || submitting}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void chooseArchive(file);
            }}
            className="min-w-0 flex-1 text-sm text-foreground"
          />
        ) : (
          <>
            <input
              type="password"
              aria-label="Secret response"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.stopPropagation();
                void respond({ value });
              }}
              disabled={unavailable || submitting}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
            <Button
              type="button"
              size="sm"
              disabled={unavailable || submitting}
              onClick={() => void respond({ value })}
            >
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={unavailable || submitting}
          onClick={() => void respond({ cancelled: true })}
        >
          Cancel
        </Button>
      </div>
      {unavailable ? (
        <p className="mt-2 text-xs text-secondary-label">Reconnect to respond.</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
