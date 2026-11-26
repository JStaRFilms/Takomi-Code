import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { ServerInstallation } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { resolveCommandPath } from "@t3tools/shared/shell";

import packageJson from "../../package.json" with { type: "json" };
import {
  findPosixLauncher,
  readPosixLauncherTarget,
  resolveLauncherPath,
} from "../cloud/pinnedRuntime.ts";

const PINNED_RUNTIME_ENTRY = /^(.*)\/runtime\/versions\/[^/]+\/t3$/;

export type CliRunner = "npx" | "pnpm dlx" | "bunx";

/** Detection is best-effort; callers must fail closed to a plain `t3` command. */
export function detectCliRunner(entryPath: string): CliRunner | null {
  const path = entryPath.replaceAll("\\", "/");
  if (path.includes("/_npx/")) {
    return "npx";
  }
  if (
    path.includes("/pnpm/dlx/") ||
    path.includes("/.pnpm/dlx/") ||
    path.includes("/pnpm-cache/dlx/")
  ) {
    return "pnpm dlx";
  }
  if (path.includes("/.bun/install/cache/") || path.includes("/bunx-")) {
    return "bunx";
  }
  return null;
}

const InstallManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  bin: Schema.optionalKey(
    Schema.Struct({
      "takomi-code": Schema.optionalKey(Schema.String),
      t3: Schema.optionalKey(Schema.String),
    }),
  ),
  optionalDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
const decodeInstallManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(InstallManifest));

/**
 * A launcher identifies the npm install only when its package matches this exact version.
 * Its env variable is inherited by agent shells and must not misidentify another CLI.
 * Source builds use their Node entry script; standalone executables use their own path.
 */
export const resolveEntryPath = Effect.gen(function* () {
  const npmLauncher = (yield* HostProcess.Environment).T3CODE_NPM_LAUNCHER_PATH?.trim();
  if (npmLauncher) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const packageRoot = path.join(path.dirname(npmLauncher), "..");
    const manifest = yield* fs
      .readFileString(path.join(packageRoot, "package.json"))
      .pipe(Effect.flatMap(decodeInstallManifest), Effect.option);
    if (Option.isSome(manifest) && manifest.value.version === packageJson.version) {
      const { name, bin } = manifest.value;
      const declaredLauncher =
        name === "takomi-code"
          ? bin?.["takomi-code"]
          : name === "t3" && path.basename(npmLauncher) === "t3.mjs"
            ? bin?.t3
            : undefined;
      if (
        declaredLauncher !== undefined &&
        Option.contains(
          yield* fs.realPath(path.join(packageRoot, declaredLauncher)).pipe(Effect.option),
          npmLauncher,
        )
      ) {
        return npmLauncher;
      }
    }
  }
  if (yield* HostProcess.IsExecutable) return yield* HostProcess.ExecutablePath;
  return (yield* HostProcess.Arguments)[1] ?? "";
});

