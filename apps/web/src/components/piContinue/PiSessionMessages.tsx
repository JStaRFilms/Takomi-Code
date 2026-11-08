import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { PiSessionMessagePreviewMessage } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useContext, useState } from "react";

import { formatEnvironmentQueryError } from "~/state/query";
import { piSessionMessagePreview } from "~/state/piSessions";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import type { PiContinueDialogTarget } from "./PiContinueDialog";

/** Forking includes an assistant message but excludes a user message, returning its text unsent. */
export function PiSessionMessageList({
  target,
  sessionHandle,
  canFork,
  busy,
  onForkFrom,
}: {
  readonly target: PiContinueDialogTarget;
  readonly sessionHandle: string;
  readonly canFork: boolean;
  readonly busy: boolean;
  readonly onForkFrom: (message: PiSessionMessagePreviewMessage) => void;
}) {
  const registry = useContext(RegistryContext);
  const [showMore, setShowMore] = useState(false);
  const limit = showMore ? 500 : 100;
  const queryAtom = piSessionMessagePreview({
    environmentId: target.environmentId,
    input: {
      providerInstanceId: target.providerInstanceId,
      projectId: target.projectId,
      sessionHandle,
      limit,
    },
  });
  const result = useAtomValue(queryAtom);
  const data = Option.getOrNull(AsyncResult.value(result));
  const error = result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null;
  const isPending = result.waiting || result._tag === "Initial";
  return (
    <div className="border-t border-border/60 bg-muted/30">
      <div className="flex items-center justify-between py-1 pe-2 ps-3">
        <span className="text-2xs text-muted-foreground">
          {data
            ? `${data.messages.length} message${data.messages.length === 1 ? "" : "s"} · showing last ${limit}${data.truncated ? ", older ones omitted" : ""}`
            : "Messages"}
        </span>
        <div className="flex items-center gap-1">
          {data?.truncated && !showMore ? (
            <Button size="micro" variant="ghost" onClick={() => setShowMore(true)}>
              Show more
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            title="Refresh messages"
            aria-label="Refresh messages"
            onClick={() => registry.refresh(queryAtom)}
          >
            <RefreshIcon refreshing={isPending} className="size-3.5" />
          </Button>
        </div>
      </div>
      {isPending && !data ? (
        <div className="px-3 pb-2 text-xs text-muted-foreground">Loading messages…</div>
      ) : null}
      {error !== null ? <div className="px-3 pb-2 text-xs text-destructive">{error}</div> : null}
      {data && data.messages.length === 0 && !isPending ? (
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          No text messages in this session.
        </div>
      ) : null}
      {data ? (
        <div
          className={`divide-y divide-border/60 overflow-y-auto ${showMore ? "max-h-[32rem]" : "max-h-64"}`}
        >
          {data.messages.map((message) => (
            <PiSessionPreviewRow
              key={`${message.recordIndex}`}
              message={message}
              canFork={canFork}
              busy={busy}
              onForkFrom={onForkFrom}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PiSessionPreviewRow({
  message,
  canFork,
  busy,
  onForkFrom,
}: {
  readonly message: PiSessionMessagePreviewMessage;
  readonly canFork: boolean;
  readonly busy: boolean;
  readonly onForkFrom: (message: PiSessionMessagePreviewMessage) => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5">
      <span className="w-7 shrink-0 text-3xs font-medium uppercase text-muted-foreground">
        {message.role === "user" ? "You" : "AI"}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{message.text}</span>
      {canFork ? (
        <span className="shrink-0 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 focus-within:opacity-100">
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            title={
              message.role === "user"
                ? "Fork keeping everything before this message; it lands back in your composer, unsent"
                : "Fork a new session keeping everything through this message"
            }
            onClick={() => onForkFrom(message)}
          >
            Fork from here
          </Button>
        </span>
      ) : null}
    </div>
  );
}
