// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Server-lifetime opaque handles and lease fencing.
import * as NodeCrypto from "node:crypto";

import type {
  PiChildSessionLeaseDiagnostics,
  PiSessionCatalogEntry,
  PiSessionCatalogPage,
  ProjectId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import type {
  PiNativeSessionCatalogEntry,
  PiSessionCatalogScanResult,
  PiSessionFileIdentity,
} from "@t3tools/takomi-pi-host/sessionCatalog";

export const PI_CATALOG_GENERATION_TTL_MS = 30 * 60 * 1000;

export interface PiCatalogGeneration {
  readonly epoch: number;
  readonly expiresAt: number;
}

export function renewPiCatalogGeneration(
  generation: PiCatalogGeneration,
  now: number,
): PiCatalogGeneration {
  return generation.expiresAt > now
    ? generation
    : { epoch: generation.epoch + 1, expiresAt: now + PI_CATALOG_GENERATION_TTL_MS };
}

export interface PiLifecycleBinding {
  readonly environmentId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly projectId: ProjectId;
  readonly workspaceCanonicalPath: string;
  readonly serverGeneration: string;
  readonly expiresAt: number;
}

interface CatalogSnapshot {
  readonly binding: PiLifecycleBinding;
  readonly entries: ReadonlyArray<PiSessionCatalogEntry>;
  readonly handleIds: ReadonlyArray<string>;
  readonly hardCapped: boolean;
  readonly hardCeiling: 2_000;
}

interface CursorRecord {
  readonly snapshotId: string;
  readonly offset: number;
  readonly binding: PiLifecycleBinding;
}

export interface PiSessionHandleRecord {
  readonly binding: PiLifecycleBinding;
  readonly nativeSessionId: string;
  readonly nativeFile: string;
  readonly fileIdentity: PiSessionFileIdentity;
  /** Public catalog display captured at list time; safe to return to clients. */
  readonly display: PiSessionCatalogEntry;
}

export interface VerifiedPiClonedChildProvenance {
  readonly _tag: "VerifiedPiClonedChildProvenance";
  readonly binding: PiLifecycleBinding;
  readonly sourceSessionHandle: string;
  readonly childNativeSessionId: string;
  readonly childNativeFile: string;
  readonly childFileIdentity: PiSessionFileIdentity;
  readonly processGeneration: string;
  readonly attestation: string;
}

export interface PiCloneVerificationEvidence {
  readonly binding: PiLifecycleBinding;
  readonly sourceSessionHandle: string;
  readonly sourceIdentityBefore: PiSessionFileIdentity;
  readonly sourceIdentityAfter: PiSessionFileIdentity;
  readonly childNativeSessionId: string;
  readonly childNativeFile: string;
  readonly childFileIdentity: PiSessionFileIdentity;
  readonly childParentNativeSessionId: string;
  readonly processGeneration: string;
}

type LeaseState = "active" | "released" | "reconciliation-required";
interface LeaseRecord {
  readonly publicChildId: string;
  readonly provenance: VerifiedPiClonedChildProvenance;
  readonly processGeneration: string;
  expiresAt: number;
  state: LeaseState;
}

function sameBinding(left: PiLifecycleBinding, right: PiLifecycleBinding): boolean {
  return (
    left.environmentId === right.environmentId &&
    left.providerInstanceId === right.providerInstanceId &&
    left.projectId === right.projectId &&
    left.workspaceCanonicalPath === right.workspaceCanonicalPath &&
    left.serverGeneration === right.serverGeneration &&
    left.expiresAt === right.expiresAt
  );
}

function sameScope(left: PiLifecycleBinding, right: PiLifecycleBinding): boolean {
  return (
    left.environmentId === right.environmentId &&
    left.providerInstanceId === right.providerInstanceId &&
    left.projectId === right.projectId &&
    left.workspaceCanonicalPath === right.workspaceCanonicalPath
  );
}

function sameIdentity(left: PiSessionFileIdentity, right: PiSessionFileIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modifiedMs === right.modifiedMs
  );
}

function publicEntry(entry: PiNativeSessionCatalogEntry, id: string): PiSessionCatalogEntry {
  return {
    id,
    name: entry.name,
    cwd: "workspace",
    createdAt: entry.createdAt,
    modifiedAt: entry.modifiedAt,
    ...(entry.model ? { model: entry.model } : {}),
    ...(entry.thinking ? { thinking: entry.thinking } : {}),
    entryCount: entry.entryCount,
    entryCountExact: entry.entryCountExact,
    parentSession: entry.parentSession,
    formatVersion: entry.formatVersion,
    compatibility: entry.compatibility,
    fidelity: entry.fidelity,
    activity: "unobservable",
    ownership: "external-source",
    source: "pi-jsonl",
  };
}