export const resolveServerInstallation = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const executable = yield* HostProcess.IsExecutable;
  const executablePath = yield* HostProcess.ExecutablePath;
  const platform = yield* HostProcess.Platform;
  const entry = yield* fs.realPath(yield* resolveEntryPath);
  const runtime = PINNED_RUNTIME_ENTRY.exec(entry);
  if (runtime) {
    const launchedAs = yield* resolveLauncherPath;
    if (launchedAs === undefined) return null;
    const link = yield* fs.readLink(launchedAs).pipe(Effect.option);
    // A launcher script execs the runtime itself, so look for the script that runs it.
    const launcher = Option.isSome(link)
      ? launchedAs
      : yield* findPosixLauncher({
          launchedAs,
          versionsDir: path.join(runtime[1] || "/", "runtime/versions"),
        });
    // None for a runtime started directly, as SSH launches do, or through a copy.
    if (launcher === undefined) return null;
    const target = Option.isSome(link)
      ? path.resolve(path.dirname(launcher), link.value)
      : yield* readPosixLauncherTarget(launcher);
    // Keep the home as the launcher spells it; `t3 update` only repoints launchers into that spelling.
    const linked = target === undefined ? null : PINNED_RUNTIME_ENTRY.exec(target);
    if (!linked || (yield* fs.realPath(linked[1] || "/")) !== (runtime[1] || "/")) return null;
    return {
      kind: "t3-launcher",
      launcher,
      baseDir: linked[1] || "/",
    } satisfies ServerInstallation;
  }
  const match =
    /^(.*)\/lib\/node_modules\/takomi-code\/(?:dist\/bin\.mjs|bin\/takomi-code\.js|node_modules\/@johnsax\/takomi-code-[^/]+\/t3)$/.exec(
      entry.replaceAll("\\", "/"),
    );
  if (!match) {
    const runner = detectCliRunner(entry);
    return runner === null
      ? null
      : ({ kind: runner === "pnpm dlx" ? "pnpm-dlx" : runner } satisfies ServerInstallation);
  }
  if (platform === "win32") return null;
  const prefix = path.normalize(match[1] || "/");
  if (
    prefix.includes("/node_modules/") ||
    /\/(?:Cellar|Caskroom)\//i.test(prefix) ||
    /\/mise\/installs\/(?!node\/)[^/]+\//.test(prefix)
  )
    return null;

  const packageRoot = path.join(prefix, "lib/node_modules/takomi-code");
  const manifest = yield* fs
    .readFileString(path.join(packageRoot, "package.json"))
    .pipe(Effect.flatMap(decodeInstallManifest));
  const declaredLauncher = manifest.bin?.["takomi-code"];
  if (
    manifest.name !== "takomi-code" ||
    manifest.version !== packageJson.version ||
    declaredLauncher === undefined
  )
    return null;
  const bin = yield* fs.realPath(path.join(packageRoot, declaredLauncher));
  const globalBin = yield* fs.realPath(path.join(prefix, "bin/takomi-code"));
  if (globalBin !== bin) return null;
  if (executable) {
    const nativeEntry = (yield* fs.realPath(executablePath)).replaceAll("\\", "/");
    const nativeManifest = yield* fs
      .readFileString(path.join(path.dirname(nativeEntry), "package.json"))
      .pipe(Effect.flatMap(decodeInstallManifest));
    if (
      nativeManifest.name !==
        `@johnsax/takomi-code-${platform}-${yield* HostProcess.Architecture}` ||
      nativeEntry !==
        (yield* fs.realPath(
          path.join(packageRoot, "node_modules", nativeManifest.name, "t3"),
        )).replaceAll("\\", "/") ||
      declaredLauncher !== "./bin/takomi-code.js" ||
      manifest.optionalDependencies?.[nativeManifest.name] !== nativeManifest.version ||
      nativeManifest.version !== manifest.version
    )
      return null;
  } else if (bin.replaceAll("\\", "/") !== entry) {
    return null;
  }
  return { kind: "npm-global", prefix } satisfies ServerInstallation;
}).pipe(Effect.orElseSucceed(() => null));

/**
 * The public npm package spec to suggest. The literal spec the user typed (e.g.
 * `takomi-code@nightly`) is resolved away before our process starts, so re-derive it
 * from the running version: nightly builds re-suggest the nightly channel,
 * anything else suggests the bare package.
 */
function suggestedPackageSpec(version: string): string {
  const channel = /^[^-+]+-(nightly|preview)\./.exec(version)?.[1];
  return channel === undefined ? "takomi-code" : `takomi-code@${channel}`;
}

/**
 * Render a CLI suggestion that matches how this process was
 * launched, so copy/pasting it actually works: `npx takomi-code connect` suggests
 * `npx takomi-code serve`, a global install suggests `takomi-code serve`, and a nightly build
 * keeps the `@nightly` tag.
 */
export function formatCliCommand(input: {
  readonly subcommand: string;
  readonly entryPath: string;
  readonly version: string;
}): string {
  const runner = detectCliRunner(input.entryPath);
  if (runner === null) {
    const command = /(?:takomi-code|@johnsax)[/\\]/.test(input.entryPath) ? "takomi-code" : "t3";
    return `${command} ${input.subcommand}`;
  }
  return `${runner} ${suggestedPackageSpec(input.version)} ${input.subcommand}`;
}

export const resolveCliCommand = (subcommand: string) =>
  Effect.map(resolveEntryPath, (entryPath) =>
    formatCliCommand({ subcommand, entryPath, version: packageJson.version }),
  );

const shellWord = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;

