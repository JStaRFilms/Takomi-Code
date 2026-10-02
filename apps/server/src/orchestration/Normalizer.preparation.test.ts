import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  ComposerContextId,
  ProviderInstanceId,
  ThreadId,
  PiInputSubmission,
  piInputSubmissionsHaveSameContent,
  type ChatAttachment,
  type UploadChatAttachment,
  type OrchestrationMessageContext,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ServerConfig } from "../config.ts";
import { resolveAttachmentPath } from "../attachmentStore.ts";
import { cleanupPreparedAttachments, normalizeMessageAttachments } from "./Normalizer.ts";

const testLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-pi-input-preparation-",
}).pipe(Layer.provideMerge(NodeServices.layer));
const submissionJsonSchema = Schema.fromJsonString(PiInputSubmission);
const encodeSubmissionJson = Schema.encodeEffect(submissionJsonSchema);
const decodeSubmissionJson = Schema.decodeEffect(submissionJsonSchema);
const threadId = ThreadId.make("submission-thread");
const pendingId = "pending-00000000-0000-4000-8000-000000000001-txt";
const attachments: ReadonlyArray<ChatAttachment | UploadChatAttachment> = [
  {
    type: "image",
    id: "local-image",
    name: "image.png",
    mimeType: "image/png",
    sizeBytes: 6,
    dataUrl: "data:image/png;base64,cGl4ZWxz",
  },
  { type: "file", id: pendingId, name: "notes.txt", mimeType: "text/plain", sizeBytes: 5 },
];
const context: OrchestrationMessageContext = {
  version: 1,
  records: [
    {
      version: 1,
      contextId: ComposerContextId.make("image-context"),
      kind: "image",
      label: "Image",
      attachmentId: "local-image",
      name: "image.png",
      mimeType: "image/png",
      sizeBytes: 6,
    },
    {
      version: 1,
      contextId: ComposerContextId.make("file-context"),
      kind: "file",
      label: "Notes",
      attachmentId: pendingId,
      name: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
    },
    {
      version: 1,
      contextId: ComposerContextId.make("skill-context"),
      kind: "skill",
      label: "Review",
      name: "review",
    },
    {
      version: 1,
      contextId: ComposerContextId.make("opaque-context"),
      kind: "custom-context",
      label: "Custom",
      payload: { key: "value", nested: { count: 2 } },
    },
  ],
};

