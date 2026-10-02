// @effect-diagnostics nodeBuiltinImport:off -- Resolves the checked-in subprocess fixture.
import * as NodeAssert from "node:assert/strict";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it } from "@effect/vitest";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { resolvePiLaunchResources } from "./PiLaunchResources.ts";
import {
  discoverPiResources,
  makePendingPiProvider,
  piSessionCatalogSupported,
  piSessionStatsSupported,
  piMachineProbeLaunchArgs,
  serverModelsFromPiModels,
} from "./PiProvider.ts";

const fixturePath = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../testFixtures/piMockPeer.mjs",
);

describe("Pi provider snapshot", () => {
  it("gates cumulative native stats on verified 0.99.1 semantics, independently of catalogs", () => {
    NodeAssert.equal(piSessionStatsSupported("0.99.1"), true);
    for (const version of [undefined, null, "unknown", "0.84.4", "0.85.1", "0.99.0", "0.99.2"])
      NodeAssert.equal(piSessionStatsSupported(version), false);
  });
  it("removes trust flags only before positional arguments", () => {
    NodeAssert.deepEqual(
      piMachineProbeLaunchArgs("--approve --extension global.ts -na -- --no-approve positional"),
      [
        "--no-approve",
        "--extension",
        "global.ts",
        "--mode",
        "rpc",
        "--no-session",
        "--",
        "--no-approve",
        "positional",
      ],
    );
  });

  it.effect("advertises only Pi runtime and rollback capabilities it enforces", () =>
    Effect.gen(function* () {
      const provider = yield* makePendingPiProvider();

      NodeAssert.deepEqual(provider.capabilities, {
        runtimeModes: ["full-access"],
        interactionModes: ["default"],
        modelSwitching: true,
        conversationRollback: false,
        extensionState: "text-v1",
        commandDiscovery: "unavailable",
        skillDiscovery: "unavailable",
        workspaceSnapshotFreshness: true,
        sessions: {
          list: false,
          clone: false,
          attach: false,
          stats: false,
        },
      });
      NodeAssert.equal(provider.showInteractionModeToggle, false);
      NodeAssert.equal(provider.supportsConversationRollback, false);
      NodeAssert.equal(piSessionCatalogSupported("0.84.4"), true);
      NodeAssert.equal(piSessionCatalogSupported("0.85.1"), true);
      NodeAssert.equal(piSessionCatalogSupported("0.87.1"), true);
      NodeAssert.equal(piSessionCatalogSupported("0.99.1"), true);
      NodeAssert.equal(piSessionCatalogSupported("0.99.0"), false);
      NodeAssert.equal(piSessionCatalogSupported("0.84.5"), false);
      NodeAssert.equal(piSessionCatalogSupported("0.85.0"), false);
      NodeAssert.equal(piSessionCatalogSupported("0.98.0"), false);
    }),
  );
});

