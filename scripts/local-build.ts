#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off

import * as ChildProcess from "node:child_process";
import * as FS from "node:fs";
import * as Path from "node:path";
import * as URL from "node:url";

const scriptRoot = Path.resolve(Path.dirname(URL.fileURLToPath(import.meta.url)), "..");
const localWorktree = "C:\\takomi-local-build";
const localVirtualStore = "C:/tp";
const ownershipMarkerName = ".takomi-local-build.json";

interface Options {
  readonly desktop: boolean;
  readonly android: boolean;
  readonly dryRun: boolean;
}

interface OwnershipMarker {
  readonly schemaVersion: 1;
  readonly repositoryGitDir: string;
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function usage(): string {
  return `Usage: node scripts/local-build.ts [--desktop] [--android] [--dry-run]

Build Windows desktop NSIS and/or an internal Android preview APK locally.
With no target flag, builds both. Android uses the managed worktree at ${localWorktree}.

Options:
  --desktop  Build only the Windows NSIS desktop artifact.
  --android  Build only the Android preview release APK.
  --dry-run  Print the plan without creating a worktree or running a build.
  --help     Show this help.`;
}

function parseOptions(argv: ReadonlyArray<string>): Options | undefined {
  // Vite+ preserves the conventional npm argument separator for scripts that
  // already carry an argument (for example, `vp run dist:local:desktop -- --dry-run`).
  const options = argv.filter((argument) => argument !== "--");
  if (options.includes("--help") || options.includes("-h")) {
    log(usage());
    return undefined;
  }

  const known = new Set(["--desktop", "--android", "--dry-run"]);
  const unknown = options.filter((argument) => !known.has(argument));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.join(", ")}\n\n${usage()}`);
  }

  const desktop = options.includes("--desktop");
  const android = options.includes("--android");
  return {
    desktop: desktop || !android,
    android: android || !desktop,
    dryRun: options.includes("--dry-run"),
  };
}

function commandDisplay(command: string, args: ReadonlyArray<string>): string {
  return [command, ...args]
    .map((part) => (/[\s"]/u.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function run(
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  options: {
    readonly capture?: boolean;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): string {
  const capture = options.capture ?? false;
  const result = ChildProcess.spawnSync(command, args, {
    cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    shell:
      process.platform === "win32" &&
      (command === "vp" ||
        command === "pnpm" ||
        command.endsWith(".bat") ||
        command.endsWith(".cmd")),
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error(`Could not start ${commandDisplay(command, args)}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = capture ? result.stderr.trim() : "";
    throw new Error(
      `${commandDisplay(command, args)} failed with exit code ${result.status ?? "unknown"}${stderr ? `: ${stderr}` : ""}`,
    );
  }
  return capture ? result.stdout.trim() : "";
}

function git(sourceRoot: string, args: ReadonlyArray<string>): string {
  return run("git", args, sourceRoot, { capture: true });
}

function sourceRoot(): string {
  return git(scriptRoot, ["rev-parse", "--show-toplevel"]);
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const normalized = Path.normalize(value);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  return normalize(left) === normalize(right);
}

function gitCommonDir(root: string): string {
  const commonDir = git(root, ["rev-parse", "--git-common-dir"]);
  return FS.realpathSync(Path.resolve(root, commonDir));
}

function readMarker(markerPath: string): OwnershipMarker {
  let decoded: unknown;
  try {
    decoded = JSON.parse(FS.readFileSync(markerPath, "utf8"));
  } catch {
    throw new Error(`Managed Android worktree marker is unreadable: ${markerPath}`);
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("schemaVersion" in decoded) ||
    decoded.schemaVersion !== 1 ||
    !("repositoryGitDir" in decoded) ||
    typeof decoded.repositoryGitDir !== "string"
  ) {
    throw new Error(`Managed Android worktree marker is invalid: ${markerPath}`);
  }

  return { schemaVersion: 1, repositoryGitDir: decoded.repositoryGitDir };
}

function writeMarker(worktree: string, repositoryGitDir: string): void {
  const marker: OwnershipMarker = { schemaVersion: 1, repositoryGitDir };
  FS.writeFileSync(
    Path.join(worktree, ownershipMarkerName),
    `${JSON.stringify(marker, null, 2)}\n`,
  );
}