/** PowerShell also treats typographic quotes as delimiters; escape them and suppress expansion. */
const powershellWord = (value: string) =>
  `"${value
    .replaceAll("`", "``")
    .replaceAll("$", "`$")
    .replace(/["\u201C\u201D\u201E]/g, "$&$&")}"`;

export const hostShellWord = (platform: NodeJS.Platform, value: string) =>
  platform === "win32" ? powershellWord(value) : shellWord(value);

/** Script installs have no single launcher; desktop shims and standalone binaries do. */
const resolveInstallLauncher = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const shim = (yield* HostProcess.Environment).T3CODE_CLI_PATH?.trim();
  if (shim && (yield* fs.exists(shim).pipe(Effect.orElseSucceed(() => false)))) {
    return Option.some(shim);
  }
  return (yield* HostProcess.IsExecutable)
    ? Option.some(yield* HostProcess.ExecutablePath)
    : Option.none<string>();
});

/**
 * Uses this install's `t3` on PATH, the originating runner, or its absolute launcher path.
 * Arguments are quoted for POSIX shells or PowerShell on Windows.
 */
export const resolveHostCliCommand = Effect.fn("invocation.resolveHostCliCommand")(function* (
  subcommand: string,
  args: ReadonlyArray<string> = [],
) {
  const platform = yield* HostProcess.Platform;
  const withArgs = (prefix: string) =>
    // An empty subcommand names the root `t3` command.
    [prefix.trimEnd(), ...args.map((arg) => hostShellWord(platform, arg))].join(" ");
  const command = yield* resolveCliCommand(subcommand);
  if (command !== `t3 ${subcommand}`) return { command: withArgs(command), launcher: false };
  const onPath = yield* resolveCommandPath("t3");
  if (onPath !== null) {
    const shim = (yield* HostProcess.Environment).T3CODE_CLI_PATH?.trim();
    const fs = yield* FileSystem.FileSystem;
    const real = (file: string) => fs.realPath(file).pipe(Effect.orElseSucceed(() => null));
    // Windows `t3.cmd` shims are text files that never realpath to the executable they run.
    const own = shim
      ? yield* real(shim)
      : platform !== "win32" && (yield* HostProcess.IsExecutable)
        ? yield* resolveEntryPath.pipe(
            Effect.flatMap((entry) =>
              real(entry).pipe(Effect.map((resolved) => resolved ?? entry)),
            ),
          )
        : null;
    if (own === null || own === (yield* real(onPath))) {
      const path = yield* Path.Path;
      const searchPath = (yield* HostProcess.Environment).PATH ?? "";
      // With an empty or relative PATH entry, plain `t3` depends on the directory it runs from.
      const cwdDependent =
        platform !== "win32" &&
        searchPath.length > 0 &&
        searchPath.split(":").some((entry) => !path.isAbsolute(entry));
      if (!cwdDependent) return { command: withArgs(command), launcher: false };
      const quoted = hostShellWord(platform, path.resolve(onPath));
      return { command: withArgs(`${quoted} ${subcommand}`), launcher: false };
    }
  }
  const launcher = yield* resolveInstallLauncher;
  if (Option.isNone(launcher)) return { command: withArgs(command), launcher: false };
  // PowerShell runs a quoted path only through the call operator.
  const quoted = hostShellWord(platform, launcher.value);
  const call = platform === "win32" ? `& ${quoted}` : quoted;
  return { command: withArgs(`${call} ${subcommand}`), launcher: true };
});

/** A hint's command, run against the caller's `--base-dir` when one was given. */
export const resolveHostCliHint = (
  subcommand: string,
  baseDir: Option.Option<string>,
  args: ReadonlyArray<string> = [],
) =>
  resolveHostCliCommand(subcommand, [
    ...Option.match(baseDir, { onNone: () => [], onSome: (dir) => ["--base-dir", dir] }),
    ...args,
  ]).pipe(Effect.map(({ command }) => command));

/**
 * `sudo` resets PATH on most distributions, which drops a user-installed Node
 * (nvm, fnm, a tarball) and with it `npx` or a global `t3`, so the command
 * carries PATH through unless Node is on root's PATH too. An absolute launcher
 * needs neither.
 */
export const resolveRootCliCommand = Effect.fn("invocation.resolveRootCliCommand")(function* (
  subcommand: string,
  args: ReadonlyArray<string> = [],
) {
  const { command, launcher } = yield* resolveHostCliCommand(subcommand, args);
  if (launcher) return `sudo ${command}`;
  const executablePath = yield* HostProcess.ExecutablePath;
  const systemNode = ROOT_PATH_DIRECTORIES.some((directory) =>
    executablePath.startsWith(`${directory}/`),
  );
  return systemNode ? `sudo ${command}` : `sudo env "PATH=$PATH" ${command}`;
});

const ROOT_PATH_DIRECTORIES = [
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
];
