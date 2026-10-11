import { cliReleaseDownloadBaseUrl, cliReleaseIndexPageUrl } from "@t3tools/shared/cliRelease";
import { compareSemverVersions, parseSemver } from "@t3tools/shared/semver";

export interface AndroidRelease {
  readonly version: string;
  readonly versionCode: number;
  readonly downloadUrl: string;
}

export interface AndroidInstallation {
  readonly version: string;
  readonly versionCode: number;
}

// Match the APK packager's stable version and monotonic versionCode limits.
export function androidStableVersionCode(version: string): number | null {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)) return null;
  const parsed = parseSemver(version);
  if (!parsed) return null;
  const { major, minor, patch } = parsed;
  if (![major, minor, patch].every(Number.isSafeInteger) || minor >= 1000 || patch >= 1000) {
    return null;
  }
  const code = 1 + major * 1_000_000 + minor * 1000 + patch;
  return Number.isSafeInteger(code) && code <= 2_100_000_000 ? code : null;
}

export function androidUpdateInstallation(input: {
  readonly platform: string;
  readonly development: boolean;
  readonly executionEnvironment: unknown;
  readonly variant: unknown;
  readonly applicationId: unknown;
  readonly nativeVersion: unknown;
  readonly nativeBuildVersion: unknown;
}): AndroidInstallation | null {
  if (
    input.platform !== "android" ||
    input.development ||
    input.executionEnvironment === "storeClient" ||
    input.variant !== "production" ||
    input.applicationId !== "com.jstarstudios.takomicode" ||
    typeof input.nativeVersion !== "string" ||
    androidStableVersionCode(input.nativeVersion) === null ||
    typeof input.nativeBuildVersion !== "string" ||
    !/^[1-9]\d*$/u.test(input.nativeBuildVersion)
  )
    return null;
  const versionCode = Number(input.nativeBuildVersion);
  if (!Number.isSafeInteger(versionCode) || versionCode > 2_100_000_000) return null;
  return { version: input.nativeVersion, versionCode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function releaseFromRecord(value: unknown): AndroidRelease | null {
  if (
    !isRecord(value) ||
    value.draft !== false ||
    value.prerelease !== false ||
    typeof value.tag_name !== "string" ||
    !value.tag_name.startsWith("v") ||
    !Array.isArray(value.assets)
  )
    return null;
  const version = value.tag_name.slice(1);
  const versionCode = androidStableVersionCode(version);
  if (versionCode === null) return null;
  const assetName = `Takomi-Code-${version}-android-arm64-v8a.apk`;
  const assets: readonly unknown[] = value.assets;
  if (
    !assets.some(
      (asset) =>
        isRecord(asset) &&
        asset.name === assetName &&
        typeof asset.size === "number" &&
        Number.isSafeInteger(asset.size) &&
        asset.size > 0,
    )
  )
    return null;
  return {
    version,
    versionCode,
    // Never use the browser_download_url supplied by release JSON.
    downloadUrl: `${cliReleaseDownloadBaseUrl(version)}/${assetName}`,
  };
}

export type AndroidUpdateResult =
  | { readonly status: "no-release" }
  | { readonly status: "current" }
  | { readonly status: "available"; readonly release: AndroidRelease };

export function androidUpdateResult(
  release: AndroidRelease | null,
  installed: AndroidInstallation,
): AndroidUpdateResult {
  if (!release) return { status: "no-release" };
  return compareSemverVersions(release.version, installed.version) > 0 &&
    release.versionCode > installed.versionCode
    ? { status: "available", release }
    : { status: "current" };
}

let inFlight: Promise<AndroidRelease | null> | undefined;

/** Scan at most three index pages, including out-of-order release versions. */
export function fetchAndroidRelease(): Promise<AndroidRelease | null> {
  if (inFlight) return inFlight;
  inFlight = fetchReleasePages().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

async function fetchReleasePages(): Promise<AndroidRelease | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let newest: AndroidRelease | null = null;
  try {
    for (let page = 1; page <= 3; page++) {
      const response = await fetch(cliReleaseIndexPageUrl(page), {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not check Android releases.");
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid Android release index.");
      const records: readonly unknown[] = data;
      for (const record of records) {
        const release = releaseFromRecord(record);
        if (release && (!newest || compareSemverVersions(release.version, newest.version) > 0)) {
          newest = release;
        }
      }
      if (records.length < 100) break;
    }
    return newest;
  } finally {
    clearTimeout(timeout);
  }
}