function assertManagedWorktree(worktree: string, repositoryGitDir: string, root: string): void {
  const markerPath = Path.join(worktree, ownershipMarkerName);
  if (!FS.existsSync(markerPath)) {
    throw new Error(
      `Refusing to modify ${worktree}: it exists but is not a Takomi local-build worktree (missing ${ownershipMarkerName}).`,
    );
  }

  const marker = readMarker(markerPath);
  if (!samePath(marker.repositoryGitDir, repositoryGitDir)) {
    throw new Error(
      `Refusing to modify ${worktree}: its ownership marker belongs to another repository.`,
    );
  }

  let targetCommonDir: string;
  try {
    targetCommonDir = gitCommonDir(worktree);
  } catch {
    throw new Error(`Refusing to modify ${worktree}: it is not a readable git worktree.`);
  }
  if (!samePath(targetCommonDir, repositoryGitDir)) {
    throw new Error(`Refusing to modify ${worktree}: it is attached to another repository.`);
  }

  const registeredWorktrees = git(root, ["worktree", "list", "--porcelain"]);
  const isRegistered = registeredWorktrees.split(/\r?\n/u).some((line) => {
    const prefix = "worktree ";
    return line.startsWith(prefix) && samePath(line.slice(prefix.length), Path.resolve(worktree));
  });
  if (!isRegistered) {
    throw new Error(
      `Refusing to modify ${worktree}: git does not register it as this repository's worktree.`,
    );
  }
}

function prepareManagedWorktree(root: string, sha: string): string {
  const repositoryGitDir = gitCommonDir(root);
  if (FS.existsSync(localWorktree)) {
    assertManagedWorktree(localWorktree, repositoryGitDir, root);
  } else {
    run("git", ["worktree", "add", "--detach", localWorktree, sha], root);
    writeMarker(localWorktree, repositoryGitDir);
  }

  // The marker and git-common-dir checks above establish ownership before either
  // command can discard the previous build's generated files or overlay.
  run("git", ["-c", "core.longpaths=true", "reset", "--hard", sha], localWorktree);
  run(
    "git",
    ["-c", "core.longpaths=true", "clean", "-fdx", "-e", ownershipMarkerName],
    localWorktree,
  );
  return localWorktree;
}

function copyTrackedFiles(source: string, target: string): void {
  const files = git(source, ["ls-files", "-z"]).split("\0").filter(Boolean);
  for (const relativePath of files) {
    if (Path.isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes("..")) {
      throw new Error(`Refusing unsafe tracked path: ${relativePath}`);
    }

    const sourcePath = Path.resolve(source, relativePath);
    const targetPath = Path.resolve(target, relativePath);
    const targetPrefix = `${Path.resolve(target)}${Path.sep}`;
    if (!targetPath.startsWith(targetPrefix)) {
      throw new Error(`Refusing path outside managed worktree: ${relativePath}`);
    }

    if (!FS.existsSync(sourcePath)) {
      // A tracked deletion in the current working tree must also be absent
      // from the build copy.
      FS.rmSync(targetPath, { recursive: true, force: true });
      continue;
    }

    // Git already checked out tracked links in the managed worktree. Recreating
    // Windows directory links can require elevation, and their contents are not
    // part of the working-tree overlay.
    const sourceStat = FS.lstatSync(sourcePath);
    if (sourceStat.isSymbolicLink() || sourceStat.isDirectory()) continue;

    FS.mkdirSync(Path.dirname(targetPath), { recursive: true });
    FS.rmSync(targetPath, { recursive: true, force: true });
    FS.copyFileSync(sourcePath, targetPath);
  }
}

function copyRootEnvFiles(source: string, target: string): void {
  for (const name of [".env", ".env.local"]) {
    const from = Path.join(source, name);
    if (FS.existsSync(from)) {
      FS.copyFileSync(from, Path.join(target, name));
    }
  }
}

function configureShortAndroidPaths(worktree: string): void {
  const workspacePath = Path.join(worktree, "pnpm-workspace.yaml");
  FS.appendFileSync(
    workspacePath,
    `\n# Machine-local Android build paths; this worktree is never committed.\nvirtualStoreDir: ${localVirtualStore}\nvirtualStoreDirMaxLength: 32\n`,
  );
}

function writeAndroidLocalProperties(worktree: string): void {
  const sdkDir = process.env["ANDROID_HOME"] ?? process.env["ANDROID_SDK_ROOT"];
  const defaultSdkDir = process.env["LOCALAPPDATA"]
    ? Path.join(process.env["LOCALAPPDATA"], "Android", "Sdk")
    : undefined;
  const resolvedSdkDir = sdkDir ?? defaultSdkDir;
  if (!resolvedSdkDir || !FS.existsSync(resolvedSdkDir)) {
    throw new Error(
      "Android SDK not found. Set ANDROID_HOME or install it under %LOCALAPPDATA%\\Android\\Sdk.",
    );
  }

  const androidRoot = Path.join(worktree, "apps", "mobile", "android");
  FS.writeFileSync(
    Path.join(androidRoot, "local.properties"),
    `sdk.dir=${resolvedSdkDir.replaceAll("\\", "/")}\n`,
  );
}

function readMobileVersion(root: string): string {
  const config = FS.readFileSync(Path.join(root, "apps/mobile/app.config.ts"), "utf8");
  const match = /^\s+version:\s*"([^"]+)"/mu.exec(config);
  const version = match?.[1];
  if (!version) {
    throw new Error("Could not read the mobile version from apps/mobile/app.config.ts.");
  }
  return version;
}

