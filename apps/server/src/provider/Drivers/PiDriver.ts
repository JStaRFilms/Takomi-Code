/**
 * PiDriver — v1 `ProviderDriver` for the Pi coding agent, composing the
 * orchestrator-v2 adapter (`PiAdapterV2`), the snapshot/probe layer
 * (`PiProvider`), and Pi-backed text generation.
 *
 * Pi state (sessions, settings, extensions, auth) lives in the user's own
 * `~/.pi/agent`, so continuation identity uses the default instance grouping.
 */
import {
  PI_PROVIDER_IDENTITY,
  PiSettings,
  ProviderDriverKind,
  type ServerProvider,
} from "@t3tools/contracts";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as PlatformError from "effect/PlatformError";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  PI_T3_MCP_EXTENSION_FILENAME,
  T3_PI_RUNTIME_MODE_ENV,
} from "../../orchestration-v2/Adapters/piT3McpExtensionSource.ts";
import { resolvePiLaunchArgs } from "../../orchestration-v2/Adapters/piT3McpInjection.ts";
import { discoverPiProjectTrust } from "../Layers/PiResources.ts";
import { resolvePiLaunchResources } from "../Layers/PiLaunchResources.ts";
import { withPiBuiltinSlashCommands } from "../PiCommands.ts";

import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import * as ServerConfig from "../../config.ts";
import * as ServerSettings from "../../serverSettings.ts";
import { makePiTextGeneration } from "../../textGeneration/PiTextGeneration.ts";
import {
  PiAdapterV2Driver,
  type PiAdapterV2DriverEnv,
} from "../../orchestration-v2/Adapters/PiAdapterV2.ts";
import { ProviderDriverError } from "../Errors.ts";
import {
  buildInitialPiProviderSnapshot,
  checkPiProviderStatus,
  discoverPiResources,
  enrichPiSnapshot,
} from "../Layers/PiProvider.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import type { ServerProviderDraft } from "../providerSnapshot.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import {
  makeCachedProviderMaintenanceResolution,
  makePackageManagedProviderMaintenanceResolver,
  resolveProviderMaintenanceCapabilitiesEffect,
} from "../providerMaintenance.ts";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "../providerUpdateSettings.ts";

const decodePiSettings = Schema.decodeSync(PiSettings);

const DRIVER_KIND = ProviderDriverKind.make(PI_PROVIDER_IDENTITY.driverKind);
export const PI_WORKSPACE_RESOURCE_TTL = Duration.minutes(5);
const UPDATE = makePackageManagedProviderMaintenanceResolver({
  provider: DRIVER_KIND,
  npmPackageName: "@earendil-works/pi-coding-agent",
  nativeUpdate: null,
});

export type PiDriverEnv =
  | PiAdapterV2DriverEnv
  | BackgroundPolicy.BackgroundPolicy
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path
  | ServerConfig.ServerConfig
  | ServerSettings.ServerSettingsService;

const withInstanceIdentity =
  (input: {
    readonly instanceId: ProviderInstance["instanceId"];
    readonly displayName: string | undefined;
    readonly accentColor: string | undefined;
    readonly continuationGroupKey: string;
  }) =>
  (snapshot: ServerProviderDraft): ServerProvider => ({
    ...snapshot,
    instanceId: input.instanceId,
    driver: DRIVER_KIND,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    continuation: { groupKey: input.continuationGroupKey },
  });

