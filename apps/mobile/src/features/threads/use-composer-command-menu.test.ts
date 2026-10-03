import { ServerProvider, ProviderDriverKind } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vite-plus/test";
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));

vi.mock("../../state/queries", () => ({
  useComposerPathSearch: () => ({ entries: [], isPending: false }),
  useComposerPullRequestSearch: () => ({ entries: [], isPending: false, error: null }),
}));
vi.mock("../../state/use-composer-drafts", () => ({
  getComposerDraftSnapshot: vi.fn(),
  setComposerDraftContext: vi.fn(),
}));
vi.mock("../../lib/uuid", () => ({ uuidv4: () => "context-id" }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { refreshProviders: Symbol("refreshProviders") },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => vi.fn(),
}));

import {
  buildComposerSlashCommandItems,
  composerSelectionAtEnd,
  resolveComposerCommandSelection,
  resolveComposerSlashCommands,
} from "./use-composer-command-menu";

const decodeServerProvider = Schema.decodeUnknownSync(ServerProvider);

describe("mobile slash commands", () => {
  const antigravity = {
    driver: ProviderDriverKind.make("antigravity"),
    showInteractionModeToggle: false,
    slashCommands: [{ name: "plan", description: "Plan with Antigravity" }],
  };

  it("resets a changed draft owner to the new draft end", () => {
    expect(composerSelectionAtEnd("queued task 🧪")).toEqual({ start: 14, end: 14 });
  });

  it("uses Pi workspace commands over its machine catalog", () => {
    const provider = decodeServerProvider({
      instanceId: "pi-default",
      driver: "pi",
      enabled: true,
      installed: true,
      version: "0.84.4",
      status: "ready",
      auth: { status: "unknown" },
      checkedAt: "2026-07-22T00:00:00.000Z",
      models: [],
      slashCommands: [{ name: "machine-command" }],
      skills: [],
      workspaceSnapshots: [
        {
          cwd: "/workspace/one",
          checkedAt: "2026-07-22T00:00:00.000Z",
          slashCommands: [{ name: "project-command" }],
          skills: [],
        },
      ],
    });

    expect(resolveComposerSlashCommands(provider, "/workspace/one")).toEqual([
      { name: "project-command" },
    ]);
    expect(resolveComposerSlashCommands(provider, "/workspace/two")).toEqual([
      { name: "machine-command" },
    ]);
  });

  it.each([false, true])(
    "keeps native /plan with legacy mode enabled=%s",
    (allowInteractionMode) => {
      const items = buildComposerSlashCommandItems({
        query: "pl",
        atMessageStart: true,
        hasThread: true,
        allowInteractionMode,
        selectedProviderStatus: antigravity,
      });

      expect(items).toHaveLength(1);
      expect(items[0]?.type).toBe("provider-slash-command");
      const item = items[0];
      if (!item) throw new Error("Expected the native plan command");
      expect(
        resolveComposerCommandSelection({
          draftMessage: "/pl",
          trigger: { rangeStart: 0, rangeEnd: 3 },
          item,
          allowInteractionMode,
        }),
      ).toEqual({ text: "/plan ", cursor: 6, interactionMode: null });
    },
  );

  it("does not offer a native command inside the message", () => {
    expect(
      buildComposerSlashCommandItems({
        query: "plan",
        atMessageStart: false,
        hasThread: false,
        allowInteractionMode: true,
        selectedProviderStatus: antigravity,
      }),
    ).toEqual([]);
  });

  it("still applies the T3 plan command for supported providers", () => {
    const items = buildComposerSlashCommandItems({
      query: "plan",
      atMessageStart: true,
      hasThread: true,
      allowInteractionMode: true,
      selectedProviderStatus: {
        driver: ProviderDriverKind.make("codex"),
        slashCommands: [],
      },
    });
    const item = items[0];
    if (!item) throw new Error("Expected the T3 plan command");
    expect(
      resolveComposerCommandSelection({
        draftMessage: "/plan",
        trigger: { rangeStart: 0, rangeEnd: 5 },
        item,
        allowInteractionMode: true,
      }),
    ).toEqual({ text: "", cursor: 0, interactionMode: "plan" });

    // A provider switch can invalidate an open menu before a tap arrives.
    expect(
      resolveComposerCommandSelection({
        draftMessage: "/plan",
        trigger: { rangeStart: 0, rangeEnd: 5 },
        item,
        allowInteractionMode: false,
      }),
    ).toEqual({ text: "/plan ", cursor: 6, interactionMode: null });
  });
});
