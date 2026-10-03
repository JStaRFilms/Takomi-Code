import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  PiSessionCatalogEntry,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import * as Option from "effect/Option";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { formatEnvironmentQueryError } from "~/state/query";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { useComposerDraftStore } from "~/composerDraftStore";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { newThreadId } from "~/lib/utils";
import { piSessionAttach, piSessionCatalog, piSessionFork } from "~/state/piSessions";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { DiscoveryList } from "../ui/discovery-list";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { PiSessionMessageList } from "./PiSessionMessages";
import {
  buildPiContinueThreadTitle,
  describePiContinueError,
  isPiSessionContinuable,
} from "./piContinue.logic";

/** Where "Continue Pi session" should list and bind. Set by any entry point. */
export interface PiContinueDialogTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly model: string;
  readonly providerDisplayName: string;
  readonly canFork: boolean;
}

const piContinueDialogTargetAtom = Atom.make<PiContinueDialogTarget | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("pi-sessions:continue-dialog-target"),
);

export function openPiContinueDialog(target: PiContinueDialogTarget): void {
  appAtomRegistry.set(piContinueDialogTargetAtom, target);
}

function closePiContinueDialog(): void {
  appAtomRegistry.set(piContinueDialogTargetAtom, null);
}

/** Mounted once per chat view; shows the picker for whichever entry point asked. */
export function PiContinueDialogHost() {
  const target = useAtomValue(piContinueDialogTargetAtom);
  if (target === null) return null;
  return <PiContinueDialog key={`${target.environmentId}:${target.projectId}`} target={target} />;
}

function usePiContinueCatalog(target: PiContinueDialogTarget) {
  const registry = useContext(RegistryContext);
  const queryAtom = useMemo(
    () =>
      piSessionCatalog({
        environmentId: target.environmentId,
        input: { providerInstanceId: target.providerInstanceId, projectId: target.projectId },
      }),
    [target.environmentId, target.projectId, target.providerInstanceId],
  );
  const result = useAtomValue(queryAtom);
  const refresh = useCallback(() => registry.refresh(queryAtom), [queryAtom, registry]);
  // A rename in the terminal minutes ago must show up now: the catalog
  // query caches, so every dialog open starts with a fresh scan.
  useEffect(() => {
    refresh();
  }, [refresh]);
  return {
    entries: Option.getOrNull(AsyncResult.value(result))?.entries ?? null,
    nextPageAvailable: Option.getOrNull(AsyncResult.value(result))?.nextPageAvailable ?? false,
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting || result._tag === "Initial",
    refresh,
  };
}

function formatModifiedAt(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  return new Date(time).toLocaleString();
}

function PiSessionRow({
  entry,
  target,
  canFork,
  busy,
  activeMode,
  onContinue,
}: {
  readonly entry: PiSessionCatalogEntry;
  readonly target: PiContinueDialogTarget;
  readonly canFork: boolean;
  readonly busy: boolean;
  readonly activeMode: "attach" | "fork" | null;
  readonly onContinue: (
    entry: PiSessionCatalogEntry,
    mode: "attach" | "fork",
    maxRecords?: number,
    seedPrompt?: string,
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const compatible = isPiSessionContinuable(entry);
  const versionNote =
    entry.compatibility === "compatible" || compatible ? "" : " · incompatible version";
  return (
    <div>
      <div className="group flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40">
        <Button
          size="icon"
          variant="ghost"
          className="size-6 shrink-0"
          disabled={!compatible}
          title={compatible ? "Show messages" : "Only version-3 sessions can be continued"}
          aria-label={expanded ? "Hide messages" : "Show messages"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRightIcon
            className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{entry.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[entry.model, formatModifiedAt(entry.modifiedAt)].filter(Boolean).join(" · ")}
            {` · ${entry.entryCount}${entry.entryCountExact ? "" : "+"} records`}
            {versionNote}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !compatible}
          title={
            compatible
              ? "Continue this session in a new thread"
              : "Only version-3 sessions can be continued"
          }
          onClick={() => onContinue(entry, "attach")}
        >
          {activeMode === "attach" ? "Continuing…" : "Continue"}
        </Button>
        {canFork ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !compatible}
            title={
              compatible
                ? "Fork into a new session file, then continue"
                : "Only version-3 sessions can be forked"
            }
            onClick={() => onContinue(entry, "fork")}
          >
            {activeMode === "fork" ? "Forking…" : "Fork"}
          </Button>
        ) : null}
      </div>
      {expanded && compatible ? (
        <PiSessionMessageList
          target={target}
          sessionHandle={entry.id}
          canFork={canFork}
          busy={busy}
          onForkFrom={(message) =>
            message.role === "user"
              ? onContinue(entry, "fork", message.recordIndex, message.text)
              : onContinue(entry, "fork", message.recordIndex + 1)
          }
        />
      ) : null}
    </div>
  );
}

