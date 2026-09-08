import {
  PiSessionCatalogError,
  type PiSessionCatalogInput,
  type PiSessionCatalogPage,
  PiSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerSettings,
} from "@t3tools/contracts";
import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";
import { scanPiSessionCatalog } from "@t3tools/takomi-pi-host/sessionCatalog";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { expandHomePathWith } from "../../pathExpansion.ts";
import { PiSessionLifecycle, type PiLifecycleBinding } from "../PiSessionLifecycle.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import { resolvePiPackageFromBinary } from "./PiProtocolConformance.ts";

const PI_DRIVER = ProviderDriverKind.make("pi");
const CATALOG_DEADLINE = "15 seconds";
const decodePiSettings = Schema.decodeUnknownSync(PiSettings);
const isPiSessionCatalogError = Schema.is(PiSessionCatalogError);

interface ResolvedPiInstance {
  readonly providerInstanceId: ProviderInstanceId;
  readonly settings: PiSettings;
  readonly environment: NodeJS.ProcessEnv;
}

function catalogError(
  reason: PiSessionCatalogError["reason"],
  message: string,
): PiSessionCatalogError {
  return new PiSessionCatalogError({ reason, message });
}

function resolvePiInstance(
  settings: ServerSettings,
  providerInstanceId: ProviderInstanceId,
): ResolvedPiInstance | PiSessionCatalogError {
  const configured = settings.providerInstances[providerInstanceId];
  if (configured !== undefined) {
    if (configured.driver !== PI_DRIVER) {
      return catalogError(
        "provider_unavailable",
        "This provider instance does not support Pi sessions.",
      );
    }
    try {
      return {
        providerInstanceId,
        settings: decodePiSettings(configured.config ?? {}),
        environment: mergeProviderInstanceEnvironment(configured.environment),
      };
    } catch {
      return catalogError("provider_unavailable", "This Pi provider instance is not configured.");
    }
  }
  if (providerInstanceId !== ProviderInstanceId.make("pi")) {
    return catalogError("provider_unavailable", "This Pi provider instance is unavailable.");
  }
  return { providerInstanceId, settings: settings.providers.pi, environment: process.env };
}

export function validatePiSessionProvider(
  settings: ServerSettings,
  providerInstanceId: ProviderInstanceId,
): Effect.Effect<void, PiSessionCatalogError> {
  const instance = resolvePiInstance(settings, providerInstanceId);
  return isPiSessionCatalogError(instance) ? Effect.fail(instance) : Effect.void;
}

function agentDirectory(
  settings: PiSettings,
  environment: NodeJS.ProcessEnv,
  path: Path.Path,
): string {
  const configured = settings.homePath || environment.PI_CODING_AGENT_DIR || "~/.pi/agent";
  return path.resolve(expandHomePathWith(configured, path));
}

export interface PiSessionCatalogRequestContext {
  readonly catalog: PiSessionCatalogInput;
  readonly serverSettings: ServerSettings;
  readonly workspaceCanonicalPath: string;
  readonly environmentId: string;
  readonly serverGeneration: string;
  readonly expiresAt: number;
  readonly lifecycle: PiSessionLifecycle;
}

function binding(input: PiSessionCatalogRequestContext): PiLifecycleBinding {
  return {
    environmentId: input.environmentId,
    providerInstanceId: input.catalog.providerInstanceId,
    projectId: input.catalog.projectId,
    workspaceCanonicalPath: input.workspaceCanonicalPath,
    serverGeneration: input.serverGeneration,
    expiresAt: input.expiresAt,
  };
}

/** Client input contains only opaque project/provider/cursor identities. */
export const listBoundedPiSessions = Effect.fn("PiSessionCatalog.listBoundedPiSessions")(function* (
  input: PiSessionCatalogRequestContext,
): Effect.fn.Return<PiSessionCatalogPage, PiSessionCatalogError, Path.Path> {
  const now = yield* Clock.currentTimeMillis;
  if (input.expiresAt <= now) {
    return yield* catalogError("invalid_cursor", "The Pi session catalog generation has expired.");
  }
  const limit = input.catalog.limit ?? 50;
  const lifecycleBinding = binding(input);
  if (input.catalog.cursor !== undefined) {
    return yield* Effect.try({
      try: () =>
        input.lifecycle.nextCatalogPage(input.catalog.cursor!, lifecycleBinding, limit, now),
      catch: () =>
        catalogError("invalid_cursor", "The Pi session catalog page is stale or invalid."),
    });
  }
  const instance = resolvePiInstance(input.serverSettings, input.catalog.providerInstanceId);
  if (isPiSessionCatalogError(instance)) return yield* instance;
  if (!instance.settings.enabled) {
    return yield* catalogError("provider_unavailable", "This Pi provider instance is disabled.");
  }
  const path = yield* Path.Path;
  const controller = new AbortController();
  const discovery = Effect.gen(function* () {
    const packageRoot = yield* Effect.tryPromise({
      try: () => resolvePiPackageFromBinary(instance.settings.binaryPath, instance.environment),
      catch: () => catalogError("provider_unavailable", "Pi session discovery is unavailable."),
    });
    const launchArgs = yield* Effect.try({
      try: () => tokenizeCliArgs(instance.settings.launchArgs),
      catch: () => catalogError("provider_unavailable", "Pi launch arguments are invalid."),
    });
    const scan = yield* Effect.tryPromise({
      try: () =>
        scanPiSessionCatalog(
          {
            workspacePath: input.workspaceCanonicalPath,
            agentDir: agentDirectory(instance.settings, instance.environment, path),
            packageRoot,
            launchArgs,
            ...(instance.environment.PI_CODING_AGENT_SESSION_DIR
              ? { environmentSessionDir: instance.environment.PI_CODING_AGENT_SESSION_DIR }
              : {}),
          },
          { signal: controller.signal },
        ),
      catch: () =>
        catalogError("security_rejected", "Pi session discovery rejected this workspace."),
    });
    return input.lifecycle.createCatalogPage(scan, lifecycleBinding, limit, now);
  }).pipe(Effect.ensuring(Effect.sync(() => controller.abort())));
  return yield* discovery.pipe(
    Effect.timeoutOption(CATALOG_DEADLINE),
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(catalogError("deadline", "Pi session discovery exceeded its deadline.")),
        onSome: Effect.succeed,
      }),
    ),
  );
});
