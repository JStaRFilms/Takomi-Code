// @effect-diagnostics nodeBuiltinImport:off - The child boundary resolves only its isolated runtime path before it can load Pi.
import * as Path from "node:path";

import {
  type PinnedPackage,
  type RuntimePackageManifest,
  readRuntimePackageManifest,
  verifyRuntimePackageManifest,
} from "./runtime.ts";

export const HOST_PROTOCOL_VERSION = 1 as const;

export interface PiHostProbe {
  readonly protocolVersion: typeof HOST_PROTOCOL_VERSION;
  readonly package: RuntimePackageManifest["package"];
  readonly dependencies: {
    readonly pi: PinnedPackage;
    readonly piSubagents: PinnedPackage;
  };
  readonly capabilities: ReadonlyArray<"capability-probe">;
  readonly session: "not-opened";
}

/**
 * This is intentionally the only B00 host operation. It validates the separately
 * installed runtime and reports its public-SDK compatibility inputs without
 * importing extensions or opening a Pi session. Session operations are added only
 * after their public SDK contracts have focused conformance coverage.
 */
export async function probePiHost(input: {
  readonly packageRoot: string;
  readonly manifestPath: string;
}): Promise<PiHostProbe> {
  const packageRoot = Path.resolve(input.packageRoot);
  const manifest = await readRuntimePackageManifest(input.manifestPath);
  await verifyRuntimePackageManifest(packageRoot, manifest);

  return {
    protocolVersion: HOST_PROTOCOL_VERSION,
    package: manifest.package,
    dependencies: manifest.dependencies,
    capabilities: ["capability-probe"],
    session: "not-opened",
  };
}
