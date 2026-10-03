import type {
  ModelSelection,
  PiSessionCatalogEntry,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";

import {
  deriveProviderInstanceEntries,
  getDefaultProviderInstanceModel,
} from "../../providerInstances";

/**
 * A Pi provider instance that can continue CLI sessions, plus the model a
 * continued thread must start with (the server refuses instances that do
 * not match the thread's own model selection).
 */
export interface PiContinueTarget {
  readonly providerInstanceId: ProviderInstanceId;
  readonly modelSelection: ModelSelection;
  readonly displayName: string;
  readonly canFork: boolean;
}

/**
 * Resolve the Pi instance behind "Continue Pi session" for one environment's
 * provider snapshots. Returns null when nothing can continue (hidden UI),
 * so callers never offer a flow the server would refuse for capability
 * reasons. The default instance wins; any capable Pi instance is better
 * than none.
 */
export function resolvePiContinueTarget(
  providers: ReadonlyArray<ServerProvider>,
): PiContinueTarget | null {
  const piEntries = deriveProviderInstanceEntries(providers).filter(
    (entry) => entry.driverKind === "pi" && entry.enabled && entry.isAvailable,
  );
  const capable = piEntries.filter(
    (entry) => entry.snapshot.capabilities?.sessions?.attach === true,
  );
  const entry =
    capable.find((candidate) => candidate.isDefault) ??
    capable[0] ??
    piEntries.find((candidate) => candidate.isDefault) ??
    piEntries[0];
  if (!entry) return null;
  if (entry.snapshot.capabilities?.sessions?.attach !== true) return null;
  const model = getDefaultProviderInstanceModel(providers, entry.instanceId);
  if (!model) return null;
  return {
    providerInstanceId: entry.instanceId,
    modelSelection: { instanceId: entry.instanceId, model },
    displayName: entry.displayName,
    canFork: entry.snapshot.capabilities?.sessions?.clone === true,
  };
}

/** True when a model selection routes to a Pi instance in this environment. */
export function isPiModelSelection(
  providers: ReadonlyArray<ServerProvider>,
  selection: ModelSelection | null | undefined,
): boolean {
  if (!selection) return false;
  return deriveProviderInstanceEntries(providers).some(
    (entry) => entry.instanceId === selection.instanceId && entry.driverKind === "pi",
  );
}

/**
 * Whether "Release Pi session" makes sense for a thread: it runs on Pi and
 * currently holds a live provider session. Releasing stops that session so
 * the same file is safe to open in a terminal; the next T3 message
 * re-attaches and picks up whatever the CLI appended.
 */
export function canReleasePiSession(input: {
  readonly isPiThread: boolean;
  readonly sessionStatus: string | null | undefined;
}): boolean {
  return (
    input.isPiThread &&
    input.sessionStatus !== null &&
    input.sessionStatus !== undefined &&
    input.sessionStatus !== "stopped"
  );
}

/** Thread title for a continued session, kept short enough for title limits. */
export function buildPiContinueThreadTitle(
  sessionName: string,
  mode: "attached" | "forked",
): string {
  const compact = sessionName.replaceAll(/[\r\n\t]+/g, " ").trim() || "CLI session";
  const title = `${mode === "forked" ? "Fork" : "Continue"}: ${compact}`;
  return title.length > 120 ? `${title.slice(0, 119).trimEnd()}…` : title;
}

/** Server attach/fork errors are already user-safe; pass them through. */
export function describePiContinueError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== "" ? error.message : fallback;
}

/** Check the active Pi session even when initial history had no visible text. */
export function shouldCheckPiSessionUpdates(input: {
  readonly isPiThread: boolean;
  readonly hasSession: boolean;
}): boolean {
  return input.isPiThread && input.hasSession;
}

/** Stable banner id per thread and change cookie; a new key re-shows after dismiss. */
export function buildPiSyncBannerId(threadId: string, updateKey: string): string {
  return `pi-sync:${threadId}:${updateKey}`;
}

/**
 * Whether a catalog entry can be continued. Fully-scanned v3 sessions always
 * qualify; large sessions the catalog could only prefix-read ("truncated")
 * still qualify when their header proves version 3 — attach re-verifies the
 * header and file identity itself, so a partial entry count is no blocker.
 * Anything else (legacy, malformed, unknown) stays disabled.
 */
export function isPiSessionContinuable(
  entry: Pick<PiSessionCatalogEntry, "compatibility" | "formatVersion">,
): boolean {
  if (entry.compatibility === "compatible") return true;
  return entry.compatibility === "truncated" && entry.formatVersion === 3;
}
