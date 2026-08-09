import {
  type PiSettings,
  type ModelCapabilities,
  type ServerProviderModel,
  ProviderDriverKind,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";
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

const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const decodeUnknownJsonString = Schema.decodeUnknownSync(UnknownFromJsonString);
const encodeUnknownJsonString = Schema.encodeUnknownSync(UnknownFromJsonString);

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

const PI_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

type PiThinkingLevel = (typeof PI_THINKING_LEVELS)[number];

interface PiModelRecord {
  readonly provider: string;
  readonly id: string;
  readonly name: string;
  readonly reasoning: boolean;
  readonly thinkingLevelMap?: Readonly<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function decodePiModelsResponse(line: string): ReadonlyArray<PiModelRecord> | undefined {
  try {
    const response = decodeUnknownJsonString(line);
    if (
      !isRecord(response) ||
      response.command !== "get_available_models" ||
      response.success !== true
    ) {
      return undefined;
    }
    const data = response.data;
    if (!isRecord(data) || !Array.isArray(data.models)) return undefined;
    return data.models.flatMap((value): ReadonlyArray<PiModelRecord> => {
      if (!isRecord(value)) return [];
      const provider = readString(value.provider);
      const id = readString(value.id);
      if (!provider || !id) return [];
      return [
        {
          provider,
          id,
          name: readString(value.name) ?? id,
          reasoning: value.reasoning === true,
          ...(isRecord(value.thinkingLevelMap) ? { thinkingLevelMap: value.thinkingLevelMap } : {}),
        },
      ];
    });
  } catch {
    return undefined;
  }
}

function supportedThinkingLevels(model: PiModelRecord): ReadonlyArray<PiThinkingLevel> {
  if (!model.reasoning) return ["off"];
  const map = model.thinkingLevelMap;
  return PI_THINKING_LEVELS.filter((level) => {
    if (!map || !(level in map)) return level !== "xhigh" && level !== "max";
    return map[level] !== null;
  });
}

export function serverModelsFromPiModels(
  models: ReadonlyArray<PiModelRecord>,
): ReadonlyArray<ServerProviderModel> {
  return models.map((model) => {
    const levels = supportedThinkingLevels(model);
    return {
      slug: `${model.provider}/${model.id}`,
      name: model.name,
      subProvider: model.provider,
      isCustom: false,
      capabilities: createModelCapabilities({
        optionDescriptors:
          levels.length > 1
            ? [
                {
                  id: "reasoningEffort",
                  label: "Thinking",
                  type: "select",
                  options: levels.map((level) => ({
                    id: level,
                    label:
                      level === "xhigh" ? "Extra high" : level[0]!.toUpperCase() + level.slice(1),
                    isDefault: level === "medium",
                  })),
                },
              ]
            : [],
      }),
    };
  });
}

function discoverPiModels(
  settings: PiSettings,
  cwd: string,
  env: Record<string, string | undefined>,
): Effect.Effect<
  ReadonlyArray<ServerProviderModel>,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> {
  return Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const processEnv = {
        ...env,
        ...(settings.homePath ? { PI_CODING_AGENT_DIR: settings.homePath } : {}),
      };
      const args = [...tokenizeCliArgs(settings.launchArgs), "--mode", "rpc", "--no-session"];
      const spawnCommand = yield* resolveSpawnCommand(settings.binaryPath || "pi", args, {
        env: processEnv,
      });
      const child = yield* spawner.spawn(
        ChildProcess.make(spawnCommand.command, spawnCommand.args, {
          cwd,
          env: processEnv,
          shell: spawnCommand.shell,
        }),
      );
      const input = yield* Queue.unbounded<Uint8Array>();
      yield* Effect.addFinalizer(() => Queue.shutdown(input));
      yield* Stream.run(Stream.fromQueue(input), child.stdin).pipe(Effect.forkScoped);
      yield* Queue.offer(
        input,
        new TextEncoder().encode(`${encodeUnknownJsonString({ type: "get_available_models" })}\n`),
      );
      const response = yield* child.stdout.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.map(decodePiModelsResponse),
        Stream.filter((models): models is ReadonlyArray<PiModelRecord> => models !== undefined),
        Stream.runHead,
        Effect.timeout(Duration.seconds(15)),
      );
      if (Option.isNone(response)) return [];
      return serverModelsFromPiModels(response.value);
    }),
  ).pipe(Effect.orElseSucceed(() => []));
}

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
  cwd: string,
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

    const discoveredModels = yield* discoverPiModels(settings, cwd, env);
    const models = providerModelsFromSettings(
      [...BUILT_IN_MODELS, ...discoveredModels],
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