export const PiDriver: ProviderDriver<PiSettings, PiDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: PI_PROVIDER_IDENTITY.displayName,
    supportsMultipleInstances: true,
  },
  configSchema: PiSettings,
  defaultConfig: (): PiSettings => decodePiSettings({}),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fileSystem = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;
      const httpClient = yield* HttpClient.HttpClient;
      const { cwd } = yield* ServerConfig.ServerConfig;
      const serverSettings = yield* ServerSettings.ServerSettingsService;
      const piEnvironment = config.homePath
        ? [
            ...environment.filter((variable) => variable.name !== "PI_CODING_AGENT_DIR"),
            { name: "PI_CODING_AGENT_DIR", value: config.homePath, sensitive: false },
          ]
        : environment;
      const processEnv = mergeProviderInstanceEnvironment(piEnvironment);
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });
      const stampIdentity = withInstanceIdentity({
        instanceId,
        displayName,
        accentColor,
        continuationGroupKey: continuationIdentity.continuationKey,
      });
      const effectiveConfig = { ...config, enabled } satisfies PiSettings;
      const resolveMaintenance = yield* makeCachedProviderMaintenanceResolution(
        resolveProviderMaintenanceCapabilitiesEffect(UPDATE, {
          binaryPath: effectiveConfig.binaryPath,
          env: processEnv,
        }).pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, pathService),
        ),
      );

      // Add suite resources only to sessions with V2's permission extension.
      // Background generation and native fork helpers keep upstream's restrictions.
      const suiteSpawner = ChildProcessSpawner.make((command) => {
        if (
          !ChildProcess.isStandardCommand(command) ||
          !command.options.env?.[T3_PI_RUNTIME_MODE_ENV] ||
          !command.args.some((arg) => arg.includes(PI_T3_MCP_EXTENSION_FILENAME))
        ) {
          return spawner.spawn(command);
        }
        return Effect.gen(function* () {
          const sessionCwd = command.options.cwd ?? cwd;
          const resolved = resolvePiLaunchArgs(effectiveConfig.launchArgs);
          if (!resolved.ok) return yield* spawner.spawn(command);
          const trust = yield* discoverPiProjectTrust({
            homePath: effectiveConfig.homePath,
            cwd: sessionCwd,
            environment: processEnv,
            launchArgs: resolved.args,
            observedProjectResources: false,
          });
          const resources = yield* resolvePiLaunchResources({
            settings: effectiveConfig,
            cwd: sessionCwd,
            environment: processEnv,
            allowInferredSuite:
              trust === "explicit-approved" ||
              trust === "configured-saved-approved-partial" ||
              trust === "configured-default-always-partial",
          });
          if (resources.missingPaths.length > 0) {
            return yield* PlatformError.systemError({
              _tag: "NotFound",
              module: "ChildProcess",
              method: "spawn",
              description: "Takomi suite root is missing required assets.",
            });
          }
          if (resources.args.length === 0) return yield* spawner.spawn(command);
          const resourceCommand = yield* resolveSpawnCommand(
            effectiveConfig.binaryPath || "pi",
            resources.args,
            { env: processEnv },
          ).pipe(
            Effect.mapError((cause) =>
              PlatformError.systemError({
                _tag: "NotFound",
                module: "ChildProcess",
                method: "spawn",
                cause,
              }),
            ),
          );
          return yield* spawner.spawn(
            ChildProcess.make(
              command.command,
              [...command.args, ...resourceCommand.args],
              command.options,
            ),
          );
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, pathService),
        );
      });
      const orchestrationAdapter = yield* PiAdapterV2Driver.create({
        instanceId,
        displayName,
        accentColor,
        environment: piEnvironment,
        enabled,
        config,
      }).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, suiteSpawner),
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: "Failed to build Pi orchestration adapter.",
              cause,
            }),
        ),
      );
      const textGeneration = yield* makePiTextGeneration(effectiveConfig, processEnv);

      const checkProvider = checkPiProviderStatus(effectiveConfig, processEnv, cwd).pipe(
        Effect.map(stampIdentity),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );

      const snapshotSettings = makeProviderSnapshotSettingsSource(effectiveConfig, serverSettings);
      const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<PiSettings>>({
        resolveMaintenance,
        getSettings: snapshotSettings.getSettings,
        streamSettings: snapshotSettings.streamSettings,
        haveSettingsChanged: haveProviderSnapshotSettingsChanged,
        initialSnapshot: (settings) =>
          buildInitialPiProviderSnapshot(settings.provider).pipe(Effect.map(stampIdentity)),
        checkProvider,
        enrichSnapshot: ({ settings, snapshot: currentSnapshot, publishSnapshot }) =>
          resolveMaintenance().pipe(
            Effect.flatMap((maintenanceCapabilities) =>
              enrichPiSnapshot({
                snapshot: currentSnapshot,
                maintenanceCapabilities,
                enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
                publishSnapshot,
                httpClient,
              }),
            ),
          ),
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: "Failed to build Pi snapshot.",
              cause,
            }),
        ),
      );

      const workspaceResources = new Map<string, number>();
      const snapshotForCwd = (workspaceCwd: string) =>
        !effectiveConfig.enabled
          ? snapshot.getSnapshot
          : Effect.all({
              machineSnapshot: snapshot.getSnapshot,
              discovery: discoverPiResources(effectiveConfig, workspaceCwd, processEnv),
              now: DateTime.now,
            }).pipe(
              Effect.map(({ machineSnapshot, discovery, now }) => {
                const checkedAt = DateTime.formatIso(now);
                if (discovery.status === "unavailable") {
                  workspaceResources.delete(workspaceCwd);
                  return {
                    ...machineSnapshot,
                    status: "error" as const,
                    checkedAt,
                    slashCommands: [],
                    skills: [],
                    message:
                      discovery.reason === "deadline"
                        ? "Pi command and skill discovery exceeded its deadline."
                        : "Pi command and skill discovery failed.",
                  };
                }
                workspaceResources.set(
                  workspaceCwd,
                  DateTime.toEpochMillis(now) + Duration.toMillis(PI_WORKSPACE_RESOURCE_TTL),
                );
                return {
                  ...machineSnapshot,
                  checkedAt,
                  slashCommands: withPiBuiltinSlashCommands(discovery.resources.slashCommands),
                  skills: discovery.resources.skills,
                };
              }),
              Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
              Effect.provideService(FileSystem.FileSystem, fileSystem),
              Effect.provideService(Path.Path, pathService),
            );
      const isWorkspaceSnapshotCurrent = (workspaceCwd: string) =>
        DateTime.now.pipe(
          Effect.map(
            (now) => (workspaceResources.get(workspaceCwd) ?? 0) > DateTime.toEpochMillis(now),
          ),
        );

      return {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        snapshotForCwd,
        isWorkspaceSnapshotCurrent,
        orchestrationAdapter,
        textGeneration,
      } satisfies ProviderInstance;
    }),
};
