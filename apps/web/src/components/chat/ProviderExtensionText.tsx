import { useAtomValue } from "@effect/atom-react";
import type { ExtensionTextEntry } from "@t3tools/client-runtime/state/providerExtensionState";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { memo } from "react";
import { environmentExtensionState } from "../../state/providerExtensionState";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";

function TextDisclosure({ entry }: { readonly entry: ExtensionTextEntry }) {
  return (
    <details className="min-w-0 text-xs text-muted-foreground">
      <summary className="cursor-pointer truncate py-1">
        <span className="font-medium">{entry.key}</span> <span>{entry.text.split("\n", 1)[0]}</span>
      </summary>
      <p className="whitespace-pre-wrap break-all font-medium">{entry.key}</p>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words py-2 font-mono text-xs text-foreground">
        {entry.text}
      </pre>
    </details>
  );
}

export const ProviderExtensionText = memo(function ProviderExtensionText(props: {
  readonly threadRef: ScopedThreadRef;
  readonly section: "statuses" | "aboveEditor" | "belowEditor";
}) {
  const presentation = useAtomValue(environmentExtensionState.presentationAtom(props.threadRef));
  const entries = presentation[props.section];
  const showNotice = props.section === "statuses";
  if (entries.length === 0 && !(showNotice && (presentation.notice || presentation.omitted)))
    return null;
  return (
    <section
      data-chat-composer-collapsed-controls="true"
      aria-label={`Extension ${props.section}`}
      className="min-w-0 px-3 sm:px-4"
    >
      {showNotice && presentation.notice ? (
        <p className="text-xs text-muted-foreground">{presentation.notice}</p>
      ) : null}
      {showNotice && presentation.omitted ? (
        <p className="text-xs text-muted-foreground">
          Some extension text was truncated or omitted.
        </p>
      ) : null}
      <div className="max-h-24 overflow-y-auto">
        {entries.map((entry) => (
          <TextDisclosure key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
});

export const ProviderExtensionSubtitle = memo(function ProviderExtensionSubtitle(props: {
  readonly threadRef: ScopedThreadRef;
}) {
  const presentation = useAtomValue(environmentExtensionState.presentationAtom(props.threadRef));
  if (!presentation.subtitle) return null;
  return (
    <div className="min-w-0" aria-label="Runtime subtitle">
      <Popover key={presentation.subtitle.id}>
        <PopoverTrigger
          className="max-w-full"
          render={<Button variant="ghost-muted" size="micro" />}
          aria-label="Read runtime subtitle"
        >
          <span className="min-w-0 truncate">
            {presentation.notice ? "Last known runtime" : "Runtime"}:{" "}
            {presentation.subtitle.text.split("\n", 1)[0]}
          </span>
        </PopoverTrigger>
        <PopoverPopup width="lg" padding="compact">
          <PopoverTitle>Runtime subtitle</PopoverTitle>
          {presentation.notice ? (
            <p className="text-xs text-muted-foreground">{presentation.notice}</p>
          ) : null}
          {presentation.omitted ? (
            <p className="text-xs text-muted-foreground">
              Some extension text was truncated or omitted.
            </p>
          ) : null}
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words py-2 font-mono text-xs">
            {presentation.subtitle.text}
          </pre>
        </PopoverPopup>
      </Popover>
    </div>
  );
});