function expiryIso(expiresAt: number): string {
  return new Date(expiresAt).toISOString();
}

/**
 * One instance is constructed by the server route layer and shared by all
 * websocket connections. Nothing in this service grants ownership of source
 * sessions; only cryptographically attested clone provenance can acquire a
 * child lease.
 */
export class PiSessionLifecycle {
  readonly serverGeneration = NodeCrypto.randomBytes(24).toString("base64url");
  readonly #secret: Buffer;
  constructor(attestationSecret: Uint8Array = NodeCrypto.randomBytes(32)) {
    this.#secret = Buffer.from(attestationSecret);
  }
  readonly #snapshots = new Map<string, CatalogSnapshot>();
  readonly #cursors = new Map<string, CursorRecord>();
  readonly #handles = new Map<string, PiSessionHandleRecord>();
  readonly #leases = new Map<string, LeaseRecord>();
  readonly #sessionFileReservations = new Map<string, string>();

  #randomHandle(): string {
    return NodeCrypto.randomBytes(24).toString("base64url");
  }

  #signature(value: object): string {
    return NodeCrypto.createHmac("sha256", this.#secret)
      .update(JSON.stringify(value))
      .digest("base64url");
  }

  #assertBinding(binding: PiLifecycleBinding, expected: PiLifecycleBinding, now: number): void {
    if (!sameBinding(binding, expected) || expected.expiresAt <= now) {
      throw new Error("Stale or mismatched Pi lifecycle handle.");
    }
  }

  #leaseKey(binding: PiLifecycleBinding, childNativeSessionId: string): string {
    return this.#signature({
      environmentId: binding.environmentId,
      providerInstanceId: binding.providerInstanceId,
      projectId: binding.projectId,
      workspaceCanonicalPath: binding.workspaceCanonicalPath,
      childNativeSessionId,
    });
  }

  #ensureLeaseCapacity(key: string): void {
    if (this.#leases.has(key) || this.#leases.size < 1_000) return;
    for (const [candidateKey, lease] of this.#leases) {
      if (lease.state === "released") this.#leases.delete(candidateKey);
      if (this.#leases.size < 1_000) return;
    }
    throw new Error("Pi cloned-child lease capacity reached.");
  }

  reserveSessionFile(file: string, threadId: string): () => void {
    const normalized = file.replaceAll("\\", "/");
    const key = /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
    const current = this.#sessionFileReservations.get(key);
    if (current !== undefined && current !== threadId) {
      throw new Error("Pi session file is already being continued by another thread.");
    }
    this.#sessionFileReservations.set(key, threadId);
    return () => {
      if (this.#sessionFileReservations.get(key) === threadId) {
        this.#sessionFileReservations.delete(key);
      }
    };
  }

  #deleteSnapshot(snapshotId: string): void {
    const snapshot = this.#snapshots.get(snapshotId);
    if (snapshot === undefined) return;
    this.#snapshots.delete(snapshotId);
    for (const handleId of snapshot.handleIds) this.#handles.delete(handleId);
    for (const [cursorId, cursor] of this.#cursors) {
      if (cursor.snapshotId === snapshotId) this.#cursors.delete(cursorId);
    }
  }

  #sweepCatalogState(now: number): void {
    for (const [id, snapshot] of this.#snapshots) {
      if (snapshot.binding.expiresAt <= now) this.#deleteSnapshot(id);
    }
    for (const [id, cursor] of this.#cursors) {
      if (cursor.binding.expiresAt <= now) this.#cursors.delete(id);
    }
    for (const [id, handle] of this.#handles) {
      if (handle.binding.expiresAt <= now) this.#handles.delete(id);
    }
  }

  createCatalogPage(
    scan: PiSessionCatalogScanResult,
    binding: PiLifecycleBinding,
    limit: number,
    now: number,
  ): PiSessionCatalogPage {
    this.#sweepCatalogState(now);
    if (binding.expiresAt <= now) throw new Error("Expired Pi catalog generation.");
    if (this.#snapshots.size >= 16) {
      const oldestSnapshotId = this.#snapshots.keys().next().value;
      if (oldestSnapshotId !== undefined) this.#deleteSnapshot(oldestSnapshotId);
    }
    const snapshotId = this.#randomHandle();
    const handleIds: Array<string> = [];
    const entries = scan.entries.map((entry) => {
      const id = this.#randomHandle();
      handleIds.push(id);
      const display = publicEntry(entry, id);
      this.#handles.set(id, {
        binding,
        nativeSessionId: entry.nativeSessionId,
        nativeFile: entry.nativeFile,
        fileIdentity: entry.fileIdentity,
        display,
      });
      return display;
    });
    this.#snapshots.set(snapshotId, {
      binding,
      entries,
      handleIds,
      hardCapped: scan.hardCapped,
      hardCeiling: scan.hardCeiling,
    });
    return this.#page(snapshotId, 0, binding, limit, now);
  }

  nextCatalogPage(
    cursor: string,
    binding: PiLifecycleBinding,
    limit: number,
    now: number,
  ): PiSessionCatalogPage {
    this.#sweepCatalogState(now);
    const record = this.#cursors.get(cursor);
    // Page cursors are single-use, preventing replay after a successful read.
    this.#cursors.delete(cursor);
    if (record === undefined) throw new Error("Unknown or replayed Pi catalog cursor.");
    this.#assertBinding(binding, record.binding, now);
    return this.#page(record.snapshotId, record.offset, binding, limit, now);
  }

  #page(
    snapshotId: string,
    offset: number,
    binding: PiLifecycleBinding,
    limit: number,
    now: number,
  ): PiSessionCatalogPage {
    const snapshot = this.#snapshots.get(snapshotId);
    if (snapshot === undefined) throw new Error("Stale Pi catalog snapshot.");
    this.#assertBinding(binding, snapshot.binding, now);
    const entries = snapshot.entries.slice(offset, offset + limit);
    const nextOffset = offset + entries.length;
    const nextPageAvailable = nextOffset < snapshot.entries.length;
    let nextCursor: string | undefined;
    if (nextPageAvailable) {
      nextCursor = this.#randomHandle();
      this.#cursors.set(nextCursor, { snapshotId, offset: nextOffset, binding });
    }
    return {
      entries,
      ...(nextCursor ? { nextCursor } : {}),
      nextPageAvailable,
      hardCapped: snapshot.hardCapped,
      hardCeiling: snapshot.hardCeiling,
      source: "pi-documented-session-storage",
    };
  }

  resolveSessionHandle(
    handle: string,
    binding: PiLifecycleBinding,
    now: number,
  ): PiSessionHandleRecord {
    this.#sweepCatalogState(now);
    const record = this.#handles.get(handle);
    if (record === undefined) throw new Error("Unknown Pi session handle.");
    this.#assertBinding(binding, record.binding, now);
    return record;
  }

  attestVerifiedClone(
    evidence: PiCloneVerificationEvidence,
    now: number,
  ): VerifiedPiClonedChildProvenance {
    const source = this.resolveSessionHandle(evidence.sourceSessionHandle, evidence.binding, now);
    if (
      !sameIdentity(source.fileIdentity, evidence.sourceIdentityBefore) ||
      !sameIdentity(evidence.sourceIdentityBefore, evidence.sourceIdentityAfter) ||
      evidence.sourceIdentityBefore.inode === "0" ||
      evidence.childFileIdentity.inode === "0" ||
      sameIdentity(evidence.sourceIdentityAfter, evidence.childFileIdentity) ||
      evidence.childParentNativeSessionId !== source.nativeSessionId ||
      evidence.childNativeSessionId === source.nativeSessionId ||
      evidence.childNativeSessionId.length === 0 ||
      Buffer.byteLength(evidence.childNativeSessionId) > 512 ||
      evidence.childNativeFile.length === 0 ||
      Buffer.byteLength(evidence.childNativeFile) > 32_768 ||
      evidence.processGeneration.length === 0 ||
      Buffer.byteLength(evidence.processGeneration) > 128
    ) {
      throw new Error("Clone provenance could not be verified.");
    }
    const unsigned = {
      _tag: "VerifiedPiClonedChildProvenance" as const,
      binding: evidence.binding,
      sourceSessionHandle: evidence.sourceSessionHandle,
      childNativeSessionId: evidence.childNativeSessionId,
      childNativeFile: evidence.childNativeFile,
      childFileIdentity: evidence.childFileIdentity,
      processGeneration: evidence.processGeneration,
    };
    return { ...unsigned, attestation: this.#signature(unsigned) };
  }

  #verifyAttestation(provenance: VerifiedPiClonedChildProvenance): void {
    const { attestation, ...unsigned } = provenance;
    const expected = this.#signature(unsigned);
    const valid =
      attestation.length === expected.length &&
      NodeCrypto.timingSafeEqual(Buffer.from(attestation), Buffer.from(expected));
    if (!valid) throw new Error("Invalid cloned-child provenance attestation.");
  }

  #verifyProvenance(
    provenance: VerifiedPiClonedChildProvenance,
    binding: PiLifecycleBinding,
    now: number,
  ): void {
    this.#verifyAttestation(provenance);
    this.#assertBinding(binding, provenance.binding, now);
  }

  acquireCloneLease(
    provenance: VerifiedPiClonedChildProvenance,
    binding: PiLifecycleBinding,
    processGeneration: string,
    now: number,
    ttlMs: number,
  ): void {
    this.#verifyProvenance(provenance, binding, now);
    if (provenance.processGeneration !== processGeneration)
      throw new Error("Process generation mismatch.");
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 300_000)
      throw new Error("Invalid cloned-child lease TTL.");
    const key = this.#leaseKey(binding, provenance.childNativeSessionId);
    const current = this.#leases.get(key);
    if (current?.state === "active" && current.expiresAt <= now) {
      current.state = "reconciliation-required";
    }
    if (current !== undefined && current.state !== "released") {
      throw new Error("Cloned child requires release or reconciliation.");
    }
    this.#ensureLeaseCapacity(key);
    this.#leases.set(key, {
      publicChildId: current?.publicChildId ?? this.#randomHandle(),
      provenance,
      processGeneration,
      expiresAt: now + ttlMs,
      state: "active",
    });
  }

  renewCloneLease(
    provenance: VerifiedPiClonedChildProvenance,
    processGeneration: string,
    now: number,
    ttlMs: number,
  ): void {
    this.#verifyAttestation(provenance);
    if (
      provenance.processGeneration !== processGeneration ||
      !Number.isSafeInteger(ttlMs) ||
      ttlMs <= 0 ||
      ttlMs > 300_000
    ) {
      throw new Error("Cloned-child lease generation is stale.");
    }
    const key = this.#leaseKey(provenance.binding, provenance.childNativeSessionId);
    const lease = this.#leases.get(key);
    if (
      lease?.state !== "active" ||
      lease.processGeneration !== processGeneration ||
      lease.expiresAt <= now
    ) {
      throw new Error("Cloned-child lease generation is stale.");
    }
    lease.expiresAt = now + ttlMs;
  }

  releaseCloneLease(
    provenance: VerifiedPiClonedChildProvenance,
    processGeneration: string,
    shutdownVerified: boolean,
  ): void {
    this.#verifyAttestation(provenance);
    if (provenance.processGeneration !== processGeneration)
      throw new Error("Cloned-child lease generation is stale.");
    const key = this.#leaseKey(provenance.binding, provenance.childNativeSessionId);
    const lease = this.#leases.get(key);
    if (lease?.processGeneration !== processGeneration)
      throw new Error("Cloned-child lease generation is stale.");
    lease.state = shutdownVerified ? "released" : "reconciliation-required";
  }

  processLost(processGeneration: string, now: number): void {
    for (const lease of this.#leases.values()) {
      if (lease.processGeneration === processGeneration && lease.state === "active") {
        lease.expiresAt = now;
        lease.state = "reconciliation-required";
      }
    }
  }

  registerRestartCandidate(
    provenance: VerifiedPiClonedChildProvenance,
    binding: PiLifecycleBinding,
    now: number,
  ): void {
    this.#verifyAttestation(provenance);
    if (!sameScope(provenance.binding, binding) || binding.expiresAt <= now) {
      throw new Error("Restarted cloned-child provenance scope mismatch.");
    }
    const key = this.#leaseKey(binding, provenance.childNativeSessionId);
    const current = this.#leases.get(key);
    if (current !== undefined && current.state !== "released") {
      throw new Error("Cloned child already requires reconciliation.");
    }
    this.#ensureLeaseCapacity(key);
    this.#leases.set(key, {
      publicChildId: current?.publicChildId ?? this.#randomHandle(),
      provenance,
      processGeneration: provenance.processGeneration,
      expiresAt: now,
      state: "reconciliation-required",
    });
  }

  diagnostics(binding: PiLifecycleBinding, now: number): PiChildSessionLeaseDiagnostics {
    const leases = [...this.#leases.values()].flatMap((lease) => {
      if (!sameScope(lease.provenance.binding, binding)) return [];
      if (lease.state === "active" && lease.expiresAt <= now)
        lease.state = "reconciliation-required";
      return [
        {
          childSessionId: lease.publicChildId,
          processGeneration: lease.processGeneration,
          expiresAt: expiryIso(lease.expiresAt),
          state: lease.state,
          ownership:
            lease.state === "active"
              ? ("exclusive" as const)
              : lease.state === "released"
                ? ("released" as const)
                : ("unknown" as const),
        },
      ];
    });
    return {
      leases: leases.slice(0, 100),
      truncated: leases.length > 100,
      source: "takomi-verified-cloned-children-only",
    };
  }
}
