import type { ApprovalRequestId } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { Button } from "../ui/button";

interface ComposerPiSecretInputCardProps {
  requestId: ApprovalRequestId;
  header: string;
  question: string;
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

  return (
    <div className="px-3 py-2.5 sm:px-4" data-pi-secret-input>
      <div className="text-xs font-medium text-muted-foreground">{header}</div>
      <p className="mt-1 text-sm text-foreground/85 wrap-anywhere">{question}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
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
