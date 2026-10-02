import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  type ChatAttachment,
  type UploadChatAttachment,
  type ClientOrchestrationCommand,
  type UserInputAttachments,
  type OrchestrationMessageContext,
  type ThreadId,
  getProviderAttachmentLimitError,
  type IsoDateTime,
  type OrchestrationCommand,
  OrchestrationDispatchCommandError,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "@t3tools/contracts";

import {
  createAttachmentId,
  planAttachmentClaim,
  PENDING_ATTACHMENT_THREAD_SEGMENT,
  parseThreadSegmentFromAttachmentId,
  resolveAttachmentPath,
} from "../attachmentStore.ts";
import { ServerConfig } from "../config.ts";
import { parseBase64DataUrl } from "../imageMime.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";

export const canonicalizeClientCommandTimestamps = (
  command: ClientOrchestrationCommand,
  receivedAt: IsoDateTime,
): ClientOrchestrationCommand => {
  const canonicalCommand =
    "createdAt" in command
      ? {
          ...command,
          createdAt: receivedAt,
        }
      : command;

  if (canonicalCommand.type !== "thread.turn.start" || !canonicalCommand.bootstrap?.createThread) {
    return canonicalCommand;
  }

  return {
    ...canonicalCommand,
    bootstrap: {
      ...canonicalCommand.bootstrap,
      createThread: {
        ...canonicalCommand.bootstrap.createThread,
        createdAt: receivedAt,
      },
    },
  };
};

const removeClaimedAttachmentPaths = Effect.fn("Normalizer.removeClaimedAttachmentPaths")(
  function* (attachmentPaths: ReadonlyArray<string>) {
    if (attachmentPaths.length === 0) return;
    const fileSystem = yield* FileSystem.FileSystem;
    yield* Effect.forEach(
      attachmentPaths,
      (attachmentPath) =>
        fileSystem.remove(attachmentPath, { force: true }).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning("Failed to remove an unclaimed attachment copy.", {
              attachmentPath,
              cause,
            }),
          ),
          Effect.orElseSucceed(() => undefined),
        ),
      { concurrency: 1 },
    );
  },
);

