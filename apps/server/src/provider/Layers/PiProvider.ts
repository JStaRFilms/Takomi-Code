import {
  type PiSettings,
  type ModelCapabilities,
  type ServerProviderModel,
  type ServerProviderCapabilities,
  ProviderDriverKind,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import {
  discoverPiProjectTrust,
  enrichPiDiscoveredResources,
  parsePiDiscoveredResources,
  type PiDiscoveredResources,
} from "./PiResources.ts";
import { PiJsonlDecoder } from "./PiProtocolConformance.ts";

import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const DRIVER_KIND = ProviderDriverKind.make("pi");

/** Declaration-probed RPC operations backing Pi's advertised model-switching capability. */
export const PI_ADVERTISED_RPC_OPERATIONS = [
  "get_available_models",
  "get_commands",
  "set_model",
  "set_thinking_level",
] as const;

const DEFAULT_PI_MODEL_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const decodeUnknownJsonString = Schema.decodeUnknownSync(UnknownFromJsonString);
const encodeUnknownJsonString = Schema.encodeUnknownSync(UnknownFromJsonString);

export const piSessionCatalogSupported = (version: string): boolean =>
  version === "0.84.4" || version === "0.85.1";

const piCapabilities = (resourcesAvailable: boolean, sessionCatalogAvailable: boolean) =>
  ({
    runtimeModes: ["full-access"],
    interactionModes: ["default"],
    modelSwitching: true,
    conversationRollback: false,
    commandDiscovery: resourcesAvailable ? "available" : "unavailable",
    skillDiscovery: resourcesAvailable ? "available" : "unavailable",
    workspaceSnapshotFreshness: true,
    sessions: {
      list: sessionCatalogAvailable,
      clone: sessionCatalogAvailable,
      attach: sessionCatalogAvailable,
    },
  }) satisfies ServerProviderCapabilities;

const piPresentation = (resourcesAvailable = false, sessionCatalogAvailable = false) => ({
  displayName: "Takomi",
  // Legacy clients read this field instead of interactionModes. Keep Plan
  // hidden there too because Pi rejects it.
  showInteractionModeToggle: false,
  capabilities: piCapabilities(resourcesAvailable, sessionCatalogAvailable),
});

export function piResourceDiscoveryMessage(resources: PiDiscoveredResources): string {
  switch (resources.projectTrust) {
    case "explicit-approved":
      return "Pi project resources were explicitly approved for this process.";
    case "explicit-rejected":
      return "Pi project resources were explicitly rejected for this process.";
    case "observed-project-resources":
      return "Pi reported project resources; the deciding extension, saved setting, or default is not observable over RPC.";
    case "configured-saved-approved-partial":
      return "Pi has a saved approving trust entry, but an extension may have overridden effective trust.";
    case "configured-saved-rejected-partial":
      return "Pi has a saved rejecting trust entry, but an extension may have overridden effective trust.";
    case "configured-default-always-partial":
      return "Pi is configured to trust projects by default, but an extension may have overridden effective trust.";
    case "configured-default-never-partial":
      return "Pi is configured to reject projects by default, but an extension may have overridden effective trust.";
    case "configured-default-ask-partial":
      return "Pi RPC cannot prompt for default project trust; extension decisions are not observable.";
    default:
      return "Pi project-trust state could not be determined from supported evidence.";
  }
}

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

const buildPiProvider = (
  input: Parameters<typeof buildServerProvider>[0],
): ServerProviderDraft => ({
  ...buildServerProvider(input),
  supportsConversationRollback: false,
});

function decodePiCommandsResponse(response: unknown): PiDiscoveredResources | undefined {
  if (
    !isRecord(response) ||
    response.command !== "get_commands" ||
    response.success !== true ||
    !isRecord(response.data)
  ) {
    return undefined;
  }
  return parsePiDiscoveredResources(response.data);
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

export const PI_RESOURCE_DISCOVERY_DEADLINE = Duration.seconds(15);
const MAX_PI_DISCOVERY_RECORDS = 512;

export type PiResourceDiscoveryResult =
  | { readonly status: "available"; readonly resources: PiDiscoveredResources }
  | { readonly status: "unavailable"; readonly reason: "deadline" | "failed" };

export function discoverPiResources(
  settings: PiSettings,
  cwd: string,
  env: Record<string, string | undefined>,
  options?: { readonly deadline?: Duration.Input },
): Effect.Effect<
  PiResourceDiscoveryResult,
  never,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> {
  const deadline = options?.deadline ?? PI_RESOURCE_DISCOVERY_DEADLINE;
  const deadlineMs = Duration.toMillis(deadline);
  // Reserve part of the one total budget for scoped process teardown instead
  // of starting teardown only after the advertised deadline has elapsed.
  const teardownBudgetMs = Math.min(1_000, Math.max(10, Math.floor(deadlineMs / 2)));
  const operationBudget = Duration.millis(Math.max(1, deadlineMs - teardownBudgetMs));
  const discovery = Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const processEnv = {
        ...env,
        ...(settings.homePath ? { PI_CODING_AGENT_DIR: settings.homePath } : {}),
      };
      const launchArgs = tokenizeCliArgs(settings.launchArgs);
      const args = [...launchArgs, "--mode", "rpc", "--no-session"];
      const spawnCommand = yield* resolveSpawnCommand(settings.binaryPath || "pi", args, {
        env: processEnv,
      });
      const child = yield* spawner.spawn(
        ChildProcess.make(spawnCommand.command, spawnCommand.args, {
          cwd,
          env: processEnv,
          forceKillAfter: Duration.millis(teardownBudgetMs),
          shell: spawnCommand.shell,
        }),
      );
      const input = yield* Queue.unbounded<Uint8Array>();
      yield* Effect.addFinalizer(() => Queue.shutdown(input));
      yield* Stream.run(Stream.fromQueue(input), child.stdin).pipe(Effect.forkScoped);
      yield* Queue.offer(
        input,
        new TextEncoder().encode(`${encodeUnknownJsonString({ type: "get_commands" })}\n`),
      );
      const decoder = new PiJsonlDecoder();
      const response = yield* child.stdout.pipe(
        Stream.flatMap((chunk) => Stream.fromIterable(decoder.push(chunk))),
        Stream.take(MAX_PI_DISCOVERY_RECORDS),
        Stream.filterMap((frame) => {
          const resources =
            frame.type === "record" ? decodePiCommandsResponse(frame.record) : undefined;
          return resources === undefined ? Result.failVoid : Result.succeed(resources);
        }),
        Stream.runHead,
      );
      if (Option.isNone(response)) return yield* Effect.fail("missing get_commands response");
      const resources = yield* enrichPiDiscoveredResources(response.value);
      const observedProjectResources = [
        ...resources.slashCommands.map((command) => command.sourceInfo?.scope),
        ...resources.skills.map((skill) => skill.scope),
      ].some((scope) => scope === "project");
      const projectTrust = yield* discoverPiProjectTrust({
        homePath: settings.homePath,
        cwd,
        environment: env,
        launchArgs,
        observedProjectResources,
      });
      return { ...resources, projectTrust };
    }),
  );
  return discovery.pipe(
    Effect.timeoutOption(operationBudget),
    Effect.map((result): PiResourceDiscoveryResult =>
      Option.isSome(result)
        ? { status: "available", resources: result.value }
        : { status: "unavailable", reason: "deadline" },
    ),
    Effect.orElseSucceed(() => ({ status: "unavailable", reason: "failed" }) as const),
  );
}

