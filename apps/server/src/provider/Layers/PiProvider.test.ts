// @effect-diagnostics nodeBuiltinImport:off -- Resolves the checked-in subprocess fixture.
import * as NodeAssert from "node:assert/strict";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it } from "@effect/vitest";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import {
  discoverPiResources,
  makePendingPiProvider,
  piSessionCatalogSupported,
  piMachineProbeLaunchArgs,
  serverModelsFromPiModels,
} from "./PiProvider.ts";

const fixturePath = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../testFixtures/piMockPeer.mjs",
);

describe("Pi provider snapshot", () => {
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
        commandDiscovery: "unavailable",
        skillDiscovery: "unavailable",
        workspaceSnapshotFreshness: true,
        sessions: {
          list: false,
          clone: false,
          attach: false,
        },
      });
      NodeAssert.equal(provider.showInteractionModeToggle, false);
      NodeAssert.equal(provider.supportsConversationRollback, false);
      NodeAssert.equal(piSessionCatalogSupported("0.84.4"), true);
      NodeAssert.equal(piSessionCatalogSupported("0.84.5"), false);
    }),
  );
});

describe("Pi scoped resource probe", () => {
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