/** Owns newly claimed copies, never the pending uploads or an earlier submission's files. */
export const normalizeMessageAttachments = Effect.fn("Normalizer.normalizeMessageAttachments")(
  function* (input: {
    readonly threadId: ThreadId;
    readonly attachments: ReadonlyArray<ChatAttachment | UploadChatAttachment>;
    readonly context?: OrchestrationMessageContext;
    readonly rejectDuplicateIds: boolean;
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const serverConfig = yield* ServerConfig;
    const attachments = input.attachments;
    const attachmentLimitError = getProviderAttachmentLimitError(attachments);
    if (attachmentLimitError) {
      return yield* new OrchestrationDispatchCommandError({ message: attachmentLimitError });
    }
    if (input.rejectDuplicateIds) {
      const clientAttachmentIds = new Set<string>();
      for (const attachment of attachments) {
        if (attachment.id === undefined) continue;
        if (clientAttachmentIds.has(attachment.id)) {
          return yield* new OrchestrationDispatchCommandError({
            message: `Attachment '${attachment.name}' cannot be sent: duplicate attachment id.`,
          });
        }
        clientAttachmentIds.add(attachment.id);
      }
    }
    const claimedAttachmentPaths: string[] = [];
    const attachmentsWithDecodedSizes = [...attachments];
    // Context records bind to attachments by the id the client knew; they follow the rename.
    const finalAttachmentIdByClientId = new Map<string, string>();
    const normalizedAttachments = yield* Effect.forEach(
      attachments,
      (attachment, index) =>
        Effect.gen(function* () {
          if (!("dataUrl" in attachment)) {
            const claim = planAttachmentClaim({
              attachmentsDir: serverConfig.attachmentsDir,
              threadId: input.threadId,
              attachmentId: attachment.id,
            });
            if (!claim.ok) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Attachment '${attachment.name}' cannot be sent: ${claim.reason}.`,
              });
            }
            const info = yield* fileSystem.stat(claim.currentPath).pipe(
              Effect.mapError(
                (cause) =>
                  new OrchestrationDispatchCommandError({
                    message: `Attachment '${attachment.name}' cannot be sent: attachment not found.`,
                    cause,
                  }),
              ),
            );
            if (Number(info.size) !== attachment.sizeBytes) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Attachment '${attachment.name}' cannot be sent: stored size does not match.`,
              });
            }
            const normalizedAttachment = {
              ...attachment,
              id: claim.finalId,
              mimeType: attachment.mimeType.toLowerCase(),
            };
            const expectedPath = resolveAttachmentPath({
              attachmentsDir: serverConfig.attachmentsDir,
              attachment: normalizedAttachment,
            });
            if (expectedPath !== claim.finalPath) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Attachment '${attachment.name}' cannot be sent: attachment type does not match the upload.`,
              });
            }
            // Copy rather than link so an agent cannot mutate the pending retry source.
            claimedAttachmentPaths.push(claim.finalPath);
            yield* fileSystem.copyFile(claim.currentPath, claim.finalPath).pipe(
              Effect.mapError(
                (cause) =>
                  new OrchestrationDispatchCommandError({
                    message: `Failed to claim attachment '${attachment.name}' for this thread.`,
                    cause,
                  }),
              ),
            );
            finalAttachmentIdByClientId.set(attachment.id, claim.finalId);
            return normalizedAttachment;
          }
          const parsed = parseBase64DataUrl(attachment.dataUrl);
          if (!parsed || !parsed.mimeType.startsWith("image/")) {
            return yield* new OrchestrationDispatchCommandError({
              message: `Invalid image attachment payload for '${attachment.name}'.`,
            });
          }
          const bytes = Buffer.from(parsed.base64, "base64");
          if (bytes.byteLength === 0 || bytes.byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
            return yield* new OrchestrationDispatchCommandError({
              message: `Image attachment '${attachment.name}' is empty or too large.`,
            });
          }
          const attachmentId = createAttachmentId(input.threadId);
          if (!attachmentId) {
            return yield* new OrchestrationDispatchCommandError({
              message: "Failed to create a safe attachment id.",
            });
          }
          const persistedAttachment = {
            type: "image" as const,
            id: attachmentId,
            name: attachment.name,
            mimeType: parsed.mimeType.toLowerCase(),
            sizeBytes: bytes.byteLength,
            ...(attachment.source ? { source: attachment.source } : {}),
          };
          attachmentsWithDecodedSizes[index] = persistedAttachment;
          const decodedLimitError = getProviderAttachmentLimitError(attachmentsWithDecodedSizes);
          if (decodedLimitError) {
            return yield* new OrchestrationDispatchCommandError({ message: decodedLimitError });
          }
          const attachmentPath = resolveAttachmentPath({
            attachmentsDir: serverConfig.attachmentsDir,
            attachment: persistedAttachment,
          });
          if (!attachmentPath) {
            return yield* new OrchestrationDispatchCommandError({
              message: `Failed to resolve persisted path for '${attachment.name}'.`,
            });
          }
          yield* fileSystem.makeDirectory(path.dirname(attachmentPath), { recursive: true }).pipe(
            Effect.mapError(
              () =>
                new OrchestrationDispatchCommandError({
                  message: `Failed to create attachment directory for '${attachment.name}'.`,
                }),
            ),
          );
          claimedAttachmentPaths.push(attachmentPath);
          yield* fileSystem.writeFile(attachmentPath, bytes).pipe(
            Effect.mapError(
              () =>
                new OrchestrationDispatchCommandError({
                  message: `Failed to persist attachment '${attachment.name}'.`,
                }),
            ),
          );
          if (attachment.id !== undefined)
            finalAttachmentIdByClientId.set(attachment.id, attachmentId);
          return persistedAttachment;
        }),
      { concurrency: 1 },
    ).pipe(Effect.onError(() => removeClaimedAttachmentPaths(claimedAttachmentPaths)));
    const context = input.context;
    return {
      attachments: normalizedAttachments,
      claimedAttachmentPaths,
      ...(context !== undefined
        ? {
            context: {
              ...context,
              records: context.records.map((record) =>
                (record.kind === "image" || record.kind === "file") && "attachmentId" in record
                  ? {
                      ...record,
                      attachmentId:
                        finalAttachmentIdByClientId.get(record.attachmentId) ?? record.attachmentId,
                    }
                  : record,
              ),
            },
          }
        : {}),
    };
  },
);

/** Release failed/duplicate preparation without invalidating the persisted original entry. */
export const cleanupPreparedAttachments = Effect.fn("Normalizer.cleanupPreparedAttachments")(
  function* (
    prepared: { readonly claimedAttachmentPaths: ReadonlyArray<string> },
    retainedAttachments: ReadonlyArray<ChatAttachment> = [],
  ) {
    const config = yield* ServerConfig;
    const retainedPaths = new Set(
      retainedAttachments.map((attachment) =>
        resolveAttachmentPath({
          attachmentsDir: config.attachmentsDir,
          attachment,
        }),
      ),
    );
    yield* removeClaimedAttachmentPaths(
      prepared.claimedAttachmentPaths.filter((path) => !retainedPaths.has(path)),
    );
  },
);

export const normalizeDispatchCommand = (command: ClientOrchestrationCommand) =>
  Effect.gen(function* () {
    const receivedAt = DateTime.formatIso(yield* DateTime.now);
    const canonicalCommand = canonicalizeClientCommandTimestamps(command, receivedAt);
    const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
    const normalizeProjectWorkspaceRoot = (workspaceRoot: string) =>
      workspacePaths
        .normalizeWorkspaceRoot(workspaceRoot)
        .pipe(
          Effect.mapError(
            (cause) => new OrchestrationDispatchCommandError({ message: cause.message }),
          ),
        );
    if (canonicalCommand.type === "project.create") {
      const workspaceRoot = yield* workspacePaths
        .normalizeWorkspaceRoot(canonicalCommand.workspaceRoot, {
          createIfMissing: canonicalCommand.createWorkspaceRootIfMissing === true,
        })
        .pipe(
          Effect.mapError(
            (cause) => new OrchestrationDispatchCommandError({ message: cause.message }),
          ),
        );
      return {
        ...canonicalCommand,
        workspaceRoot,
        createWorkspaceRootIfMissing: canonicalCommand.createWorkspaceRootIfMissing === true,
      } satisfies OrchestrationCommand;
    }
    if (
      canonicalCommand.type === "project.meta.update" &&
      canonicalCommand.workspaceRoot !== undefined
    ) {
      return {
        ...canonicalCommand,
        workspaceRoot: yield* normalizeProjectWorkspaceRoot(canonicalCommand.workspaceRoot),
      } satisfies OrchestrationCommand;
    }
    if (
      canonicalCommand.type !== "thread.turn.start" &&
      canonicalCommand.type !== "thread.user-input.respond"
    ) {
      return canonicalCommand as OrchestrationCommand;
    }
    const attachments =
      canonicalCommand.type === "thread.turn.start"
        ? canonicalCommand.message.attachments
        : Object.values(canonicalCommand.attachmentsByQuestionId ?? {}).flat();
    const prepared = yield* normalizeMessageAttachments({
      threadId: canonicalCommand.threadId,
      attachments,
      rejectDuplicateIds: canonicalCommand.type === "thread.turn.start",
      ...(canonicalCommand.type === "thread.turn.start" &&
      canonicalCommand.message.context !== undefined
        ? { context: canonicalCommand.message.context }
        : {}),
    });
    if (canonicalCommand.type === "thread.user-input.respond") {
      let index = 0;
      const attachmentsByQuestionId = Object.fromEntries(
        Object.entries(canonicalCommand.attachmentsByQuestionId ?? {}).map(
          ([questionId, original]) => {
            const claimed = prepared.attachments.slice(
              index,
              index + original.length,
            ) as UserInputAttachments[string];
            index += original.length;
            return [questionId, claimed];
          },
        ),
      );
      return {
        ...canonicalCommand,
        ...(attachments.length > 0 ? { attachmentsByQuestionId } : {}),
      };
    }
    return {
      ...canonicalCommand,
      message: {
        ...canonicalCommand.message,
        attachments: prepared.attachments,
        ...(prepared.context !== undefined ? { context: prepared.context } : {}),
      },
    } satisfies OrchestrationCommand;
  });

export const cleanupFailedUploadedAttachments = Effect.fn(
  "Normalizer.cleanupFailedUploadedAttachments",
)(function* (command: ClientOrchestrationCommand, normalizedCommand: OrchestrationCommand) {
  const originalAttachments =
    command.type === "thread.turn.start"
      ? command.message.attachments
      : command.type === "thread.user-input.respond"
        ? Object.values(command.attachmentsByQuestionId ?? {}).flat()
        : [];
  const normalizedAttachments =
    normalizedCommand.type === "thread.turn.start"
      ? normalizedCommand.message.attachments
      : normalizedCommand.type === "thread.user-input.respond"
        ? Object.values(normalizedCommand.attachmentsByQuestionId ?? {}).flat()
        : [];
  if (normalizedAttachments.length === 0) return;
  const serverConfig = yield* ServerConfig;
  const claimedPaths: string[] = [];
  for (const [index, attachment] of normalizedAttachments.entries()) {
    const original = originalAttachments[index];
    if (
      !original ||
      "dataUrl" in original ||
      parseThreadSegmentFromAttachmentId(original.id) !== PENDING_ATTACHMENT_THREAD_SEGMENT
    )
      continue;
    const claimedPath = resolveAttachmentPath({
      attachmentsDir: serverConfig.attachmentsDir,
      attachment,
    });
    if (claimedPath) claimedPaths.push(claimedPath);
  }
  yield* removeClaimedAttachmentPaths(claimedPaths);
});