export function piMachineProbeLaunchArgs(launchArgs: string): ReadonlyArray<string> {
  const parsedArgs = tokenizeCliArgs(launchArgs);
  const separatorIndex = parsedArgs.indexOf("--");
  const optionArgs = (
    separatorIndex === -1 ? parsedArgs : parsedArgs.slice(0, separatorIndex)
  ).filter(
    (argument) =>
      argument !== "--approve" &&
      argument !== "-a" &&
      argument !== "--no-approve" &&
      argument !== "-na",
  );
  const positionalArgs = separatorIndex === -1 ? [] : parsedArgs.slice(separatorIndex);
  return ["--no-approve", ...optionArgs, "--mode", "rpc", "--no-session", ...positionalArgs];
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
      // Machine model probing must not execute project-local resources from the
      // server cwd. Remove user trust switches, then put the forced override
      // before even a possible `--` argument separator.
      const args = piMachineProbeLaunchArgs(settings.launchArgs);
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
    return buildPiProvider({
      driver: DRIVER_KIND,
      presentation: piPresentation(),
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
): Effect.Effect<
  ServerProviderDraft,
  never,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function* () {
    const now = yield* DateTime.now;
    const checkedAt = now.pipe(DateTime.formatIso);

    if (!settings.enabled) {
      return buildPiProvider({
        driver: DRIVER_KIND,
        presentation: piPresentation(),
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

      return buildPiProvider({
        driver: DRIVER_KIND,
        presentation: piPresentation(),
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

    return buildPiProvider({
      driver: DRIVER_KIND,
      // Resource catalogs are always cwd-scoped; the machine snapshot stays
      // project-neutral so a scoped failure cannot leak another cwd's paths.
      presentation: piPresentation(true, piSessionCatalogSupported(version)),
      enabled: true,
      checkedAt,
      models,
      slashCommands: [],
      skills: [],
      probe: {
        installed: true,
        version,
        status: "ready",
        auth: { status: "unknown" },
      },
    });
  });
}
