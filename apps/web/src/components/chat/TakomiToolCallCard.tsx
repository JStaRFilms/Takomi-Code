import { type ToolPresentationEnvelope } from "@t3tools/contracts";
import {
  BoxesIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  FileTextIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";

import { workEntryIndicatesToolFailure, type WorkLogEntry } from "../../session-logic";
import { cn } from "~/lib/utils";

const TOOL_DESCRIPTORS = {
  takomi_mode: { label: "Mode", family: "status" },
  takomi_apply_routing_policy: { label: "Routing policy", family: "configuration" },
  takomi_config_routing: { label: "Routing configuration", family: "configuration" },
  takomi_workflow: { label: "Workflow", family: "lifecycle" },
  takomi_board: { label: "Board", family: "lifecycle" },
  takomi_subagent: { label: "Subagents", family: "execution" },
  skill_index: { label: "Skills", family: "collection" },
  skill_manifest: { label: "Skill manifest", family: "collection" },
  skill_load: { label: "Load skill", family: "collection" },
  policy_manifest: { label: "Policy manifest", family: "collection" },
  policy_load: { label: "Load policy", family: "collection" },
  context_report: { label: "Context report", family: "report" },
  todo: { label: "Todo progress", family: "lifecycle" },
} as const;

function descriptorFor(toolName: string, family: ToolPresentationEnvelope["family"]) {
  const descriptor = TOOL_DESCRIPTORS[toolName as keyof typeof TOOL_DESCRIPTORS];
  if (descriptor) return descriptor;
  return toolName.startsWith("takomi_flow_")
    ? { label: toolName.replace(/^takomi_flow_/u, "TakomiFlow ").replaceAll("_", " "), family }
    : { label: toolName, family };
}

function FamilyIcon({ family }: { family: NonNullable<WorkLogEntry["presentation"]>["family"] }) {
  const className = "size-3.5 shrink-0";
  if (family === "lifecycle") return <ClipboardListIcon className={className} />;
  if (family === "execution") return <UsersIcon className={className} />;
  if (family === "configuration") return <Settings2Icon className={className} />;
  if (family === "artifact") return <FileTextIcon className={className} />;
  return <BoxesIcon className={className} />;
}

export function isTakomiPresentation(entry: WorkLogEntry): boolean {
  return (
    entry.presentation?.namespace === "takomi" || entry.presentation?.namespace === "takomi-flow"
  );
}

export function TakomiToolCallCard(props: {
  entry: WorkLogEntry;
  expanded: boolean;
  onToggle: () => void;
  onSelectInspector: () => void;
}) {
  const presentation = props.entry.presentation;
  if (!presentation) return null;
  const descriptor = descriptorFor(presentation.toolName, presentation.family);
  const failed =
    workEntryIndicatesToolFailure(props.entry) || presentation.error?.severity === "error";
  const status =
    presentation.error?.message ?? presentation.summary?.status ?? props.entry.toolLifecycleStatus;
  const count = presentation.summary?.total
    ? `${presentation.summary.completed ?? 0}/${presentation.summary.total}`
    : presentation.summary?.count;

  return (
    <article
      className={cn(
        "rounded-md border border-border/55 bg-muted/15 text-[12px]",
        failed && "border-destructive/35",
      )}
      data-takomi-tool-call={presentation.toolName}
    >
      <button
        type="button"
        aria-expanded={props.expanded}
        onClick={props.onToggle}
        className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      >
        <FamilyIcon family={presentation.family} />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
          {descriptor.label}
        </span>
        {count !== undefined ? <span className="text-muted-foreground">{count}</span> : null}
        {status ? (
          <span
            className={cn("max-w-36 truncate text-muted-foreground", failed && "text-destructive")}
          >
            {status}
          </span>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-150",
            props.expanded && "rotate-180",
          )}
        />
      </button>
      {props.expanded ? (
        <div className="border-t border-border/45 px-2.5 py-2">
          {presentation.detailText ? (
            <p className="whitespace-pre-wrap text-muted-foreground">{presentation.detailText}</p>
          ) : null}
          {presentation.summary?.items?.length ? (
            <div
              className={cn(
                "max-h-60 space-y-1 overflow-y-auto pr-1",
                presentation.detailText && "mt-2",
              )}
            >
              {presentation.summary.items.map((item) => (
                <div key={item.id} className="flex gap-2 text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.status ? <span className="shrink-0">{item.status}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          {presentation.artifactRefs?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {presentation.artifactRefs.map((artifact) => (
                <span
                  key={`${artifact.kind}:${artifact.path}`}
                  className="max-w-full truncate rounded border border-border/55 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                >
                  {artifact.label ?? artifact.path}
                </span>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              props.onSelectInspector();
            }}
            className="mt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            Open in inspector
          </button>
        </div>
      ) : null}
    </article>
  );
}
