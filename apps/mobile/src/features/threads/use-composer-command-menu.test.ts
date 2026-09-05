import { ServerProvider } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../state/queries", () => ({
  useComposerPathSearch: () => ({ entries: [], isPending: false }),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { refreshProviders: Symbol("refreshProviders") },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => vi.fn(),
}));

import { composerSelectionAtEnd, resolveComposerSlashCommands } from "./use-composer-command-menu";

const decodeServerProvider = Schema.decodeUnknownSync(ServerProvider);

describe("composerSelectionAtEnd", () => {
  it("resets a changed draft owner to the new draft end", () => {
    expect(composerSelectionAtEnd("queued task 🧪")).toEqual({ start: 14, end: 14 });
  });
});

describe("resolveComposerSlashCommands", () => {
  it("uses the selected provider and exact project cwd snapshot", () => {
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
});
