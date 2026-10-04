import {
  CommandId,
  PiSessionCatalogError,
  type PiSessionAttachInput,
  type PiSessionCatalogInput,
  type PiSessionForkInput,
  type PiSessionMessagePreviewInput,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import { listBoundedPiSessions, validatePiSessionProvider } from "./Layers/PiSessionCatalog.ts";
import {
  continuePiSessionInThread,
  previewPiSessionMessages,
  toHistoryImportMessages,
} from "./Layers/PiSessionAttach.ts";
import {
  checkPiSessionUpdates,
  syncPiSessionUpdates,
  type PiSyncDeps,
} from "./Layers/PiSessionSync.ts";
import { extractPiHistory } from "@t3tools/takomi-pi-host/sessionHistory";
import {
  PI_CATALOG_GENERATION_TTL_MS,
  PiSessionLifecycle,
  renewPiCatalogGeneration,
} from "./PiSessionLifecycle.ts";
import * as ServerSettings from "../serverSettings.ts";

const unavailable = (message: string) =>
  new PiSessionCatalogError({ reason: "unavailable", message });

/** One connection's catalog handles. File paths stay on the server; the V2 event binds the native Pi ref. */
export const makePiSessionContinuationV2 = Effect.fn("PiSessionContinuationV2.make")(function* (
  lifecycle: PiSessionLifecycle,
) {
  const crypto = yield* Crypto.Crypto;
  const connectionGeneration = yield* crypto.randomUUIDv4;
  const generation = yield* Ref.make({
    epoch: 0,
    expiresAt: (yield* Clock.currentTimeMillis) + PI_CATALOG_GENERATION_TTL_MS,
  });
  const projectStore = yield* ProjectStore.ProjectStoreV2;
  const threadManagement = yield* ThreadManagement.ThreadManagementService;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sql = yield* SqlClient.SqlClient;

  const catalogGeneration = Clock.currentTimeMillis.pipe(
    Effect.flatMap((now) =>
      Ref.updateAndGet(generation, (current) => renewPiCatalogGeneration(current, now)),
    ),
  );
  const workspace = (projectId: ProjectId) =>
    projectStore.getShell(projectId).pipe(
      Effect.mapError(() => unavailable("The selected workspace is unavailable.")),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(unavailable("The selected workspace is unavailable.")),
          onSome: (project) =>
            fileSystem
              .realPath(project.workspaceRoot)
              .pipe(Effect.mapError(() => unavailable("The selected workspace is unavailable."))),
        }),
      ),
    );
  const context = (projectId: ProjectId) =>
    Effect.gen(function* () {
      const current = yield* catalogGeneration;
      return {
        serverSettings: yield* settingsService.getSettings.pipe(
          Effect.mapError(() => unavailable("Pi session discovery is unavailable.")),
        ),
        workspaceCanonicalPath: yield* workspace(projectId),
        environmentId: (yield* serverEnvironment.getDescriptor).environmentId,
        serverGeneration: `${lifecycle.serverGeneration}:${connectionGeneration}:${current.epoch}`,
        expiresAt: current.expiresAt,
        lifecycle,
      };
    });

  const list = (input: PiSessionCatalogInput) =>
    Effect.gen(function* () {
      return yield* listBoundedPiSessions({ catalog: input, ...(yield* context(input.projectId)) });
    });
  const preview = (input: PiSessionMessagePreviewInput) =>
    Effect.gen(function* () {
      return yield* previewPiSessionMessages({
        handle: input.sessionHandle,
        providerInstanceId: input.providerInstanceId,
        projectId: input.projectId,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(yield* context(input.projectId)),
      });
    });
  const diagnostics = (input: {
    readonly projectId: ProjectId;
    readonly providerInstanceId: PiSessionCatalogInput["providerInstanceId"];
  }) =>
    Effect.gen(function* () {
      const current = yield* context(input.projectId);
      yield* validatePiSessionProvider(current.serverSettings, input.providerInstanceId);
      return lifecycle.diagnostics(
        {
          environmentId: current.environmentId,
          providerInstanceId: input.providerInstanceId,
          projectId: input.projectId,
          workspaceCanonicalPath: current.workspaceCanonicalPath,
          serverGeneration: current.serverGeneration,
          expiresAt: current.expiresAt,
        },
        yield* Clock.currentTimeMillis,
      );
    });
  const appendHistory: PiSyncDeps["appendHistory"] = (threadId, messages) =>
    Effect.gen(function* () {
      const commandId = CommandId.make(`pi-history:${yield* crypto.randomUUIDv4}`);
      yield* threadManagement.dispatch({
        type: "thread.pi-history.import",
        commandId,
        threadId,
        messages,
      });
    }).pipe(Effect.mapError(() => unavailable("Importing Pi session history failed.")));
  const syncDeps: PiSyncDeps = {
    readThread: (threadId) =>
      threadManagement.getThreadRecords(threadId, ["messages"]).pipe(
        Effect.map((records) => ({
          messages: records.messages.map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text,
            createdAt: DateTime.formatIso(message.createdAt),
          })),
        })),
        Effect.mapError(() => unavailable("The thread is unavailable.")),
      ),
    readSessionFile: (threadId) =>
      threadManagement.getThreadRecords(threadId, ["providerThreads"]).pipe(
        Effect.map((records) => {
          const active = records.providerThreads.find(
            (thread) => thread.id === records.thread.activeProviderThreadId,
          );
          return active?.driver === "pi" ? (active.nativeThreadRef?.nativeId ?? null) : null;
        }),
        Effect.mapError(() => unavailable("Pi session state is unavailable.")),
      ),
    appendHistory,
  };
  const continueSession = (
    input: PiSessionAttachInput | PiSessionForkInput,
    mode: "attach" | "fork",
  ) =>
    Effect.gen(function* () {
      const records = yield* threadManagement
        .getThreadRecords(input.threadId, ["providerThreads", "runs"])
        .pipe(Effect.mapError(() => unavailable("The thread is unavailable.")));
      if (
        records.thread.projectId !== input.projectId ||
        records.thread.providerInstanceId !== input.providerInstanceId ||
        records.thread.deletedAt !== null ||
        records.providerThreads.length > 0 ||
        records.runs.length > 0 ||
        (yield* threadManagement
          .getMessageCount(input.threadId)
          .pipe(Effect.mapError(() => unavailable("The thread is unavailable.")))) > 0
      ) {
        return yield* unavailable(
          "Only a fresh thread with this Pi provider can continue the session.",
        );
      }
      const current = yield* context(input.projectId);
      const resolution = yield* continuePiSessionInThread({
        handle: input.sessionHandle,
        threadId: input.threadId,
        mode,
        ...("maxRecords" in input && input.maxRecords !== undefined
          ? { maxRecords: input.maxRecords }
          : {}),
        providerInstanceId: input.providerInstanceId,
        projectId: input.projectId,
        threadProjectId: records.thread.projectId,
        threadHasSession: false,
        threadHasTurns: false,
        hasPersistedBinding: false,
        ...current,
      });
      return yield* Effect.gen(function* () {
        // V2 records may outlive a process. Prevent a second live thread from using the same file.
        const bound = yield* sql<{ readonly threadId: string }>`
          SELECT provider_thread.thread_id AS threadId
          FROM orchestration_v2_projection_provider_threads AS provider_thread
          JOIN orchestration_v2_projection_threads AS thread ON thread.thread_id = provider_thread.thread_id
          WHERE json_extract(provider_thread.payload_json, '$.nativeThreadRef.nativeId') = ${resolution.sessionFile}
            AND provider_thread.thread_id != ${input.threadId}
            AND thread.deleted_at IS NULL
          LIMIT 1
        `;
        if (bound.length > 0)
          return yield* unavailable("This Pi session is already bound to another thread.");
        // Extract before binding so a failed read cannot leave an empty, non-retryable thread.
        const extraction = yield* Effect.gen(function* () {
          const signal = yield* Effect.abortSignal;
          return yield* Effect.tryPromise({
            try: () => extractPiHistory({ file: resolution.sessionFile }, { signal }),
            catch: () => unavailable("Pi session history is unavailable."),
          });
        }).pipe(Effect.scoped);
        const commandId = CommandId.make(`pi-session:${yield* crypto.randomUUIDv4}`);
        yield* threadManagement
          .dispatch({
            type: "thread.pi-session.attach",
            commandId,
            threadId: input.threadId,
            providerInstanceId: input.providerInstanceId,
            sessionFile: resolution.sessionFile,
            messages: toHistoryImportMessages(input.threadId, extraction.messages),
          })
          .pipe(
            Effect.mapError(() => unavailable("Could not bind the Pi session to this thread.")),
          );
        const hydratedMessages = extraction.messages.length;
        return {
          mode: mode === "attach" ? ("attached" as const) : ("forked" as const),
          name: resolution.display.name,
          modifiedAt: resolution.display.modifiedAt,
          entryCount: resolution.display.entryCount,
          entryCountExact: resolution.display.entryCountExact,
          ...(resolution.display.model === undefined ? {} : { model: resolution.display.model }),
          source: "pi-jsonl" as const,
          hydratedMessages,
        };
      }).pipe(Effect.ensuring(Effect.sync(resolution.releaseReservation)));
    });
  const checkUpdates = (threadId: ThreadId) =>
    checkPiSessionUpdates(threadId, syncDeps).pipe(
      Effect.map((result) => ({ ...result, source: "pi-jsonl" as const })),
    );
  const syncUpdates = (threadId: ThreadId) =>
    syncPiSessionUpdates(threadId, syncDeps).pipe(
      Effect.map((result) => ({ ...result, source: "pi-jsonl" as const })),
    );
  const isPiError = Schema.is(PiSessionCatalogError);
  const rpcError = (cause: unknown) =>
    isPiError(cause) ? cause : unavailable("Pi session operation is unavailable.");
  return {
    list: (input: PiSessionCatalogInput) =>
      list(input).pipe(Effect.provideService(Path.Path, path), Effect.mapError(rpcError)),
    preview: (input: PiSessionMessagePreviewInput) =>
      preview(input).pipe(Effect.mapError(rpcError)),
    diagnostics: (input: {
      readonly projectId: ProjectId;
      readonly providerInstanceId: PiSessionCatalogInput["providerInstanceId"];
    }) => diagnostics(input).pipe(Effect.mapError(rpcError)),
    continueSession: (input: PiSessionAttachInput | PiSessionForkInput, mode: "attach" | "fork") =>
      continueSession(input, mode).pipe(
        Effect.provideService(Path.Path, path),
        Effect.mapError(rpcError),
      ),
    checkUpdates,
    syncUpdates,
  };
});