describe("Pi scoped resource probe", () => {
  it.live("uses local Takomi extensions instead of duplicate global copies", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() =>
        NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pi-launch-")),
      );
      const cwd = NodePath.join(root, "project");
      const homePath = NodePath.join(root, "takomi-vault", "agent");
      try {
        yield* Effect.promise(async () => {
          await NodeFSP.mkdir(NodePath.join(cwd, ".pi", "prompts"), { recursive: true });
          await NodeFSP.mkdir(NodePath.join(homePath, "extensions", "takomi-runtime"), {
            recursive: true,
          });
          await NodeFSP.mkdir(NodePath.join(homePath, "extensions", "takomi-vault"), {
            recursive: true,
          });
          await NodeFSP.writeFile(
            NodePath.join(homePath, "extensions", "takomi-vault", "index.ts"),
            "",
          );
          await NodeFSP.writeFile(NodePath.join(homePath, "extensions", "takomi-vault.js"), "");
          await NodeFSP.writeFile(NodePath.join(homePath, "extensions", "takomi-vault.mts"), "");
          await NodeFSP.writeFile(NodePath.join(cwd, "package.json"), '{"name":"takomi"}');
          await NodeFSP.writeFile(
            NodePath.join(homePath, "extensions", "takomi-runtime", "index.ts"),
            "",
          );
          const packageDir = NodePath.join(homePath, "npm", "node_modules", "pi-web-ui");
          const vaultPackageDir = NodePath.join(homePath, "npm", "node_modules", "takomi-vault");
          await NodeFSP.mkdir(NodePath.join(packageDir, "extensions"), { recursive: true });
          await NodeFSP.mkdir(NodePath.join(vaultPackageDir, "extensions", "vault"), {
            recursive: true,
          });
          await NodeFSP.writeFile(
            NodePath.join(vaultPackageDir, "package.json"),
            '{"pi":{"extensions":["./extensions/vault"]}}',
          );
          await NodeFSP.writeFile(
            NodePath.join(vaultPackageDir, "extensions", "vault", "index.ts"),
            "",
          );
          await NodeFSP.writeFile(
            NodePath.join(packageDir, "package.json"),
            '{"pi":{"extensions":["./extensions"]}}',
          );
          await NodeFSP.writeFile(NodePath.join(packageDir, "extensions", "webui.ts"), "");
          await NodeFSP.writeFile(
            NodePath.join(homePath, "settings.json"),
            '{"extensions":["extensions/takomi-vault/index.ts","extensions/takomi-vault.js","extensions/takomi-vault.mts"],"packages":["npm:pi-web-ui","npm:takomi-vault"]}',
          );
          for (const name of [
            "takomi-runtime",
            "takomi-subagents",
            "oauth-router",
            "takomi-context-manager",
            "notify-sound",
            "antigravity-provider",
            "takomi-vault",
          ]) {
            const directory = NodePath.join(cwd, ".pi", "extensions", name);
            await NodeFSP.mkdir(directory, { recursive: true });
            await NodeFSP.writeFile(NodePath.join(directory, "index.ts"), "");
          }
        });
        const settings = {
          enabled: true,
          binaryPath: process.execPath,
          homePath,
          suiteRoot: "",
          launchArgs: `"${fixturePath}"`,
          customModels: [],
        };
        const resources = yield* resolvePiLaunchResources({
          settings,
          cwd,
          environment: process.env,
        });
        NodeAssert.deepEqual(resources.missingPaths, []);
        NodeAssert.equal(resources.args[0], "--no-extensions");
        NodeAssert.ok(
          resources.args.includes(
            NodePath.join(cwd, ".pi", "extensions", "takomi-runtime", "index.ts"),
          ),
        );
        NodeAssert.ok(
          !resources.args.includes(
            NodePath.join(homePath, "extensions", "takomi-runtime", "index.ts"),
          ),
        );
        const suiteVaultPath = NodePath.join(cwd, ".pi", "extensions", "takomi-vault", "index.ts");
        NodeAssert.equal(resources.args.filter((arg) => arg === suiteVaultPath).length, 1);
        NodeAssert.ok(
          !resources.args.includes(NodePath.join(homePath, "extensions", "takomi-vault.js")),
        );
        NodeAssert.ok(
          !resources.args.includes(NodePath.join(homePath, "extensions", "takomi-vault.mts")),
        );
        const isolatedHome = NodePath.join(root, "empty-agent");
        yield* Effect.promise(() => NodeFSP.mkdir(isolatedHome));
        const suiteOnly = yield* resolvePiLaunchResources({
          settings: { ...settings, homePath: isolatedHome, suiteRoot: cwd },
          cwd,
          environment: process.env,
        });
        NodeAssert.deepEqual(suiteOnly.missingPaths, []);
        NodeAssert.equal(suiteOnly.args.filter((arg) => arg === suiteVaultPath).length, 1);
        NodeAssert.ok(
          !resources.args.includes(
            NodePath.join(homePath, "extensions", "takomi-vault", "index.ts"),
          ),
        );
        NodeAssert.ok(
          !resources.args.includes(
            NodePath.join(
              homePath,
              "npm",
              "node_modules",
              "takomi-vault",
              "extensions",
              "vault",
              "index.ts",
            ),
          ),
        );
        NodeAssert.ok(
          resources.args.includes(
            NodePath.join(homePath, "npm", "node_modules", "pi-web-ui", "extensions", "webui.ts"),
          ),
        );
        NodeAssert.ok(
          !resources.args.includes(
            NodePath.join(homePath, "npm", "node_modules", "pi-web-ui", "extensions"),
          ),
        );
        const untrusted = yield* resolvePiLaunchResources({
          settings,
          cwd,
          environment: process.env,
          allowInferredSuite: false,
        });
        NodeAssert.deepEqual(untrusted.args, ["--no-extensions"]);
        const explicit = yield* resolvePiLaunchResources({
          settings: { ...settings, suiteRoot: cwd },
          cwd,
          environment: process.env,
        });
        NodeAssert.ok(explicit.args.includes(suiteVaultPath));
        const discovery = yield* discoverPiResources(settings, cwd, process.env);
        NodeAssert.equal(discovery.status, "available");
        yield* Effect.promise(() =>
          NodeFSP.rm(NodePath.join(cwd, ".pi", "extensions", "takomi-vault", "index.ts")),
        );
        const incomplete = yield* resolvePiLaunchResources({
          settings: { ...settings, suiteRoot: cwd },
          cwd,
          environment: process.env,
        });
        NodeAssert.deepEqual(incomplete.missingPaths, [suiteVaultPath]);
        const incompleteDiscovery = yield* discoverPiResources(
          { ...settings, suiteRoot: cwd },
          cwd,
          process.env,
        );
        NodeAssert.deepEqual(incompleteDiscovery, { status: "unavailable", reason: "failed" });
      } finally {
        yield* Effect.promise(() => NodeFSP.rm(root, { recursive: true, force: true }));
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("applies one deadline and tears down a non-responsive peer", () =>
    Effect.gen(function* () {
      const startedAt = yield* Clock.currentTimeMillis;
      const result = yield* discoverPiResources(
        {
          enabled: true,
          binaryPath: process.execPath,
          homePath: "",
          suiteRoot: "",
          launchArgs: `"${fixturePath}"`,
          customModels: [],
        },
        process.cwd(),
        { ...process.env, T3_PI_DISCOVERY_HANG: "1" },
        { deadline: "100 millis" },
      );
      NodeAssert.deepEqual(result, { status: "unavailable", reason: "deadline" });
      NodeAssert.ok((yield* Clock.currentTimeMillis) - startedAt < 2_000);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("serverModelsFromPiModels", () => {
  it("maps discovered Pi models and their thinking levels", () => {
    const models = serverModelsFromPiModels([
      {
        provider: "openai-codex",
        id: "gpt-5.4",
        name: "GPT-5.4",
        reasoning: true,
        thinkingLevelMap: { xhigh: "xhigh", max: null },
      },
      {
        provider: "lmstudio",
        id: "gemma",
        name: "Gemma",
        reasoning: false,
      },
    ]);

    NodeAssert.equal(models[0]?.slug, "openai-codex/gpt-5.4");
    NodeAssert.equal(models[0]?.subProvider, "openai-codex");
    const thinking = models[0]?.capabilities?.optionDescriptors?.[0];
    NodeAssert.deepEqual(
      thinking?.type === "select" ? thinking.options.map((option) => option.id) : [],
      ["off", "minimal", "low", "medium", "high", "xhigh"],
    );
    NodeAssert.deepEqual(models[1]?.capabilities?.optionDescriptors, []);
  });
});
