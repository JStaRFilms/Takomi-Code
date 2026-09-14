import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { PiSessionLifecycle, type PiLifecycleBinding } from "./PiSessionLifecycle.ts";

const identity = { device: "1", inode: "2", size: 10, modifiedMs: 20 };
const binding = (overrides: Partial<PiLifecycleBinding> = {}): PiLifecycleBinding => ({
  environmentId: "environment-a",
  providerInstanceId: ProviderInstanceId.make("pi-a"),
  projectId: ProjectId.make("project-a"),
  workspaceCanonicalPath: "/workspace/a",
  serverGeneration: "server-a:connection-a",
  expiresAt: 10_000,
  ...overrides,
});

function scan(count: number) {
  return {
    entries: Array.from({ length: count }, (_, index) => ({
      nativeSessionId: `native-${index}`,
      nativeFile: `/private/sessions/${index}.jsonl`,
      fileIdentity: { ...identity, inode: String(index + 1) },
      name: `Session ${index}`,
      createdAt: "2026-09-03T13:36:00.000Z",
      modifiedAt: "2026-09-03T13:36:00.000Z",
      entryCount: 1,
      entryCountExact: true,
      parentSession: false,
      formatVersion: 3 as const,
      compatibility: "compatible" as const,
      fidelity: "metadata-only" as const,
      activity: "unobservable" as const,
      ownership: "external-source" as const,
    })),
    hardCapped: false,
    hardCeiling: 2_000 as const,
    source: "pi-documented-session-storage" as const,
  };
}

