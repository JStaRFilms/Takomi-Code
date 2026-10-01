import {
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type ScopedThreadRef,
  type OrchestrationSession,
} from "@t3tools/contracts";
import type { ThreadExtensionState } from "./state/providerExtensionState.ts";
import type { SupervisorConnectionState } from "./connection/model.ts";

export interface EditorSuggestion {
  readonly scope: string;
  readonly id: string;
  readonly text: string;
  readonly blocked: string | null;
  readonly connectionGeneration: number;
}

export function currentEditorSuggestion(
  ref: ScopedThreadRef,
  state: ThreadExtensionState,
  owner: Pick<OrchestrationSession, "providerInstanceId" | "status"> | null,
  connection: SupervisorConnectionState | null,
): EditorSuggestion | null {
  const snapshot = state.snapshot;
  if (
    !connection?.desired ||
    connection.phase !== "connected" ||
    connection.network === "offline" ||
    !owner?.providerInstanceId ||
    owner.status === "stopped" ||
    owner.status === "error" ||
    owner.status === "interrupted" ||
    state.status !== "current" ||
    !snapshot?.active ||
    snapshot.threadId !== ref.threadId ||
    snapshot.providerInstanceId !== owner.providerInstanceId ||
    !snapshot.generation ||
    !snapshot.editorSuggestion
  )
    return null;
  return {
    scope: JSON.stringify([ref.environmentId, ref.threadId]),
    id: JSON.stringify([
      ref.environmentId,
      ref.threadId,
      snapshot.providerInstanceId,
      snapshot.generation,
      snapshot.editorSuggestion.id,
    ]),
    text: snapshot.editorSuggestion.text,
    connectionGeneration: connection.generation,
    blocked:
      snapshot.truncated || snapshot.overflow
        ? "Native extension text was truncated or omitted. This suggestion cannot be applied safely."
        : snapshot.editorSuggestion.text.length > PROVIDER_SEND_TURN_MAX_INPUT_CHARS
          ? "This suggestion exceeds the composer text limit. Copy the full text from details and shorten it yourself."
          : null,
  };
}

/** One current dismissal per thread, with a bounded device-local working set. No server writes. */
export class EditorSuggestionDismissals {
  private readonly entries = new Map<string, { id: string; text: string; dismissed: boolean }>();

  isDismissed(suggestion: EditorSuggestion): boolean {
    const previous = this.entries.get(suggestion.scope);
    if (previous?.id === suggestion.id && previous.text === suggestion.text)
      return previous.dismissed;
    this.entries.delete(suggestion.scope);
    this.entries.set(suggestion.scope, {
      id: suggestion.id,
      text: suggestion.text,
      dismissed: false,
    });
    if (this.entries.size > 64) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return false;
  }

  dismiss(suggestion: EditorSuggestion): void {
    this.isDismissed(suggestion);
    this.entries.set(suggestion.scope, {
      id: suggestion.id,
      text: suggestion.text,
      dismissed: true,
    });
  }
}

export const localEditorSuggestionDismissals = new EditorSuggestionDismissals();
export interface EditorSuggestionOffer extends EditorSuggestion {
  readonly sourceRevision: number;
}
export type EditorSuggestionAction = "replace" | "insert" | "append";
export interface EditorSuggestionDraft {
  readonly revision: number;
  readonly text: string;
  readonly selection: { readonly start: number; readonly end: number } | null;
  readonly editorRevision: number;
}
export interface EditorSuggestionIntent {
  readonly source: EditorSuggestion;
  readonly sourceRevision: number;
  readonly draft: EditorSuggestionDraft;
  readonly action: EditorSuggestionAction;
  readonly text: string;
  readonly cursor: number;
  readonly blocked: string | null;
}

/** All reads and the text-only write run in the same JS turn. A refreshed review never writes. */
export class EditorSuggestionActions {
  private sourceRevision = 0;
  private source: EditorSuggestion | null = null;
  private readonly binding: {
    readonly readSource: () => EditorSuggestion | null;
    readonly readDraft: () => EditorSuggestionDraft | null;
    readonly writeText: (text: string, cursor: number) => void;
  };
  private readonly dismissals: EditorSuggestionDismissals;
  constructor(
    binding: EditorSuggestionActions["binding"],
    dismissals = localEditorSuggestionDismissals,
  ) {
    this.binding = binding;
    this.dismissals = dismissals;
  }

  // Subscriptions call this too, fencing an away-and-back source/connection transition.
  observeSource(): EditorSuggestion | null {
    const next = this.binding.readSource();
    if (
      next?.id !== this.source?.id ||
      next?.text !== this.source?.text ||
      next?.blocked !== this.source?.blocked ||
      next?.connectionGeneration !== this.source?.connectionGeneration
    )
      this.sourceRevision++;
    this.source = next;
    if (next) this.dismissals.isDismissed(next);
    return next;
  }

  offer(): EditorSuggestionOffer | null {
    const source = this.observeSource();
    return source && !this.dismissals.isDismissed(source)
      ? { ...source, sourceRevision: this.sourceRevision }
      : null;
  }

  request(action: EditorSuggestionAction): EditorSuggestionIntent | null {
    const source = this.offer();
    const draft = this.binding.readDraft();
    if (!source || !draft) return null;
    const range = draft.selection;
    if (
      action === "insert" &&
      (!range || range.start < 0 || range.end < range.start || range.end > draft.text.length)
    )
      return null;
    const start =
      action === "replace" ? 0 : action === "append" ? draft.text.length : (range?.start ?? 0);
    const end =
      action === "replace"
        ? draft.text.length
        : action === "append"
          ? draft.text.length
          : (range?.end ?? 0);
    const text = draft.text.slice(0, start) + source.text + draft.text.slice(end);
    return {
      source,
      sourceRevision: this.sourceRevision,
      draft,
      action,
      text,
      cursor: start + source.text.length,
      blocked:
        source.blocked ??
        (text.length > PROVIDER_SEND_TURN_MAX_INPUT_CHARS
          ? "The resulting draft exceeds the composer text limit. Nothing was changed."
          : null),
    };
  }

  apply(
    intent: EditorSuggestionIntent,
  ):
    | { readonly status: "applied" | "stale" }
    | { readonly status: "refresh"; readonly intent: EditorSuggestionIntent } {
    const source = this.offer();
    if (
      !source ||
      source.id !== intent.source.id ||
      source.text !== intent.source.text ||
      this.sourceRevision !== intent.sourceRevision
    )
      return { status: "stale" };
    const current = this.binding.readDraft();
    if (!current) return { status: "stale" };
    if (
      current.revision !== intent.draft.revision ||
      current.editorRevision !== intent.draft.editorRevision ||
      current.text !== intent.draft.text ||
      current.selection?.start !== intent.draft.selection?.start ||
      current.selection?.end !== intent.draft.selection?.end
    ) {
      const refreshed = this.request(intent.action);
      return refreshed ? { status: "refresh", intent: refreshed } : { status: "stale" };
    }
    if (intent.blocked || source.blocked) return { status: "refresh", intent };
    this.binding.writeText(intent.text, intent.cursor);
    this.dismissals.dismiss(source);
    return { status: "applied" };
  }

  dismiss(expected: EditorSuggestionOffer): boolean {
    const source = this.offer();
    if (
      !source ||
      source.id !== expected.id ||
      source.text !== expected.text ||
      source.sourceRevision !== expected.sourceRevision
    )
      return false;
    this.dismissals.dismiss(source);
    return true;
  }
}
