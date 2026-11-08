import type { DesktopUpdateChannel } from "@t3tools/contracts";
import { desktopUpdateChannelOf } from "@t3tools/shared/cliRelease";

// Preview builds share nightly branding but ship without an update feed.
const PRERELEASE_VERSION_PATTERN = /^[^-+]+-(?:nightly|preview)\.\d{8}\.\d+$/;

export function isNightlyDesktopVersion(version: string): boolean {
  return PRERELEASE_VERSION_PATTERN.test(version);
}

// Takomi publishes stable desktop releases only. Keep version classification
// separate so upstream Nightly release notes and versions still retain their channel.
export function normalizeTakomiDesktopUpdateChannel(
  channel: DesktopUpdateChannel,
): DesktopUpdateChannel {
  return channel === "nightly" ? "latest" : channel;
}

export function resolveDefaultDesktopUpdateChannel(appVersion: string): DesktopUpdateChannel {
  return desktopUpdateChannelOf(appVersion);
}