describe("Pi server-lifetime session lifecycle", () => {
  it("reserves a session file for only one thread at a time", () => {
    const lifecycle = new PiSessionLifecycle();
    const release = lifecycle.reserveSessionFile("C:\\sessions\\one.jsonl", "thread-a");
    expect(() => lifecycle.reserveSessionFile("c:\\sessions\\one.jsonl", "thread-b")).toThrow();
    release();
    const releaseAgain = lifecycle.reserveSessionFile("C:\\sessions\\one.jsonl", "thread-b");
    releaseAgain();
  });

  it("pages every entry beyond 250 with random single-use cursors and no path disclosure", () => {
    const lifecycle = new PiSessionLifecycle();
    let page = lifecycle.createCatalogPage(scan(301), binding(), 50, 1);
    const ids = page.entries.map((entry) => entry.id);
    expect(JSON.stringify(page)).not.toContain("/private/");
    while (page.nextCursor !== undefined) {
      const cursor = page.nextCursor;
      page = lifecycle.nextCatalogPage(cursor, binding(), 50, 2);
      ids.push(...page.entries.map((entry) => entry.id));
      expect(() => lifecycle.nextCatalogPage(cursor, binding(), 50, 2)).toThrow();
    }
    expect(ids).toHaveLength(301);
    expect(new Set(ids).size).toBe(301);
    expect(page.nextPageAvailable).toBe(false);
    expect(page.hardCapped).toBe(false);
  });

  it("rejects cursor tampering and cross-environment/provider/workspace/generation replay", () => {
    for (const mismatch of [
      { environmentId: "environment-b" },
      { providerInstanceId: ProviderInstanceId.make("pi-b") },
      { projectId: ProjectId.make("project-b") },
      { workspaceCanonicalPath: "/workspace/b" },
      { serverGeneration: "server-b:connection-b" },
    ]) {
      const lifecycle = new PiSessionLifecycle();
      const first = lifecycle.createCatalogPage(scan(2), binding(), 1, 1);
      expect(() => lifecycle.nextCatalogPage(first.nextCursor!, binding(mismatch), 1, 2)).toThrow();
    }
    const lifecycle = new PiSessionLifecycle();
    expect(() => lifecycle.nextCatalogPage("tampered", binding(), 1, 2)).toThrow();
    const first = lifecycle.createCatalogPage(scan(2), binding(), 1, 1);
    const cursor = first.nextCursor!;
    lifecycle.nextCatalogPage(cursor, binding(), 1, 2);
    expect(() => lifecycle.nextCatalogPage(cursor, binding(), 1, 3)).toThrow();
  });

  it("invalidates the oldest stable snapshot when the bounded cache fills", () => {
    const lifecycle = new PiSessionLifecycle();
    const first = lifecycle.createCatalogPage(scan(2), binding(), 1, 1);
    for (let index = 0; index < 16; index += 1) {
      lifecycle.createCatalogPage(scan(1), binding(), 1, index + 2);
    }
    expect(() => lifecycle.nextCatalogPage(first.nextCursor!, binding(), 1, 20)).toThrow();
  });

  it("requires attested stable clone provenance and fences renewal/release by process generation", () => {
    const lifecycle = new PiSessionLifecycle();
    const page = lifecycle.createCatalogPage(scan(1), binding(), 1, 1);
    const provenance = lifecycle.attestVerifiedClone(
      {
        binding: binding(),
        sourceSessionHandle: page.entries[0]!.id,
        sourceIdentityBefore: { ...identity, inode: "1" },
        sourceIdentityAfter: { ...identity, inode: "1" },
        childNativeSessionId: "child-native",
        childNativeFile: "/private/children/child.jsonl",
        childFileIdentity: { ...identity, inode: "child" },
        childParentNativeSessionId: "native-0",
        processGeneration: "process-a",
      },
      2,
    );
    const handoff = lifecycle.attestVerifiedClone(
      {
        binding: binding(),
        sourceSessionHandle: page.entries[0]!.id,
        sourceIdentityBefore: { ...identity, inode: "1" },
        sourceIdentityAfter: { ...identity, inode: "1" },
        childNativeSessionId: "child-native",
        childNativeFile: "/private/children/child.jsonl",
        childFileIdentity: { ...identity, inode: "child" },
        childParentNativeSessionId: "native-0",
        processGeneration: "process-b",
      },
      2,
    );
    lifecycle.acquireCloneLease(provenance, binding(), "process-a", 3, 100);
    expect(lifecycle.diagnostics(binding(), 4).leases[0]?.ownership).toBe("exclusive");
    expect(() => lifecycle.renewCloneLease(provenance, "process-b", 4, 100)).toThrow();
    expect(() => lifecycle.renewCloneLease(handoff, "process-a", 4, 100)).toThrow();
    expect(() => lifecycle.releaseCloneLease(provenance, "process-b", true)).toThrow();
    lifecycle.processLost("process-a", 5);
    expect(lifecycle.diagnostics(binding(), 6).leases[0]).toMatchObject({
      state: "reconciliation-required",
      ownership: "unknown",
    });
    expect(() => lifecycle.acquireCloneLease(provenance, binding(), "process-b", 7, 100)).toThrow();
    lifecycle.releaseCloneLease(provenance, "process-a", true);
    lifecycle.acquireCloneLease(handoff, binding(), "process-b", 8, 100);
  });

  it("treats restart provenance as unknown until verified shutdown reconciliation", () => {
    const attestationSecret = new Uint8Array(32).fill(7);
    const first = new PiSessionLifecycle(attestationSecret);
    const page = first.createCatalogPage(scan(1), binding(), 1, 1);
    const provenance = first.attestVerifiedClone(
      {
        binding: binding(),
        sourceSessionHandle: page.entries[0]!.id,
        sourceIdentityBefore: { ...identity, inode: "1" },
        sourceIdentityAfter: { ...identity, inode: "1" },
        childNativeSessionId: "child-native",
        childNativeFile: "/private/children/child.jsonl",
        childFileIdentity: { ...identity, inode: "child" },
        childParentNativeSessionId: "native-0",
        processGeneration: "process-a",
      },
      2,
    );
    const restarted = new PiSessionLifecycle(attestationSecret);
    restarted.registerRestartCandidate(provenance, binding(), 3);
    const restartedBinding = binding({ serverGeneration: "server-b:connection-b" });
    expect(restarted.diagnostics(restartedBinding, 4).leases[0]?.ownership).toBe("unknown");
    restarted.releaseCloneLease(provenance, "process-a", true);
    expect(restarted.diagnostics(restartedBinding, 5).leases[0]?.ownership).toBe("released");

    const wrongSecret = new PiSessionLifecycle(new Uint8Array(32).fill(8));
    expect(() => wrongSecret.registerRestartCandidate(provenance, binding(), 4)).toThrow();
  });
});
