import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

const OpaqueToken = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
const SafeLabel = TrimmedNonEmptyString.check(Schema.isMaxLength(160));
const PageLimit = PositiveInt.check(Schema.isLessThanOrEqualTo(50));

export const PiSessionCatalogInput = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  projectId: ProjectId,
  cursor: Schema.optional(OpaqueToken),
  limit: Schema.optional(PageLimit),
});
export type PiSessionCatalogInput = typeof PiSessionCatalogInput.Type;

export const PiSessionCatalogEntry = Schema.Struct({
  /** Random server-side handle; never a native id, filename, or path token. */
  id: OpaqueToken,
  name: SafeLabel,
  cwd: Schema.Literal("workspace"),
  createdAt: IsoDateTime,
  modifiedAt: IsoDateTime,
  model: Schema.optional(SafeLabel),
  thinking: Schema.optional(SafeLabel),
  entryCount: NonNegativeInt,
  entryCountExact: Schema.Boolean,
  parentSession: Schema.Boolean,
  formatVersion: Schema.Union([
    NonNegativeInt,
    Schema.Literal("legacy"),
    Schema.Literal("unknown"),
  ]),
  compatibility: Schema.Literals(["compatible", "legacy", "unknown", "malformed", "truncated"]),
  fidelity: Schema.Literals(["metadata-only", "metadata-truncated"]),
  activity: Schema.Literal("unobservable"),
  ownership: Schema.Literal("external-source"),
  source: Schema.Literal("pi-jsonl"),
});
export type PiSessionCatalogEntry = typeof PiSessionCatalogEntry.Type;

export const PiSessionCatalogPage = Schema.Struct({
  entries: Schema.Array(PiSessionCatalogEntry),
  nextCursor: Schema.optional(OpaqueToken),
  nextPageAvailable: Schema.Boolean,
  hardCapped: Schema.Boolean,
  hardCeiling: Schema.Literal(2_000),
  source: Schema.Literal("pi-documented-session-storage"),
});
export type PiSessionCatalogPage = typeof PiSessionCatalogPage.Type;

/**
 * Continue a terminal Pi session inside a fresh, empty T3 thread.
 *
 * `sessionHandle` is an opaque catalog handle: never a native id, filename,
 * or path token. The server resolves it against the bound workspace and
 * starts the thread's provider session from the resolved file, so the raw
 * session path never crosses the wire to the client.
 */
export const PiSessionAttachInput = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  projectId: ProjectId,
  threadId: ThreadId,
  sessionHandle: OpaqueToken,
});
export type PiSessionAttachInput = typeof PiSessionAttachInput.Type;

/**
 * Fork (clone) a terminal Pi session into a new session file, then continue
 * the fork inside a fresh, empty T3 thread. `maxRecords` keeps only the
 * first N records for point-split forks (fork-from-message uses
 * recordIndex + 1); omitted clones the whole file.
 */
export const PiSessionForkInput = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  projectId: ProjectId,
  threadId: ThreadId,
  sessionHandle: OpaqueToken,
  maxRecords: Schema.optional(NonNegativeInt),
});
export type PiSessionForkInput = typeof PiSessionForkInput.Type;

export const PiSessionContinueResult = Schema.Struct({
  mode: Schema.Literals(["attached", "forked"]),
  name: SafeLabel,
  modifiedAt: IsoDateTime,
  entryCount: NonNegativeInt,
  entryCountExact: Schema.Boolean,
  model: Schema.optional(SafeLabel),
  source: Schema.Literal("pi-jsonl"),
  /** Visible CLI messages backfilled into the thread. Absent when none qualified. */
  hydratedMessages: Schema.optional(NonNegativeInt),
});
export type PiSessionContinueResult = typeof PiSessionContinueResult.Type;

const PreviewLimit = PositiveInt.check(Schema.isLessThanOrEqualTo(500));

/** Read-only message preview for picking a point-split fork position. */
export const PiSessionMessagePreviewInput = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  projectId: ProjectId,
  sessionHandle: OpaqueToken,
  limit: Schema.optional(PreviewLimit),
});
export type PiSessionMessagePreviewInput = typeof PiSessionMessagePreviewInput.Type;

export const PiSessionMessagePreviewMessage = Schema.Struct({
  recordIndex: NonNegativeInt,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  createdAt: IsoDateTime,
});
export type PiSessionMessagePreviewMessage = typeof PiSessionMessagePreviewMessage.Type;

export const PiSessionMessagePreviewResult = Schema.Struct({
  messages: Schema.Array(PiSessionMessagePreviewMessage),
  truncated: Schema.Boolean,
  source: Schema.Literal("pi-jsonl"),
});
export type PiSessionMessagePreviewResult = typeof PiSessionMessagePreviewResult.Type;

/** Sync state for one continued thread. Thread-scoped: no project needed. */
export const PiSessionCheckUpdatesInput = Schema.Struct({
  threadId: ThreadId,
});
export type PiSessionCheckUpdatesInput = typeof PiSessionCheckUpdatesInput.Type;

export const PiSessionCheckUpdatesResult = Schema.Struct({
  /** False when the thread is not a continuable Pi thread (never an error). */
  available: Schema.Boolean,
  newMessages: NonNegativeInt,
  /**
   * Opaque change cookie (no paths). The banner dismisses per key, so a new
   * key after more CLI work brings it back.
   */
  updateKey: Schema.optional(TrimmedNonEmptyString),
  source: Schema.Literal("pi-jsonl"),
});
export type PiSessionCheckUpdatesResult = typeof PiSessionCheckUpdatesResult.Type;

export const PiSessionSyncUpdatesInput = Schema.Struct({
  threadId: ThreadId,
});
export type PiSessionSyncUpdatesInput = typeof PiSessionSyncUpdatesInput.Type;

export const PiSessionSyncUpdatesResult = Schema.Struct({
  added: NonNegativeInt,
  source: Schema.Literal("pi-jsonl"),
});
export type PiSessionSyncUpdatesResult = typeof PiSessionSyncUpdatesResult.Type;

export const PiChildSessionLeaseDiagnosticsInput = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  projectId: ProjectId,
});
export type PiChildSessionLeaseDiagnosticsInput = typeof PiChildSessionLeaseDiagnosticsInput.Type;

export const PiChildSessionLeaseDiagnostic = Schema.Struct({
  childSessionId: OpaqueToken,
  processGeneration: OpaqueToken,
  expiresAt: IsoDateTime,
  state: Schema.Literals(["active", "released", "reconciliation-required"]),
  ownership: Schema.Literals(["exclusive", "released", "unknown"]),
});
export type PiChildSessionLeaseDiagnostic = typeof PiChildSessionLeaseDiagnostic.Type;

export const PiChildSessionLeaseDiagnostics = Schema.Struct({
  leases: Schema.Array(PiChildSessionLeaseDiagnostic).check(Schema.isMaxLength(100)),
  truncated: Schema.Boolean,
  source: Schema.Literal("takomi-verified-cloned-children-only"),
});
export type PiChildSessionLeaseDiagnostics = typeof PiChildSessionLeaseDiagnostics.Type;

/** Errors intentionally omit filesystem paths and native session identifiers. */
export class PiSessionCatalogError extends Schema.TaggedError<PiSessionCatalogError>()(
  "PiSessionCatalogError",
  {
    reason: Schema.Literals([
      "unavailable",
      "invalid_cursor",
      "workspace_unavailable",
      "provider_unavailable",
      "deadline",
      "security_rejected",
    ]),
    message: SafeLabel,
  },
) {}
