import {
  MessageId,
  PiSessionCatalogError,
  type PiSessionCatalogEntry,
  type ProjectId,
  type ProviderInstanceId,
  type ServerSettings,
  ThreadId,
} from "@t3tools/contracts";
import { forkPiSessionFile } from "@t3tools/takomi-pi-host/sessionFork";
import { extractPiHistory, type PiHistoryMessage } from "@t3tools/takomi-pi-host/sessionHistory";
import {
  inspectPiSessionFile,
  PiSessionSourceError,
  type PiSessionInspection,
} from "@t3tools/takomi-pi-host/sessionInspect";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import {
  PiSessionLifecycle,
  type PiLifecycleBinding,
  type PiSessionHandleRecord,
} from "../PiSessionLifecycle.ts";
import { validatePiSessionProvider } from "./PiSessionCatalog.ts";

function catalogError(
  reason: PiSessionCatalogError["reason"],
  message: string,
): PiSessionCatalogError {
  return new PiSessionCatalogError({ reason, message });
}

const fail = (reason: PiSessionCatalogError["reason"], message: string) =>
  Effect.fail(catalogError(reason, message));

function sourceError(error: unknown): PiSessionCatalogError {
  if (error instanceof PiSessionSourceError) {
    switch (error.reason) {
      case "missing":
        return catalogError("invalid_cursor", "The Pi session file is no longer available.");
      case "workspace":
        return catalogError("workspace_unavailable", "The Pi session workspace is unavailable.");
      case "format":
        return catalogError("unavailable", "This Pi session format cannot be continued in T3.");
      case "unsafe":
        return catalogError("security_rejected", "The Pi session file failed its safety check.");
    }
  }
  return catalogError("unavailable", "Pi session verification is unavailable.");
}

export interface PiSessionRecordContext {
  readonly handle: string;
  readonly serverSettings: ServerSettings;
  readonly providerInstanceId: ProviderInstanceId;
  readonly projectId: ProjectId;
  readonly workspaceCanonicalPath: string;
  readonly environmentId: string;
  readonly serverGeneration: string;
  readonly expiresAt: number;
  readonly lifecycle: PiSessionLifecycle;
}

export interface PiSessionContinueRequestContext extends PiSessionRecordContext {
  readonly threadId: ThreadId;
  readonly mode: "attach" | "fork";
  /** Point-split: keep only the first N records. Forks only. */
  readonly maxRecords?: number;
  readonly threadProjectId: ProjectId;
  readonly threadHasSession: boolean;
  readonly threadHasTurns: boolean;
  readonly hasPersistedBinding: boolean;
}

export interface ResolvedPiSessionRecord {
  readonly record: PiSessionHandleRecord;
  readonly inspection: PiSessionInspection;
}

export interface PiSessionContinueResolution {
  /** Server-resolved session file. Never returned to clients; used as the resume cursor. */
  readonly sessionFile: string;
  readonly display: PiSessionCatalogEntry;
  readonly releaseReservation: () => void;
}

/**
 * Map extracted CLI history to `thread.history.import` messages. Ids use the
 * reserved `import:` namespace with the record position, so they are stable
 * across extractions and the decider treats them as inert backfill (never
 * counted as live turns, never reusable by live commands).
 */
export function toHistoryImportMessages(
  threadId: ThreadId,
  history: ReadonlyArray<PiHistoryMessage>,
): Array<{
  readonly messageId: MessageId;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
}> {
  return history.map((message) => ({
    messageId: MessageId.make(`import:pi:${threadId}:r${message.recordIndex}`),
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
  }));
}

function binding(input: PiSessionRecordContext): PiLifecycleBinding {
  return {
    environmentId: input.environmentId,
    providerInstanceId: input.providerInstanceId,
    projectId: input.projectId,
    workspaceCanonicalPath: input.workspaceCanonicalPath,
    serverGeneration: input.serverGeneration,
    expiresAt: input.expiresAt,
  };
}

function sameFileObject(
  left: { readonly device: string; readonly inode: string },
  right: { readonly device: string; readonly inode: string },
): boolean {
  return left.device === right.device && left.inode === right.inode;
}

