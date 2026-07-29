import { ChevronDownIcon, ClipboardListIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { type WorkLogEntry } from "../../session-logic";
import { cn } from "~/lib/utils";

function InspectorEntry({ entry }: { entry: WorkLogEntry }) {
  const presentation = entry.presentation;
  if (!presentation) return null;
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{presentation.toolName}</span>
        {presentation.summary?.status ? (
          <span className="shrink-0 text-muted-foreground">{presentation.summary.status}</span>
        ) : null}
      </div>
      {presentation.detailText ? (
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{presentation.detailText}</p>
      ) : null}
      {presentation.summary?.items?.length ? (
        <div className="mt-2 space-y-1 border-t border-border/50 pt-2 text-muted-foreground">
          {presentation.summary.items.map((item) => (
            <div key={item.id} className="flex gap-2">
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.status ? <span>{item.status}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {presentation.artifactRefs?.length ? (
        <div className="mt-2 border-t border-border/50 pt-2 font-mono text-[11px] text-muted-foreground">
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

export function TakomiInspector(props: {
  entries: ReadonlyArray<WorkLogEntry>;
  selectedToolCallId: string | null;
}) {
  const [subagentsOpen, setSubagentsOpen] = useState(true);
  const { board, subagents, selected } = useMemo(() => {
    const semantic = props.entries.filter((entry) => entry.presentation);
    const selected =
      semantic.find((entry) => entry.toolCallId === props.selectedToolCallId) ?? null;
    return {
      board:
        [...semantic].reverse().find((entry) => entry.presentation?.toolName === "takomi_board") ??
        null,
      subagents:
        [...semantic]
          .reverse()
          .find((entry) => entry.presentation?.toolName === "takomi_subagent") ?? null,
      selected,
    };
  }, [props.entries, props.selectedToolCallId]);

  return (
    <aside
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      aria-label="Takomi inspector"
    >
      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ClipboardListIcon className="size-3.5" /> Board progress
        </div>
        {board ? (
          <InspectorEntry entry={board} />
        ) : (
          <p className="text-xs text-muted-foreground">No board activity in this thread.</p>
        )}
      </section>
      <section className="border-t border-border/60 pt-3">
        <button
          type="button"
          aria-expanded={subagentsOpen}
          onClick={() => setSubagentsOpen((open) => !open)}
          className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          <UsersIcon className="size-3.5" /> Subagents
          <ChevronDownIcon
            className={cn("ml-auto size-3.5 transition-transform", !subagentsOpen && "-rotate-90")}
          />
        </button>
        {subagentsOpen ? (
          <div className="mt-2">
            {subagents ? (
              <InspectorEntry entry={subagents} />
            ) : (
              <p className="text-xs text-muted-foreground">No subagent activity.</p>
            )}
          </div>
        ) : null}
      </section>
      {selected && selected !== board && selected !== subagents ? (
        <section className="border-t border-border/60 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Selected tool call
          </p>
          <InspectorEntry entry={selected} />
        </section>
      ) : null}
    </aside>
  );
}
