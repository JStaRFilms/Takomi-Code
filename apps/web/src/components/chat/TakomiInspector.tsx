import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleIcon,
  ClipboardListIcon,
  LoaderCircleIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { type WorkLogEntry } from "../../session-logic";
import { cn } from "~/lib/utils";

type PresentationItem = NonNullable<
  NonNullable<NonNullable<WorkLogEntry["presentation"]>["summary"]>["items"]
>[number];

function statusKind(status: string | undefined): "done" | "active" | "failed" | "pending" {
  const normalized = status?.toLowerCase() ?? "";
  if (/completed|complete|passed|done|success/u.test(normalized)) return "done";
  if (/failed|error|blocked|cancel/u.test(normalized)) return "failed";
  if (/running|active|progress|executing|working/u.test(normalized)) return "active";
  return "pending";
}

function StatusIcon({ status }: { status: string | undefined }) {
  const kind = statusKind(status);
  if (kind === "done") return <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-500" />;
  if (kind === "failed") return <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />;
  if (kind === "active") {
    return <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-blue-500" />;
  }
  return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground/70" />;
}

function statusLabel(status: string | undefined) {
  return status?.replaceAll("_", " ").replaceAll("-", " ") ?? "pending";
}

function DetailCard({ entry }: { entry: WorkLogEntry }) {
  const presentation = entry.presentation;
  if (!presentation) return null;
  const status = presentation.error?.message ?? presentation.summary?.status;
  return (
    <div className="rounded-lg border border-border/65 bg-muted/20 p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{presentation.toolName}</p>
          {presentation.action ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{presentation.action}</p>
          ) : null}
        </div>
        {status ? (
          <span className="shrink-0 rounded border border-border/60 bg-background/65 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {status}
          </span>
        ) : null}
      </div>
      {presentation.detailText ? (
        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground/85">
          {presentation.detailText}
        </p>
      ) : null}
      {presentation.summary?.items?.length ? (
        <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
          {presentation.summary.items.map((item) => (
            <div key={item.id} className="flex items-start gap-2">
              <StatusIcon status={item.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground/90">{item.label}</p>
                {item.detail ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
              </div>
              {item.status ? (
                <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                  {statusLabel(item.status)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {presentation.artifactRefs?.length ? (
        <div className="mt-2 space-y-1 border-t border-border/50 pt-2 font-mono text-[11px] text-muted-foreground">
          {presentation.artifactRefs.map((artifact) => (
            <div key={`${artifact.kind}:${artifact.path}`} className="truncate">
              {artifact.label ?? artifact.path}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function mergeItems(entries: readonly WorkLogEntry[]): PresentationItem[] {
  const byId = new Map<string, PresentationItem>();
  for (const entry of entries) {
    for (const item of entry.presentation?.summary?.items ?? []) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function TakomiInspector(props: {
  entries: ReadonlyArray<WorkLogEntry>;
  selectedToolCallId: string | null;
  onSelectToolCallId: (toolCallId: string) => void;
}) {
  const [subagentsOpen, setSubagentsOpen] = useState(true);
  const { board, boardItems, subagents, selected } = useMemo(() => {
    const semantic = props.entries.filter((entry) => entry.presentation);
    const selected =
      semantic.find((entry) => (entry.toolCallId ?? entry.id) === props.selectedToolCallId) ?? null;
    const boardEntries = semantic.filter(
      (entry) => entry.presentation?.toolName === "takomi_board",
    );
    const latestBoard = boardEntries.at(-1) ?? null;
    const selectedSessionId =
      selected?.presentation?.toolName === "takomi_board"
        ? selected.presentation.summary?.sessionId
        : undefined;
    const activeSessionId = selectedSessionId ?? latestBoard?.presentation?.summary?.sessionId;
    const activeBoardEntries = activeSessionId
      ? boardEntries.filter((entry) => entry.presentation?.summary?.sessionId === activeSessionId)
      : boardEntries;
    const subagentByIdentity = new Map<string, WorkLogEntry>();
    for (const entry of semantic) {
      if (entry.presentation?.toolName !== "takomi_subagent") continue;
      const identity = entry.presentation.summary?.runId ?? entry.toolCallId ?? entry.id;
      subagentByIdentity.set(identity, entry);
    }
    return {
      board: activeBoardEntries.at(-1) ?? latestBoard,
      boardItems: mergeItems(activeBoardEntries),
      subagents: [...subagentByIdentity.values()].reverse(),
      selected,
    };
  }, [props.entries, props.selectedToolCallId]);

  const completedCount = boardItems.filter((item) => statusKind(item.status) === "done").length;
  const activeItem = boardItems.find((item) => statusKind(item.status) === "active");
  const boardStatus = board?.presentation?.summary?.status;

  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-auto p-4" aria-label="Takomi inspector">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ClipboardListIcon className="size-3.5" /> Pinned board progress
          </div>
          {board ? (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Updates in place
            </span>
          ) : null}
        </div>
        {board ? (
          <button
            type="button"
            onClick={() => props.onSelectToolCallId(board.toolCallId ?? board.id)}
            className="w-full rounded-lg border border-border/65 bg-muted/25 p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            <p className="truncate text-xs font-medium text-foreground">
              Session: {board.presentation?.summary?.sessionId ?? "Takomi board"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {boardItems.length > 0
                ? `${completedCount}/${boardItems.length} complete${activeItem ? ` · ${activeItem.label}` : ""}`
                : boardStatus
                  ? statusLabel(boardStatus)
                  : "Board session active"}
            </p>
            {boardItems.length > 0 ? (
              <div className="mt-3 space-y-2.5 border-t border-border/50 pt-3">
                {boardItems.map((item) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <StatusIcon status={item.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-foreground/90">{item.label}</p>
                      {item.detail ? (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {item.detail}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                      {statusLabel(item.status)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">No board activity in this thread.</p>
        )}
      </section>

      <section className="mt-4 border-t border-border/60 pt-4">
        <button
          type="button"
          aria-expanded={subagentsOpen}
          onClick={() => setSubagentsOpen((open) => !open)}
          className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          <UsersIcon className="size-3.5" /> Subagent status matrix
          {subagents.length > 0 ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal tabular-nums">
              {subagents.length}
            </span>
          ) : null}
          <ChevronDownIcon
            className={cn("ml-auto size-3.5 transition-transform", !subagentsOpen && "-rotate-90")}
          />
        </button>
        {subagentsOpen ? (
          <div className="mt-2 space-y-2 rounded-lg border border-border/65 bg-muted/20 p-3">
            {subagents.length > 0 ? (
              subagents.map((entry) => {
                const presentation = entry.presentation!;
                const item = presentation.summary?.items?.[0];
                const status =
                  presentation.error?.severity === "error"
                    ? "failed"
                    : (presentation.summary?.status ?? entry.toolLifecycleStatus);
                return (
                  <button
                    type="button"
                    key={presentation.summary?.runId ?? entry.toolCallId ?? entry.id}
                    onClick={() => props.onSelectToolCallId(entry.toolCallId ?? entry.id)}
                    className="flex w-full items-start gap-2 rounded px-1 py-1 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                  >
                    <StatusIcon status={status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-foreground/90">
                        {item?.label ?? presentation.summary?.taskId ?? "Subagent run"}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {item?.detail ??
                          presentation.detailText ??
                          presentation.summary?.runId ??
                          "Takomi subagent"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                      {statusLabel(status)}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground">No subagent activity.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="mt-4 border-t border-border/60 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Context detail
        </p>
        {selected ? (
          <DetailCard entry={selected} />
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Select a board, subagent, or inline tool call to inspect its latest detail here.
          </p>
        )}
      </section>
    </aside>
  );
}