describe("reusable authored attachment preparation", () => {
  it.effect(
    "claims images/files, remaps context and releases duplicate copies without invalidating original history",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* ServerConfig;
        const pendingPath = path.join(config.attachmentsDir, `${pendingId}.txt`);
        yield* fs.writeFileString(pendingPath, "notes");
        const input = { threadId, attachments, context, rejectDuplicateIds: true };
        const first = yield* normalizeMessageAttachments(input);
        const duplicate = yield* normalizeMessageAttachments(input);
        const image = first.attachments[0];
        const file = first.attachments[1];
        if (!image || !file) throw new Error("Missing prepared attachments");
        expect(first.context?.records).toMatchObject([
          { attachmentId: image.id, contextId: "image-context" },
          { attachmentId: file.id, contextId: "file-context" },
          { kind: "skill", name: "review" },
          { kind: "custom-context" },
        ]);
        expect(context.records[0]).toMatchObject({ attachmentId: "local-image" });
        for (const attachment of first.attachments) {
          const stored = resolveAttachmentPath({
            attachmentsDir: config.attachmentsDir,
            attachment,
          });
          if (!stored) throw new Error("Invalid stored path");
          expect(yield* fs.readFileString(stored)).toBe(
            attachment.type === "image" ? "pixels" : "notes",
          );
        }
        const submission: PiInputSubmission = {
          requestId: "request-1",
          threadId,
          providerInstanceId: ProviderInstanceId.make("pi"),
          generation: "original-process",
          text: "Original GUI text",
          intent: "steer",
          fingerprint: "a".repeat(64),
          outcome: "unconfirmed",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          attachments: first.attachments,
          context: first.context,
        };
        expect(
          piInputSubmissionsHaveSameContent(submission, {
            ...submission,
            attachments: duplicate.attachments,
            context: duplicate.context,
          }),
        ).toBe(true);
        expect(
          piInputSubmissionsHaveSameContent(submission, {
            ...submission,
            attachments: [{ ...image, name: "different.png" }, file],
          }),
        ).toBe(false);
        const history = yield* encodeSubmissionJson(submission);
        const stored = yield* decodeSubmissionJson(history);
        expect(
          piInputSubmissionsHaveSameContent(stored, {
            ...submission,
            attachments: duplicate.attachments,
            context: duplicate.context,
          }),
        ).toBe(true);
        expect(history).not.toContain("dataUrl");
        expect(history).not.toContain("cGl4ZWxz");
        expect(history).not.toContain(config.attachmentsDir);
        expect(history).not.toContain("claimedAttachmentPaths");
        yield* cleanupPreparedAttachments(
          {
            claimedAttachmentPaths: [
              ...first.claimedAttachmentPaths,
              ...duplicate.claimedAttachmentPaths,
            ],
          },
          first.attachments,
        );
        for (const stored of first.claimedAttachmentPaths)
          expect(yield* fs.exists(stored)).toBe(true);
        for (const stored of duplicate.claimedAttachmentPaths)
          expect(yield* fs.exists(stored)).toBe(false);
        expect(yield* fs.readFileString(pendingPath)).toBe("notes");
        yield* cleanupPreparedAttachments(first);
        expect(yield* fs.readDirectory(config.attachmentsDir)).toEqual([`${pendingId}.txt`]);
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect(
    "rejects duplicate IDs before any writes and cleans inline images after a later upload failure",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const config = yield* ServerConfig;
        const image = attachments[0];
        if (!image) throw new Error("Missing image fixture");
        const duplicateError = yield* normalizeMessageAttachments({
          threadId,
          attachments: [image, image],
          rejectDuplicateIds: true,
        }).pipe(Effect.flip);
        expect(duplicateError.message).toContain("duplicate attachment id");
        expect(yield* fs.readDirectory(config.attachmentsDir)).toEqual([]);
        const missingError = yield* normalizeMessageAttachments({
          threadId,
          attachments,
          context,
          rejectDuplicateIds: true,
        }).pipe(Effect.flip);
        expect(missingError.message).toContain("attachment not found");
        expect(yield* fs.readDirectory(config.attachmentsDir)).toEqual([]);
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect(
    "cleans partially written inline images and claimed copies on cancellation while preserving pending sources",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* ServerConfig;
        yield* fs.writeFileString(path.join(config.attachmentsDir, `${pendingId}.txt`), "notes");
        for (const operation of ["write", "copy"] as const) {
          const selected = operation === "write" ? attachments.slice(0, 1) : attachments.slice(1);
          const exit = yield* normalizeMessageAttachments({
            threadId,
            attachments: selected,
            rejectDuplicateIds: true,
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              writeFile: (destination, bytes, options) =>
                fs
                  .writeFile(destination, bytes, options)
                  .pipe(Effect.andThen(operation === "write" ? Effect.interrupt : Effect.void)),
              copyFile: (source, destination) =>
                fs
                  .copyFile(source, destination)
                  .pipe(Effect.andThen(operation === "copy" ? Effect.interrupt : Effect.void)),
            }),
            Effect.exit,
          );
          expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
          expect(yield* fs.readDirectory(config.attachmentsDir)).toEqual([`${pendingId}.txt`]);
        }
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect(
    "preserves size, upload-type and thread ownership validation for standalone preparation",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* ServerConfig;
        yield* fs.writeFileString(path.join(config.attachmentsDir, `${pendingId}.txt`), "notes");
        for (const attachment of [
          {
            type: "file" as const,
            id: pendingId,
            name: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 6,
          },
          {
            type: "image" as const,
            id: pendingId,
            name: "notes.png",
            mimeType: "image/png",
            sizeBytes: 5,
          },
          {
            type: "file" as const,
            id: pendingId.replace("pending-", "other-thread-"),
            name: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 5,
          },
        ]) {
          const error = yield* normalizeMessageAttachments({
            threadId,
            attachments: [attachment],
            rejectDuplicateIds: true,
          }).pipe(Effect.flip);
          expect(error.message).toContain("cannot be sent");
          expect(yield* fs.readDirectory(config.attachmentsDir)).toEqual([`${pendingId}.txt`]);
        }
      }).pipe(Effect.provide(testLayer)),
  );
});
