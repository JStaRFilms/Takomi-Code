import type { PiSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const TAKOMI_EXTENSION_NAMES = [
  "takomi-runtime",
  "takomi-subagents",
  "oauth-router",
  "takomi-context-manager",
  "notify-sound",
  "antigravity-provider",
] as const;

const decodeJsonString = Schema.decodeUnknownExit(Schema.fromJsonString(Schema.Unknown));

function resourceSettings(raw: string): { extensions: string[]; packages: string[] } {
  const parsed = decodeJsonString(raw);
  if (Exit.isFailure(parsed) || parsed.value === null || typeof parsed.value !== "object") {
    return { extensions: [], packages: [] };
  }
  const settings = parsed.value;
  return {
    extensions:
      "extensions" in settings && Array.isArray(settings.extensions)
        ? settings.extensions.filter((value): value is string => typeof value === "string")
        : [],
    packages:
      "packages" in settings && Array.isArray(settings.packages)
        ? settings.packages.filter((value): value is string => typeof value === "string")
        : [],
  };
}

function npmPackageName(source: string): string | undefined {
  if (!source.startsWith("npm:")) return undefined;
  const spec = source.slice("npm:".length);
  if (!spec) return undefined;
  if (!spec.startsWith("@")) return spec.split("@", 1)[0] || undefined;
  const slash = spec.indexOf("/");
  if (slash < 0) return undefined;
  const version = spec.indexOf("@", slash);
  return version < 0 ? spec : spec.slice(0, version);
}

function packageExtensionEntries(raw: string): readonly string[] {
  const parsed = decodeJsonString(raw);
  if (Exit.isFailure(parsed) || parsed.value === null || typeof parsed.value !== "object")
    return [];
  const settings = "pi" in parsed.value ? parsed.value.pi : undefined;
  return settings !== null &&
    typeof settings === "object" &&
    "extensions" in settings &&
    Array.isArray(settings.extensions)
    ? settings.extensions.filter((value): value is string => typeof value === "string")
    : [];
}

function discoverPiCompanionExtensions(input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly environment: NodeJS.ProcessEnv;
  readonly homePath: string;
}) {
  return Effect.gen(function* () {
    const configuredHome = input.homePath.trim() || input.environment.PI_CODING_AGENT_DIR?.trim();
    const userHome = input.environment.USERPROFILE?.trim() || input.environment.HOME?.trim();
    const agentDir =
      configuredHome || (userHome ? input.path.join(userHome, ".pi", "agent") : undefined);
    if (!agentDir) return [];

    const settingsRaw = yield* input.fileSystem
      .readFileString(input.path.join(agentDir, "settings.json"))
      .pipe(Effect.orElseSucceed(() => ""));
    const settings = resourceSettings(settingsRaw);
    const candidates = settings.extensions.map((extensionPath) =>
      input.path.isAbsolute(extensionPath)
        ? extensionPath
        : input.path.resolve(agentDir, extensionPath),
    );

    const globalExtensionsDir = input.path.join(agentDir, "extensions");
    const globalEntries = yield* input.fileSystem
      .readDirectory(globalExtensionsDir)
      .pipe(Effect.orElseSucceed(() => [] as string[]));
    for (const entry of globalEntries) {
      const extensionName = entry.replace(/\.ts$/u, "");
      if (TAKOMI_EXTENSION_NAMES.some((name) => name === extensionName)) {
        continue;
      }
      candidates.push(
        entry.endsWith(".ts")
          ? input.path.join(globalExtensionsDir, entry)
          : input.path.join(globalExtensionsDir, entry, "index.ts"),
      );
    }

    for (const source of settings.packages) {
      const packageName = npmPackageName(source);
      if (!packageName) continue;
      const packageDir = input.path.join(
        agentDir,
        "npm",
        "node_modules",
        ...packageName.split("/"),
      );
      const manifestRaw = yield* input.fileSystem
        .readFileString(input.path.join(packageDir, "package.json"))
        .pipe(Effect.orElseSucceed(() => ""));
      for (const extensionPath of packageExtensionEntries(manifestRaw)) {
        const extension = input.path.resolve(packageDir, extensionPath);
        const entries = yield* input.fileSystem
          .readDirectory(extension)
          .pipe(Effect.orElseSucceed(() => undefined));
        if (!entries) {
          candidates.push(extension);
          continue;
        }
        for (const entry of entries) {
          if (/\.[cm]?[jt]s$/u.test(entry)) {
            candidates.push(input.path.join(extension, entry));
          } else {
            candidates.push(
              input.path.join(extension, entry, "index.ts"),
              input.path.join(extension, entry, "index.js"),
            );
          }
        }
      }
    }

    return yield* Effect.filter([...new Set(candidates)], (candidate) =>
      input.fileSystem.exists(candidate).pipe(Effect.orElseSucceed(() => false)),
    );
  });
}

/** Keep project discovery and session startup on the same Pi resource set. */
export function resolvePiLaunchResources(input: {
  readonly settings: PiSettings;
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly allowInferredSuite?: boolean;
}) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let suiteRoot = input.settings.suiteRoot;
    if (!suiteRoot) {
      const manifestRaw = yield* fileSystem
        .readFileString(path.join(input.cwd, "package.json"))
        .pipe(Effect.orElseSucceed(() => ""));
      const manifest = decodeJsonString(manifestRaw);
      const isTakomiSourceCheckout =
        Exit.isSuccess(manifest) &&
        manifest.value !== null &&
        typeof manifest.value === "object" &&
        "name" in manifest.value &&
        manifest.value.name === "takomi";
      if (isTakomiSourceCheckout) {
        const inferredPaths = [
          ...TAKOMI_EXTENSION_NAMES.map((name) =>
            path.join(input.cwd, ".pi", "extensions", name, "index.ts"),
          ),
          path.join(input.cwd, ".pi", "prompts"),
        ];
        const missing = yield* Effect.filter(inferredPaths, (candidate) =>
          fileSystem.exists(candidate).pipe(
            Effect.orElseSucceed(() => false),
            Effect.map((exists) => !exists),
          ),
        );
        if (missing.length === 0) {
          if (input.allowInferredSuite === false) {
            return { args: ["--no-extensions"], missingPaths: [] as string[] };
          }
          suiteRoot = input.cwd;
        }
      }
    }
    if (!suiteRoot) return { args: [] as string[], missingPaths: [] as string[] };

    const extensionPaths = TAKOMI_EXTENSION_NAMES.map((name) =>
      path.join(suiteRoot, ".pi", "extensions", name, "index.ts"),
    );
    const promptPath = path.join(suiteRoot, ".pi", "prompts");
    const missingPaths = yield* Effect.filter([...extensionPaths, promptPath], (candidate) =>
      fileSystem.exists(candidate).pipe(
        Effect.orElseSucceed(() => false),
        Effect.map((exists) => !exists),
      ),
    );
    if (missingPaths.length > 0) return { args: [], missingPaths };

    const companionPaths = yield* discoverPiCompanionExtensions({
      fileSystem,
      path,
      environment: input.environment,
      homePath: input.settings.homePath,
    });
    return {
      args: [
        "--no-extensions",
        ...[...companionPaths, ...extensionPaths].flatMap((extensionPath) => [
          "--extension",
          extensionPath,
        ]),
        "--prompt-template",
        promptPath,
      ],
      missingPaths,
    };
  });
}
