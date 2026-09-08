import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
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
export class PiSessionCatalogError extends Schema.TaggedErrorClass<PiSessionCatalogError>()(
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