function buildDesktop(root: string, dryRun: boolean): void {
  const outputDir = Path.join(root, "release");
  const args = [
    "scripts/build-desktop-artifact.ts",
    "--platform",
    "win",
    "--target",
    "nsis",
    "--output-dir",
    outputDir,
  ];
  log(`[local-build] Desktop artifacts: ${outputDir}`);
  if (!dryRun) {
    FS.mkdirSync(outputDir, { recursive: true });
    const cachedMonitor = Path.join(
      root,
      "native/resource-monitor/target/x86_64-pc-windows-msvc/release/t3-resource-monitor.exe",
    );
    const tempDir = "C:\\Temp";
    if (!FS.existsSync(tempDir)) {
      FS.mkdirSync(tempDir, { recursive: true });
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TMPDIR: process.env["TMPDIR"] ?? tempDir,
      TEMP: process.env["TEMP"] ?? tempDir,
      TMP: process.env["TMP"] ?? tempDir,
      ...(FS.existsSync(cachedMonitor) && !process.env["T3CODE_DESKTOP_REUSE_RESOURCE_MONITOR"]
        ? { T3CODE_DESKTOP_REUSE_RESOURCE_MONITOR: "true" }
        : {}),
    };
    run(process.execPath, args, root, { env });
  } else {
    log(`[local-build] Would run: ${commandDisplay(process.execPath, args)}`);
  }
}

function buildAndroid(root: string, dryRun: boolean): void {
  const sha = git(root, ["rev-parse", "--short=8", "HEAD"]);
  const dirty = git(root, ["status", "--porcelain", "--untracked-files=no"]).length > 0;
  const version = readMobileVersion(root);
  const outputDir = Path.join(root, "release");
  const artifactName = `Takomi-Code-Preview-${version}-${sha}${dirty ? "-dirty" : ""}.apk`;
  const apkPath = Path.join(
    localWorktree,
    "apps",
    "mobile",
    "android",
    "app",
    "build",
    "outputs",
    "apk",
    "release",
    "app-release.apk",
  );

  log(`[local-build] Android worktree: ${localWorktree}`);
  log(`[local-build] Android artifact: ${Path.join(outputDir, artifactName)}`);
  log(
    "[local-build] This is an internal, debug-signed preview APK; it is not Play Store uploadable.",
  );
  if (dryRun) {
    log(
      `[local-build] Would create or verify managed worktree, overlay tracked files from ${root}, and copy root .env/.env.local when present.`,
    );
    log(`[local-build] Would configure pnpm virtual store: ${localVirtualStore}`);
    log("[local-build] Would run: vp install --filter=@t3tools/mobile...");
    log(
      "[local-build] Would run: APP_VARIANT=preview vp exec expo prebuild --clean --platform android",
    );
    log(
      "[local-build] Would run: android\\gradlew.bat app:assembleRelease -x lint -x test --configure-on-demand --build-cache -PreactNativeArchitectures=arm64-v8a",
    );
    return;
  }

  const worktree = prepareManagedWorktree(root, git(root, ["rev-parse", "HEAD"]));
  copyTrackedFiles(root, worktree);
  copyRootEnvFiles(root, worktree);
  configureShortAndroidPaths(worktree);

  const buildEnv = {
    ...process.env,
    APP_VARIANT: "preview",
    EXPO_NO_GIT_STATUS: "1",
    NODE_ENV: "production",
    T3CODE_MOBILE_PNPM_STORE: localVirtualStore,
  };
  run("vp", ["install", "--filter=@t3tools/mobile..."], worktree, { env: buildEnv });
  const mobileRoot = Path.join(worktree, "apps", "mobile");
  run("pnpm", ["exec", "expo", "prebuild", "--clean", "--platform", "android"], mobileRoot, {
    env: buildEnv,
  });
  writeAndroidLocalProperties(worktree);
  run(
    Path.join(mobileRoot, "android", "gradlew.bat"),
    [
      "app:assembleRelease",
      "-x",
      "lint",
      "-x",
      "test",
      "--configure-on-demand",
      "--build-cache",
      "-PreactNativeArchitectures=arm64-v8a",
    ],
    Path.join(mobileRoot, "android"),
    { env: buildEnv },
  );

  if (!FS.existsSync(apkPath)) {
    throw new Error(`Gradle completed but did not produce ${apkPath}.`);
  }
  FS.mkdirSync(outputDir, { recursive: true });
  FS.copyFileSync(apkPath, Path.join(outputDir, artifactName));
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  if (!options) return;
  if (process.platform !== "win32") {
    throw new Error(
      "Local desktop and Android builds are Windows-only. Use GitHub CI/EAS for other platforms.",
    );
  }

  const root = sourceRoot();
  if (options.desktop) buildDesktop(root, options.dryRun);
  if (options.android) buildAndroid(root, options.dryRun);
}

try {
  main();
} catch (error) {
  logError(error instanceof Error ? `[local-build] ${error.message}` : String(error));
  process.exitCode = 1;
}
