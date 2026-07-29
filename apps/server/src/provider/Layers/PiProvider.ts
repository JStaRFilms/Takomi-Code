import {
  type PiSettings,
  type ModelCapabilities,
  type ServerProviderModel,
  ProviderDriverKind,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const DRIVER_KIND = ProviderDriverKind.make("pi");

const DEFAULT_PI_MODEL_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const PI_PRESENTATION = {
  displayName: "Takomi",
  showInteractionModeToggle: true,
} as const;

const BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "pi-default",
    name: "Pi configured default",
    isCustom: false,
    capabilities: DEFAULT_PI_MODEL_CAPABILITIES,
  },
];

export function makePendingPiProvider(enabled = true): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const now = yield* DateTime.now;
    const checkedAt = now.pipe(DateTime.formatIso);
    return buildServerProvider({
      driver: DRIVER_KIND,
      presentation: PI_PRESENTATION,
      enabled,
      checkedAt,
      models: BUILT_IN_MODELS,
      probe: {
        installed: false,
        version: null,
        status: "ready",
        auth: { status: "unknown" },
      },
    });
  });
}

export function checkPiProviderStatus(
  settings: PiSettings,
  _cwd: string,
  env: Record<string, string | undefined>,
): Effect.Effect<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  return Effect.gen(function* () {
    const now = yield* DateTime.now;
    const checkedAt = now.pipe(DateTime.formatIso);

    if (!settings.enabled) {
      return buildServerProvider({
        driver: DRIVER_KIND,
        presentation: PI_PRESENTATION,
        enabled: false,
        checkedAt,
        models: BUILT_IN_MODELS,
        probe: {
          installed: false,
          version: null,
          status: "ready",
          auth: { status: "unknown" },
        },
      });
    }

    const binaryPath = settings.binaryPath || "pi";

    const spawnCommand = yield* resolveSpawnCommand(binaryPath, ["--version"], {
      env,
    });
    const command = ChildProcess.make(spawnCommand.command, spawnCommand.args, {
      env,
      shell: spawnCommand.shell,
    });

    const versionResult = yield* spawnAndCollect(binaryPath, command).pipe(Effect.exit);

    if (versionResult._tag === "Failure") {
      const isMissing = isCommandMissingCause(versionResult.cause);
      const detail = isMissing
        ? `Pi CLI binary '${binaryPath}' not found on PATH.`
        : `Failed to execute '${binaryPath} --version'.`;

      return buildServerProvider({
        driver: DRIVER_KIND,
        presentation: PI_PRESENTATION,
        enabled: true,
        checkedAt,
        models: BUILT_IN_MODELS,
        probe: {
          installed: false,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: detail,
        },
      });
    }

    const rawVersion = versionResult.value.stdout.trim() || versionResult.value.stderr.trim();
    const version = parseGenericCliVersion(rawVersion) ?? (rawVersion || "unknown");

    const models = providerModelsFromSettings(
      BUILT_IN_MODELS,
      settings.customModels,
      DEFAULT_PI_MODEL_CAPABILITIES,
    );

    return buildServerProvider({
      driver: DRIVER_KIND,
      presentation: PI_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version,
        status: "ready",
        auth: { status: "unknown" },
      },
    });
  });
}
