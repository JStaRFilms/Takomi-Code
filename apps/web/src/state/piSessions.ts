import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * Pi/CLI session catalog for one project: terminal sessions that can be
 * continued inside T3. Cached briefly; the picker refreshes on open.
 */
export const piSessionCatalog = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pi-sessions:catalog",
  tag: WS_METHODS.providerListPiSessions,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

/** Bind a catalog session's live file to a fresh, empty thread. */
export const piSessionAttach = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pi-sessions:attach",
  tag: WS_METHODS.providerAttachPiSession,
});

/** Fork a catalog session into a new file, then bind the fork to a fresh thread. */
export const piSessionFork = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pi-sessions:fork",
  tag: WS_METHODS.providerForkPiSession,
});

/**
 * Read-only message preview for picking a point-split fork position.
 * Short cache: the CLI can append at any moment.
 */
export const piSessionMessagePreview = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pi-sessions:messages",
  tag: WS_METHODS.providerListPiSessionMessages,
  staleTimeMs: 15_000,
  idleTtlMs: 5 * 60_000,
});

/**
 * Background update check for continued threads. Polls while mounted; the
 * banner mounts this only for Pi threads with imported history.
 */
export const piSessionUpdateCheck = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pi-sessions:updates",
  tag: WS_METHODS.providerCheckPiSessionUpdates,
  staleTimeMs: 15_000,
  idleTtlMs: 5 * 60_000,
  refreshIntervalMs: 20_000,
});

/** Append new CLI messages into an existing thread's visible history. */
export const piSessionSyncUpdates = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pi-sessions:sync",
  tag: WS_METHODS.providerSyncPiSessionUpdates,
});
