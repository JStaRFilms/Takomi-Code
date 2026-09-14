import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildPiContinueThreadTitle,
  buildPiSyncBannerId,
  canReleasePiSession,
  describePiContinueError,
  isPiModelSelection,
  isPiSessionContinuable,
  resolvePiContinueTarget,
  shouldCheckPiSessionUpdates,
} from "./piContinue.logic";

function provider(input: {
  provider: ProviderDriverKind;
  instanceId: string;
  enabled?: boolean;
  capabilities?: ServerProvider["capabilities"];
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: input.provider,
    enabled: input.enabled ?? true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [
      {
        slug: "pi-default",
        name: "Pi default",
        isDefault: true,
        isCustom: false,
        capabilities: {},
      },
    ],
    slashCommands: [],
    skills: [],
    ...(input.capabilities ? { capabilities: input.capabilities } : {}),
  };
}

const capable = (instanceId = "pi", attach = true, clone = true) =>
  provider({
    provider: ProviderDriverKind.make("pi"),
    instanceId,
    capabilities: { sessions: { list: true, attach, clone } },
  });

describe("resolvePiContinueTarget", () => {
  it("resolves the default Pi instance with its default model", () => {
    const target = resolvePiContinueTarget([capable()]);
    expect(target?.providerInstanceId).toBe("pi");
    expect(target?.modelSelection).toEqual({ instanceId: "pi", model: "pi-default" });
    expect(target?.canFork).toBe(true);
  });

  it("hides the flow when no Pi instance is capable", () => {
    expect(resolvePiContinueTarget([])).toBeNull();
    expect(resolvePiContinueTarget([capable("pi", false, false)])).toBeNull();
    expect(
      resolvePiContinueTarget([
        provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex" }),
      ]),
    ).toBeNull();
  });

  it("prefers the default instance but falls back to any capable one", () => {
    const custom = capable("pi_custom", true, false);
    expect(resolvePiContinueTarget([custom])?.providerInstanceId).toBe("pi_custom");
    expect(resolvePiContinueTarget([custom])?.canFork).toBe(false);
  });

  it("ignores disabled Pi instances", () => {
    expect(resolvePiContinueTarget([{ ...capable(), enabled: false }])).toBeNull();
  });
});

describe("isPiModelSelection", () => {
  it("matches only Pi-routed selections", () => {
    const providers = [
      capable(),
      provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex" }),
    ];
    expect(
      isPiModelSelection(providers, { instanceId: ProviderInstanceId.make("pi"), model: "x" }),
    ).toBe(true);
    expect(
      isPiModelSelection(providers, { instanceId: ProviderInstanceId.make("codex"), model: "x" }),
    ).toBe(false);
    expect(isPiModelSelection(providers, null)).toBe(false);
  });
});

describe("canReleasePiSession", () => {
  it("allows release only for live Pi sessions", () => {
    expect(canReleasePiSession({ isPiThread: true, sessionStatus: "ready" })).toBe(true);
    expect(canReleasePiSession({ isPiThread: true, sessionStatus: "running" })).toBe(true);
    expect(canReleasePiSession({ isPiThread: true, sessionStatus: "stopped" })).toBe(false);
    expect(canReleasePiSession({ isPiThread: true, sessionStatus: null })).toBe(false);
    expect(canReleasePiSession({ isPiThread: false, sessionStatus: "ready" })).toBe(false);
  });
});

describe("buildPiContinueThreadTitle", () => {
  it("prefixes the session name and caps length", () => {
    expect(buildPiContinueThreadTitle("Big refactor", "attached")).toBe("Continue: Big refactor");
    expect(buildPiContinueThreadTitle("Big refactor", "forked")).toBe("Fork: Big refactor");
    expect(buildPiContinueThreadTitle("x".repeat(200), "attached")).toHaveLength(120);
    expect(buildPiContinueThreadTitle("", "attached")).toBe("Continue: CLI session");
  });
});

describe("describePiContinueError", () => {
  it("passes server messages through with a fallback", () => {
    expect(describePiContinueError(new Error("stale handle"), "fallback")).toBe("stale handle");
    expect(describePiContinueError(null, "fallback")).toBe("fallback");
  });
});

describe("continued-thread sync helpers", () => {
  it("checks any server-backed Pi session, even without hydrated history", () => {
    expect(shouldCheckPiSessionUpdates({ isPiThread: true, hasSession: true })).toBe(true);
    expect(shouldCheckPiSessionUpdates({ isPiThread: true, hasSession: false })).toBe(false);
    expect(shouldCheckPiSessionUpdates({ isPiThread: false, hasSession: true })).toBe(false);
  });

  it("keys banners per change", () => {
    expect(buildPiSyncBannerId("thread-a", "3:12")).toBe("pi-sync:thread-a:3:12");
  });
});

describe("isPiSessionContinuable", () => {
  it("allows scanned v3 and prefix-read v3 sessions, blocks the rest", () => {
    expect(isPiSessionContinuable({ compatibility: "compatible", formatVersion: 3 })).toBe(true);
    expect(isPiSessionContinuable({ compatibility: "truncated", formatVersion: 3 })).toBe(true);
    expect(isPiSessionContinuable({ compatibility: "truncated", formatVersion: "legacy" })).toBe(
      false,
    );
    expect(isPiSessionContinuable({ compatibility: "legacy", formatVersion: "legacy" })).toBe(
      false,
    );
    expect(isPiSessionContinuable({ compatibility: "malformed", formatVersion: 3 })).toBe(false);
    expect(isPiSessionContinuable({ compatibility: "unknown", formatVersion: "unknown" })).toBe(
      false,
    );
  });
});