function PiContinueDialog({ target }: { readonly target: PiContinueDialogTarget }) {
  const navigate = useNavigate();
  const { entries, nextPageAvailable, error, isPending, refresh } = usePiContinueCatalog(target);
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const attachSession = useAtomCommand(piSessionAttach, { reportFailure: false });
  const forkSession = useAtomCommand(piSessionFork, { reportFailure: false });
  const [busy, setBusy] = useState<{ handle: string; mode: "attach" | "fork" } | null>(null);
  const [actionError, setActionError] = useState<{ message: string; threadId?: ThreadId } | null>(
    null,
  );

  const onContinue = useCallback(
    async (
      entry: PiSessionCatalogEntry,
      mode: "attach" | "fork",
      maxRecords?: number,
      seedPrompt?: string,
    ) => {
      if (busy !== null) return;
      setBusy({ handle: entry.id, mode });
      setActionError(null);
      const threadId = newThreadId();
      const createdAt = new Date().toISOString();
      let threadCreated = false;
      try {
        const created = await createThread({
          environmentId: target.environmentId,
          input: {
            threadId,
            projectId: target.projectId,
            title: buildPiContinueThreadTitle(entry.name, mode === "fork" ? "forked" : "attached"),
            modelSelection: {
              instanceId: target.providerInstanceId,
              model: target.model,
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt,
          },
        });
        if (created._tag === "Failure") {
          throw new Error(
            isAtomCommandInterrupted(created)
              ? "Connection interrupted while creating the thread. Check your thread list before retrying."
              : "Could not create the thread for this session.",
          );
        }
        threadCreated = true;
        const continueInput = {
          providerInstanceId: target.providerInstanceId,
          projectId: target.projectId,
          threadId,
          sessionHandle: entry.id,
        };
        const continued =
          mode === "fork"
            ? await forkSession({
                environmentId: target.environmentId,
                input: {
                  ...continueInput,
                  ...(maxRecords !== undefined ? { maxRecords } : {}),
                },
              })
            : await attachSession({ environmentId: target.environmentId, input: continueInput });
        if (continued._tag === "Failure") {
          throw new Error(
            isAtomCommandInterrupted(continued)
              ? "Connection interrupted while continuing the session."
              : describePiContinueError(
                  squashAtomCommandFailure(continued),
                  mode === "fork"
                    ? "Could not fork this session."
                    : "Could not continue this session.",
                ),
          );
        }
        closePiContinueDialog();
        // Pi-style branching: forking from your own message keeps everything
        // before it and hands the text back to the composer, unsent.
        if (seedPrompt !== undefined) {
          useComposerDraftStore
            .getState()
            .setPrompt(scopeThreadRef(target.environmentId, threadId), seedPrompt);
        }
        await navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId: target.environmentId, threadId },
        });
        const hydrated = continued._tag === "Success" ? (continued.value.hydratedMessages ?? 0) : 0;
        toastManager.add(
          stackedThreadToast({
            type: "success",
            title:
              mode === "fork" ? "Forked CLI session into a new thread" : "Continuing CLI session",
            description:
              seedPrompt !== undefined
                ? "Your message is back in the composer, unsent — edit it and send to branch off."
                : hydrated > 0
                  ? `Showing ${hydrated} earlier message${hydrated === 1 ? "" : "s"} — send a message to pick up where the CLI left off.`
                  : "Send a message to pick up where the CLI left off. The model has the full CLI context.",
          }),
        );
      } catch (failure) {
        setActionError({
          message: describePiContinueError(failure, "Could not continue this session."),
          ...(threadCreated ? { threadId } : {}),
        });
      } finally {
        setBusy(null);
      }
    },
    [attachSession, busy, createThread, forkSession, navigate, target],
  );

  const failedThreadId = actionError?.threadId;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closePiContinueDialog();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Continue a CLI session</DialogTitle>
          <DialogDescription>
            {target.providerDisplayName} sessions for this project. Continuing starts a new thread
            with the full CLI context; forking clones the session file first so the two sides
            diverge.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-2">
            {isPending ? (
              <div className="text-sm text-muted-foreground">Loading sessions…</div>
            ) : null}
            {busy !== null ? (
              <div role="status" className="text-sm text-muted-foreground">
                {busy.mode === "fork" ? "Forking" : "Continuing"} session and loading earlier
                messages. This may take a while.
              </div>
            ) : null}
            {error !== null ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm">
                <span>{error}</span>
                <Button size="sm" variant="ghost" onClick={refresh}>
                  Retry
                </Button>
              </div>
            ) : null}
            {entries !== null && entries.length === 0 && !isPending ? (
              <div className="text-sm text-muted-foreground">
                No CLI sessions for this project yet. Start one in a terminal with <code>pi</code>,
                then come back here.
              </div>
            ) : null}
            {entries && entries.length > 0 ? (
              <DiscoveryList>
                {entries.map((entry) => (
                  <PiSessionRow
                    key={entry.id}
                    entry={entry}
                    target={target}
                    canFork={target.canFork}
                    busy={busy !== null}
                    activeMode={busy?.handle === entry.id ? busy.mode : null}
                    onContinue={onContinue}
                  />
                ))}
              </DiscoveryList>
            ) : null}
            {nextPageAvailable ? (
              <div className="text-xs text-muted-foreground">
                Showing the most recent sessions; older ones stay in the terminal.
              </div>
            ) : null}
            {actionError !== null ? (
              <div
                className="rounded-lg border border-destructive/40 px-3 py-2 text-sm"
                role="alert"
              >
                <div>{actionError.message}</div>
                {failedThreadId !== undefined ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span>
                      The thread was kept. Open it to check the result before trying again.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        closePiContinueDialog();
                        void navigate({
                          to: "/$environmentId/$threadId",
                          params: {
                            environmentId: target.environmentId,
                            threadId: failedThreadId,
                          },
                        });
                      }}
                    >
                      Open thread
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
