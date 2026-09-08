// @effect-diagnostics nodeBuiltinImport:off - The CLI writes an explicitly requested manifest outside canonical source.
import * as NodeFSP from "node:fs/promises";
import * as NodeReadline from "node:readline";

import { probePiHost } from "./host.ts";
import { createRuntimePackageManifest, verifyRuntimeProvenance } from "./runtime.ts";
import { scanPiSessionCatalog, type PiSessionCatalogScanRequest } from "./sessionCatalog.ts";

interface ProbeRequest {
  readonly method: "probe";
  readonly packageRoot: string;
  readonly manifestPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProbeRequest(value: unknown): value is ProbeRequest {
  if (!isRecord(value)) return false;
  return (
    value.method === "probe" &&
    typeof value.packageRoot === "string" &&
    typeof value.manifestPath === "string"
  );
}

type CatalogRequest = PiSessionCatalogScanRequest & { readonly method: "catalog" };

function isCatalogRequest(value: unknown): value is CatalogRequest {
  if (!isRecord(value)) return false;
  return (
    value.method === "catalog" &&
    typeof value.workspacePath === "string" &&
    typeof value.agentDir === "string" &&
    typeof value.packageRoot === "string" &&
    Array.isArray(value.launchArgs) &&
    value.launchArgs.every((argument) => typeof argument === "string") &&
    (value.environmentSessionDir === undefined || typeof value.environmentSessionDir === "string")
  );
}

async function runProbe(
  packageRoot: string | undefined,
  manifestPath: string | undefined,
): Promise<void> {
  if (packageRoot === undefined || manifestPath === undefined) {
    throw new Error("Usage: takomi-pi-host probe <package-root> <runtime-manifest.json>");
  }
  process.stdout.write(`${JSON.stringify(await probePiHost({ packageRoot, manifestPath }))}\n`);
}

async function runVerify(args: ReadonlyArray<string>): Promise<void> {
  const [canonicalSource, packedArtifact, extractedPackage, installedPackage, ...options] = args;
  if (
    canonicalSource === undefined ||
    packedArtifact === undefined ||
    extractedPackage === undefined ||
    installedPackage === undefined ||
    (options.length !== 0 &&
      (options.length !== 2 || options[0] !== "--manifest" || options[1] === undefined))
  ) {
    throw new Error(
      "Usage: takomi-pi-host verify <canonical-source> <packed-artifact.tgz> <extracted-package> <isolated-installed-package> [--manifest <runtime-manifest.json>]",
    );
  }
  const input = { canonicalSource, packedArtifact, extractedPackage, installedPackage };
  const manifest = await createRuntimePackageManifest(input);
  const verification = await verifyRuntimeProvenance(input, manifest);
  const manifestPath = options[0] === "--manifest" ? options[1] : undefined;
  if (manifestPath !== undefined) {
    await NodeFSP.writeFile(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(verification)}\n`);
}

async function serve(): Promise<void> {
  const input = NodeReadline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (Buffer.byteLength(line) > 64 * 1024) {
      process.stdout.write(
        `${JSON.stringify({ error: "Host request exceeds the byte limit." })}\n`,
      );
      continue;
    }
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ error: "Invalid host request." })}\n`);
      continue;
    }

    if (!isProbeRequest(message) && !isCatalogRequest(message)) {
      process.stdout.write(`${JSON.stringify({ error: "Invalid read-only host request." })}\n`);
      continue;
    }

    try {
      process.stdout.write(
        `${JSON.stringify(
          message.method === "probe"
            ? await probePiHost(message)
            : await scanPiSessionCatalog(message, { signal: AbortSignal.timeout(15_000) }),
        )}\n`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Host probe failed.";
      process.stdout.write(`${JSON.stringify({ error: detail })}\n`);
    }
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "probe") {
  await runProbe(args[0], args[1]);
} else if (command === "verify") {
  await runVerify(args);
} else if (command === "serve") {
  await serve();
} else {
  throw new Error("Usage: takomi-pi-host <probe|verify|serve>");
}
