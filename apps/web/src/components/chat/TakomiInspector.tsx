import {
  AlertCircleIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleIcon,
  ClipboardListIcon,
  LoaderCircleIcon,
  MessageCircleIcon,
  RadioIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { type WorkLogEntry } from "../../session-logic";
import { cn } from "~/lib/utils";

type PresentationItem = NonNullable<
  NonNullable<NonNullable<WorkLogEntry["presentation"]>["summary"]>["items"]
>[number];
type PresentationActivity = NonNullable<
  NonNullable<WorkLogEntry["presentation"]>["activity"]
>[number];

function statusKind(status: string | undefined): "done" | "active" | "failed" | "pending" {
  const normalized = status?.toLowerCase() ?? "";
  if (/completed|complete|passed|done|success/u.test(normalized)) return "done";
  if (/failed|error|blocked|cancel|interrupt|stopped/u.test(normalized)) return "failed";
  if (/running|active|progress|executing|working/u.test(normalized)) return "active";
  return "pending";
}

export function reconcileTakomiLivenessStatus(
  status: string | undefined,
  sessionLive: boolean,
): string | undefined {
  return !sessionLive && statusKind(status) === "active" ? "interrupted" : status;
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

const SUBAGENT_SELECTION_MARKER = "::agent:";

function subagentSelectionKey(toolCallId: string, agentId: string) {
  return `${toolCallId}${SUBAGENT_SELECTION_MARKER}${agentId}`;
}

function parseInspectorSelection(selection: string | null) {
  if (!selection) return { toolCallId: null, agentId: null };
  const marker = selection.indexOf(SUBAGENT_SELECTION_MARKER);
  return marker < 0
    ? { toolCallId: selection, agentId: null }
    : {
        toolCallId: selection.slice(0, marker),
        agentId: selection.slice(marker + SUBAGENT_SELECTION_MARKER.length),
      };
}

/** Matches Pi's native presentation/activity identity; old payloads use result-N. */
export function subagentPresentationIdentity(itemId: string, index: number): string {
  return itemId.trim() || `result-${index}`;
}

function ActivityTranscriptRow({
  activity,
  sessionLive,
}: {
  activity: PresentationActivity;
  sessionLive: boolean;
}) {
  const activityStatus = reconcileTakomiLivenessStatus(activity.status, sessionLive);
  const Icon =
    activity.kind === "tool"
      ? WrenchIcon
      : activity.kind === "thinking"
        ? BrainCircuitIcon
        : activity.kind === "message"
          ? MessageCircleIcon
          : RadioIcon;
  return (
    <details className="group rounded bg-background/45 [&>summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-start gap-2 p-2">
        <Icon
          className={cn(
            "mt-0.5 size-3.5 shrink-0 text-muted-foreground",
            statusKind(activityStatus) === "active" && "animate-pulse text-blue-500",
          )}
        />
        <p className="min-w-0 flex-1 truncate font-medium text-foreground/90">{activity.label}</p>
        {activityStatus ? (
          <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
            {statusLabel(activityStatus)}
          </span>
        ) : null}
        {activity.detail ? (
          <ChevronDownIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        ) : null}
      </summary>
      {activity.detail ? (
        <p className="border-t border-border/40 px-7 py-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
          {activity.detail}
        </p>
      ) : null}
    </details>
  );
}

function DetailCard({
  entry,
  selectedAgentId,
  sessionLive,
}: {
  entry: WorkLogEntry;
  selectedAgentId: string | null;
  sessionLive: boolean;
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const presentation = entry.presentation;
  const status = reconcileTakomiLivenessStatus(
    presentation?.error?.message ?? presentation?.summary?.status ?? entry.toolLifecycleStatus,
    sessionLive,
  );
  const selectedAgentIndex = selectedAgentId?.match(/^result-(\d+)$/u)?.[1];
  const selectedItem =
    presentation?.summary?.items?.find((item) => item.id === selectedAgentId) ??
    (selectedAgentIndex === undefined
      ? undefined
      : presentation?.summary?.items?.[Number(selectedAgentIndex)]);
  const detailText = selectedAgentId
    ? selectedItem?.detail
    : (presentation?.inspectorDetailText ?? presentation?.detailText);
  const activity = selectedAgentId
    ? (presentation?.activity?.filter((item) => item.agentId === selectedAgentId) ?? [])
    : (presentation?.activity ?? []);
  const displayedItems = selectedItem
    ? [selectedItem]
    : selectedAgentId
      ? []
      : (presentation?.summary?.items ?? []);
  const isLive = statusKind(status) === "active";

  useLayoutEffect(() => {
    if (!isLive || !followLatestRef.current) return;
    const frame = requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [activity, activityOpen, detailText, isLive]);

  if (!presentation) return null;

  return (
    <div className="rounded-lg border border-border/65 bg-muted/20 p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium text-foreground">
            {selectedItem?.label ?? presentation.toolName}
          </p>
          {selectedItem?.detail ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
              {selectedItem.detail}
            </p>
          ) : presentation.action ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{presentation.action}</p>
          ) : null}
        </div>
        {status ? (
          <span className="shrink-0 rounded border border-border/60 bg-background/65 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {status}
          </span>
        ) : null}
      </div>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          const followsLatest = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
          followLatestRef.current = followsLatest;
          setShowJumpToLatest(isLive && !followsLatest);
        }}
        className="relative mt-2 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1"
      >
        {detailText && !selectedItem ? (
          <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground/85">
            {detailText}
          </p>
        ) : null}
        {activity.length ? (
          <div
            className={cn("border-t border-border/50 pt-2", detailText && !selectedItem && "mt-3")}
          >
            <button
              type="button"
              aria-expanded={activityOpen}
              onClick={() => setActivityOpen((open) => !open)}
              className="flex w-full items-center gap-2 rounded py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              {isLive ? "Live activity" : "Activity transcript"}
              <span className="rounded bg-muted px-1.5 py-0.5 font-normal tabular-nums">
                {activity.length}
                {presentation.activityTruncated ? " retained" : ""}
              </span>
              <ChevronDownIcon
                className={cn(
                  "ml-auto size-3.5 transition-transform",
                  !activityOpen && "-rotate-90",
                )}
              />
            </button>
            <div className="mt-1 space-y-1">
              {(activityOpen ? activity : activity.slice(-1)).map((item) => (
                <ActivityTranscriptRow key={item.id} activity={item} sessionLive={sessionLive} />
              ))}
            </div>
          </div>
        ) : null}
        {displayedItems.length ? (
          <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
            {displayedItems.map((item) => {
              const itemStatus = reconcileTakomiLivenessStatus(
                item.status ?? (presentation.toolName === "takomi_subagent" ? status : undefined),
                sessionLive,
              );
              return (
                <div key={item.id} className="flex items-start gap-2">
                  <StatusIcon status={itemStatus} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-foreground/90">{item.label}</p>
                    {item.detail ? (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                        {item.detail}
                      </p>
                    ) : null}
                  </div>
                  {itemStatus ? (
                    <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                      {statusLabel(itemStatus)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {presentation.artifactRefs?.length ? (
          <div className="mt-2 space-y-1 border-t border-border/50 pt-2 font-mono text-[11px] text-muted-foreground">
            {presentation.artifactRefs.map((artifact) => (
              <div key={`${artifact.kind}:${artifact.path}`} className="break-all">
                {artifact.label ?? artifact.path}
              </div>
            ))}
          </div>
        ) : null}
        {showJumpToLatest ? (
          <div className="sticky bottom-2 mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                const node = scrollRef.current;
                if (node) node.scrollTop = node.scrollHeight;
                followLatestRef.current = true;
                setShowJumpToLatest(false);
              }}
              className="rounded-full border border-border/70 bg-background px-3 py-1 text-[10px] font-medium text-foreground shadow-sm"
            >
              Jump to latest
            </button>
          </div>
        ) : null}
      </div>
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

function SubagentRunGroup(props: {
  entry: WorkLogEntry;
  selectedSelection: string | null;
  onSelect: (selection: string) => void;
  sessionLive: boolean;
}) {
  const presentation = props.entry.presentation!;
  const items = presentation.summary?.items?.length
    ? presentation.summary.items
    : ([
        {
          id: "result-0",
          label: presentation.summary?.taskId ?? "Subagent",
          detail: presentation.detailText,
        },
      ] as PresentationItem[]);
  const mode = presentation.summary?.mode ?? (items.length > 1 ? "parallel" : "single");
  const status = reconcileTakomiLivenessStatus(
    presentation.error?.severity === "error"
      ? "failed"
      : (presentation.summary?.status ?? props.entry.toolLifecycleStatus),
    props.sessionLive,
  );
  const [open, setOpen] = useState(() => statusKind(status) === "active");
  const toolCallId = props.entry.toolCallId ?? props.entry.id;
  const modeLabel =
    mode === "parallel"
      ? "Parallel run"
      : mode === "chain"
        ? "Chain run"
        : mode === "async"
          ? "Async run"
          : mode === "single"
            ? "Task"
            : `${statusLabel(mode)} run`;

  if (items.length === 1 && (mode === "single" || mode === "async")) {
    const item = items[0]!;
    const selection = subagentSelectionKey(toolCallId, subagentPresentationIdentity(item.id, 0));
    const itemStatus = reconcileTakomiLivenessStatus(item.status ?? status, props.sessionLive);
    return (
      <button
        type="button"
        aria-pressed={props.selectedSelection === selection}
        onClick={() => props.onSelect(selection)}
        className={cn(
          "flex w-full items-start gap-2 rounded-md border border-border/55 bg-background/35 px-3 py-2 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          props.selectedSelection === selection && "bg-accent/55",
        )}
      >
        <StatusIcon status={itemStatus} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-medium text-foreground/90">{item.label}</p>
            {mode === "async" ? (
              <span className="rounded border border-border/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                Async
              </span>
            ) : null}
          </div>
          {item.detail ? (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.detail}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
          {statusLabel(itemStatus)}
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border/55 bg-background/35">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <StatusIcon status={status} />
        <span className="min-w-0 flex-1 text-xs font-medium text-foreground/90">{modeLabel}</span>
        <span className="text-[10px] text-muted-foreground">
          {items.length} {items.length === 1 ? "agent" : "agents"}
        </span>
        <span className="text-[10px] capitalize text-muted-foreground">{statusLabel(status)}</span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-1 border-t border-border/45 p-1.5">
          {items.map((item, itemIndex) => {
            const agentId = subagentPresentationIdentity(item.id, itemIndex);
            const selection = subagentSelectionKey(toolCallId, agentId);
            const itemStatus = reconcileTakomiLivenessStatus(
              item.status ?? status,
              props.sessionLive,
            );
            return (
              <button
                type="button"
                key={`${item.id}:${agentId}`}
                aria-pressed={props.selectedSelection === selection}
                onClick={() => props.onSelect(selection)}
                className={cn(
                  "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                  props.selectedSelection === selection && "bg-accent/55",
                )}
              >
                <StatusIcon status={itemStatus} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-foreground/90">
                    {items.length > 1 ? `Task ${itemIndex + 1} · ${item.label}` : item.label}
                  </p>
                  {item.detail ? (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {item.detail}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                  {statusLabel(itemStatus)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function TakomiInspector(props: {
  entries: ReadonlyArray<WorkLogEntry>;
  selectedToolCallId: string | null;
  onSelectToolCallId: (toolCallId: string) => void;
  sessionLive: boolean;
}) {
  const [subagentsOpen, setSubagentsOpen] = useState(true);
  const inspectorSelection = parseInspectorSelection(props.selectedToolCallId);
  const { board, boardItems, subagents, selected } = useMemo(() => {
    const semantic = props.entries.filter((entry) => entry.presentation);
    const selected =
      semantic.find((entry) => (entry.toolCallId ?? entry.id) === inspectorSelection.toolCallId) ??
      null;
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
  }, [inspectorSelection.toolCallId, props.entries]);

  const completedCount = boardItems.filter((item) => statusKind(item.status) === "done").length;
  const activeItem = boardItems.find((item) => statusKind(item.status) === "active");
  const boardStatus = board?.presentation?.summary?.status;
  const subagentCount = subagents.reduce(
    (count, entry) => count + Math.max(1, entry.presentation?.summary?.items?.length ?? 0),
    0,
  );

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
          {subagentCount > 0 ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal tabular-nums">
              {subagents.length} {subagents.length === 1 ? "run" : "runs"} · {subagentCount} agents
            </span>
          ) : null}
          <ChevronDownIcon
            className={cn("ml-auto size-3.5 transition-transform", !subagentsOpen && "-rotate-90")}
          />
        </button>
        {subagentsOpen ? (
          <div className="mt-2 space-y-2 rounded-lg border border-border/65 bg-muted/20 p-3">
            {subagents.length > 0 ? (
              subagents.map((entry) => (
                <SubagentRunGroup
                  key={entry.presentation?.summary?.runId ?? entry.toolCallId ?? entry.id}
                  entry={entry}
                  selectedSelection={props.selectedToolCallId}
                  onSelect={props.onSelectToolCallId}
                  sessionLive={props.sessionLive}
                />
              ))
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
          <DetailCard
            key={`${selected.toolCallId ?? selected.id}:${inspectorSelection.agentId ?? "all"}`}
            entry={selected}
            selectedAgentId={inspectorSelection.agentId}
            sessionLive={props.sessionLive}
          />
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Select a board, subagent, or inline tool call to inspect its latest detail here.
          </p>
        )}
      </section>
    </aside>
  );
}
