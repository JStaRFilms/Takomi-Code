import { useMemo } from "react";

import type { WorkLogEntry } from "../../session-logic";

function takomiToolName(entry: WorkLogEntry): string | null {
  const item = entry.structuredPayload;
  if (item?.type === "dynamic_tool") return item.toolName ?? null;
  if (item?.type === "todo_list" || item?.type === "subagent") return item.type;
  return null;
}

export function isTakomiInspectorEntry(entry: WorkLogEntry): boolean {
  const toolName = takomiToolName(entry);
  return (
    toolName !== null &&
    /(?:takomi|todo|subagent|board|workflow)/iu.test(toolName) &&
    !/vault|secret/iu.test(toolName)
  );
}

export function reconcileTakomiLivenessStatus(
  status: string | undefined,
  sessionLive: boolean,
): string | undefined {
  return !sessionLive && /running|active|progress|executing|working/iu.test(status ?? "")
    ? "interrupted"
    : status;
}

/** Native Pi tools remain ordinary V2 tool items; this panel displays their persisted, non-secret details. */
export function TakomiInspector({
  entries,
  selectedToolCallId,
  sessionLive,
  onSelectToolCallId,
}: {
  entries: ReadonlyArray<WorkLogEntry>;
  selectedToolCallId: string | null;
  sessionLive: boolean;
  onSelectToolCallId: (id: string | null) => void;
}) {
  const tools = useMemo(() => entries.filter(isTakomiInspectorEntry), [entries]);
  const selected =
    tools.find((entry) => (entry.toolCallId ?? entry.id) === selectedToolCallId) ?? tools.at(-1);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Takomi activity">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">Takomi activity</h2>
      {tools.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No Takomi activity in this thread.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <nav aria-label="Takomi tools" className="border-b p-2">
            {tools.map((entry) => {
              const id = entry.toolCallId ?? entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-current={selected === entry ? "true" : undefined}
                  className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-muted aria-current:bg-muted"
                  onClick={() => onSelectToolCallId(id)}
                >
                  {entry.label}
                </button>
              );
            })}
          </nav>
          {selected ? (
            <div className="space-y-3 p-4 text-sm">
              <h3 className="font-medium">{selected.label}</h3>
              <p className="text-muted-foreground">
                {reconcileTakomiLivenessStatus(selected.toolLifecycleStatus, sessionLive) ??
                  "Recorded"}
              </p>
              {selected.detail ? <p className="whitespace-pre-wrap">{selected.detail}</p> : null}
              {selected.toolData ? (
                <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(selected.toolData, null, 2)?.slice(0, 20_000)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