/** Resolve a catalog handle to its verified live session file. No thread checks. */
export const resolvePiSessionRecord = Effect.fn("PiSessionAttach.resolvePiSessionRecord")(
  function* (
    input: PiSessionRecordContext,
  ): Effect.fn.Return<ResolvedPiSessionRecord, PiSessionCatalogError, never> {
    const now = yield* Clock.currentTimeMillis;
    if (input.expiresAt <= now) {
      return yield* fail("invalid_cursor", "The Pi session catalog generation has expired.");
    }
    yield* validatePiSessionProvider(input.serverSettings, input.providerInstanceId);
    const lifecycleBinding = binding(input);
    const record = yield* Effect.try({
      try: () => input.lifecycle.resolveSessionHandle(input.handle, lifecycleBinding, now),
      catch: () => catalogError("invalid_cursor", "The Pi session handle is stale or invalid."),
    });
    const signal = yield* Effect.abortSignal;
    const inspection = yield* Effect.tryPromise({
      try: () => inspectPiSessionFile({ file: record.nativeFile }, { signal }),
      catch: sourceError,
    });
    if (!sameFileObject(inspection, record.fileIdentity)) {
      return yield* fail(
        "invalid_cursor",
        "The Pi session file changed. List Pi sessions again and retry.",
      );
    }
    if (inspection.headerId !== record.nativeSessionId || inspection.headerVersion !== 3) {
      return yield* fail("unavailable", "This Pi session format cannot be continued in T3.");
    }
    if (inspection.headerCwdRealpath !== input.workspaceCanonicalPath) {
      return yield* fail("security_rejected", "The Pi session belongs to another workspace.");
    }
    return { record, inspection };
  },
);

export interface PiSessionPreviewResolution {
  readonly messages: ReadonlyArray<{
    readonly recordIndex: number;
    readonly role: "user" | "assistant";
    readonly text: string;
    readonly createdAt: string;
  }>;
  readonly truncated: boolean;
}

/** Read-only message preview for picking a point-split fork position. */
export const previewPiSessionMessages = Effect.fn("PiSessionAttach.previewPiSessionMessages")(
  function* (
    input: PiSessionRecordContext & { readonly limit?: number },
  ): Effect.fn.Return<PiSessionPreviewResolution, PiSessionCatalogError, never> {
    const { record } = yield* resolvePiSessionRecord(input);
    const signal = yield* Effect.abortSignal;
    const extraction = yield* Effect.tryPromise({
      try: () =>
        extractPiHistory(
          { file: record.nativeFile },
          {
            signal,
            maxMessages: input.limit ?? 100,
            maxTextBytes: 500,
            take: "last",
          },
        ),
      catch: () => catalogError("unavailable", "Reading Pi session messages is unavailable."),
    });
    return {
      messages: extraction.messages.map((message) => ({
        recordIndex: message.recordIndex,
        role: message.role,
        text: message.text,
        createdAt: message.createdAt,
      })),
      truncated: extraction.truncated,
    };
  },
);

/** Resolve a catalog handle to a verified session file (or its fork) for a fresh thread. */
export const continuePiSessionInThread = Effect.fn("PiSessionAttach.continuePiSessionInThread")(
  function* (
    input: PiSessionContinueRequestContext,
  ): Effect.fn.Return<PiSessionContinueResolution, PiSessionCatalogError, Path.Path> {
    if (input.threadProjectId !== input.projectId) {
      return yield* fail(
        "security_rejected",
        "The thread and the Pi session belong to different projects.",
      );
    }
    if (input.threadHasSession || input.hasPersistedBinding) {
      return yield* fail(
        "unavailable",
        "This thread already has provider state and cannot continue a Pi session.",
      );
    }
    if (input.threadHasTurns) {
      return yield* fail("unavailable", "Only a thread without turns can continue a Pi session.");
    }
    if (input.mode === "attach" && input.maxRecords !== undefined) {
      return yield* fail("unavailable", "A record limit only applies to forks.");
    }
    const { record } = yield* resolvePiSessionRecord(input);
    if (input.mode === "attach") {
      const releaseReservation = yield* Effect.try({
        try: () => input.lifecycle.reserveSessionFile(record.nativeFile, input.threadId),
        catch: () =>
          catalogError(
            "unavailable",
            "This Pi session is already being continued by another thread.",
          ),
      });
      return {
        sessionFile: record.nativeFile,
        display: record.display,
        releaseReservation,
      } as const;
    }
    const path = yield* Path.Path;
    const signal = yield* Effect.abortSignal;
    const forked = yield* Effect.tryPromise({
      try: () =>
        forkPiSessionFile(
          {
            sourceFile: record.nativeFile,
            sessionDir: path.dirname(record.nativeFile),
            targetCwd: input.workspaceCanonicalPath,
            ...(input.maxRecords !== undefined ? { maxRecords: input.maxRecords } : {}),
          },
          { signal },
        ),
      catch: (error) =>
        error instanceof PiSessionSourceError
          ? sourceError(error)
          : catalogError("unavailable", "Forking the Pi session failed."),
    });
    const releaseReservation = yield* Effect.try({
      try: () => input.lifecycle.reserveSessionFile(forked.file, input.threadId),
      catch: () =>
        catalogError(
          "unavailable",
          "This Pi session is already being continued by another thread.",
        ),
    });
    return {
      sessionFile: forked.file,
      display: record.display,
      releaseReservation,
    } as const;
  },
);
