#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off

import * as ChildProcess from "node:child_process";
import * as Path from "node:path";
import * as URL from "node:url";

const repoRoot = Path.resolve(Path.dirname(URL.fileURLToPath(import.meta.url)), "..");

type VersionSource = "desktop" | "mobile";

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function usage(): string {
  return `Usage: node scripts/local-build-status.ts

Fetch upstream/main and origin/main, then report commit, desktop/mobile versions,
and ahead/behind counts. This command never merges, resets, or changes the working tree.`;
}

function runGit(args: ReadonlyArray<string>): string {
  const result = ChildProcess.spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`Could not start git ${args.join(" ")}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function versionAt(ref: string, source: VersionSource): string {
  const path = source === "desktop" ? "apps/desktop/package.json" : "apps/mobile/app.config.ts";
  const content = runGit(["show", `${ref}:${path}`]);
  if (source === "desktop") {
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      typeof parsed.version === "string"
    ) {
      return parsed.version;
    }
  } else {
    const version = /^\s+version:\s*"([^"]+)"/mu.exec(content)?.[1];
    if (version) return version;
  }
  throw new Error(`Could not read the ${source} version at ${ref}.`);
}

function printRow(columns: ReadonlyArray<string>): void {
  log(columns.map((column) => column.padEnd(16)).join("  "));
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    log(usage());
    return;
  }
  if (args.length > 0) {
    throw new Error(`Unknown option(s): ${args.join(", ")}\n\n${usage()}`);
  }

  log("[local-build-status] Fetching upstream/main and origin/main (no merge or reset)...");
  runGit(["fetch", "upstream", "main"]);
  runGit(["fetch", "origin", "main"]);

  const refs = ["HEAD", "upstream/main", "origin/main"] as const;
  printRow(["Reference", "SHA", "Desktop", "Mobile"]);
  for (const ref of refs) {
    printRow([
      ref,
      runGit(["rev-parse", "--short=12", ref]),
      versionAt(ref, "desktop"),
      versionAt(ref, "mobile"),
    ]);
  }

  printRow(["Comparison", "Ahead", "Behind"]);
  for (const ref of refs.slice(1)) {
    const [behind, ahead] = runGit(["rev-list", "--left-right", "--count", `${ref}...HEAD`])
      .split(/\s+/u)
      .map(Number);
    printRow([`HEAD vs ${ref}`, String(ahead), String(behind)]);
  }
}

try {
  main();
} catch (error) {
  logError(error instanceof Error ? `[local-build-status] ${error.message}` : String(error));
  process.exitCode = 1;
}
