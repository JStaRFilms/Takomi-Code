import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ThreadId, RuntimeRequestId } from "./baseSchemas.ts";
import {
  getProviderAttachmentLimitError,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  ChatAttachment,
} from "./chatAttachment.ts";
import { ModelSelection } from "./modelSelection.ts";
import { ProviderInteractionMode } from "./providerPolicy.ts";

export const ProviderSendTurnInput = Schema.Struct({
  threadId: ThreadId,
  /** Internal recovery: permits empty turns only for adapters supporting promptless continuation. */
  continuation: Schema.optional(Schema.Boolean),
  input: Schema.optional(
    TrimmedNonEmptyString.check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_INPUT_CHARS)),
  ),
  attachments: Schema.optional(
    Schema.Array(ChatAttachment).check(
      Schema.makeFilter((attachments) => getProviderAttachmentLimitError(attachments) ?? true),
    ),
  ),
  modelSelection: Schema.optional(ModelSelection),
  interactionMode: Schema.optional(ProviderInteractionMode),
});
export type ProviderSendTurnInput = typeof ProviderSendTurnInput.Type;

export const ProviderRespondPiSecretInput = Schema.Struct({
  threadId: ThreadId,
  requestId: RuntimeRequestId,
  value: Schema.optional(Schema.String),
  cancelled: Schema.optional(Schema.Boolean),
});
export type ProviderRespondPiSecretInput = typeof ProviderRespondPiSecretInput.Type;

export class ProviderPiSecretInputError extends Schema.TaggedError<ProviderPiSecretInputError>()(
  "ProviderPiSecretInputError",
  { message: Schema.String },
) {}

export const PI_VAULT_ARCHIVE_MAX_BYTES = 12 * 1024 * 1024;

export const ProviderTakePiVaultExportInput = Schema.Struct({
  threadId: ThreadId,
  transferId: TrimmedNonEmptyString,
});
export type ProviderTakePiVaultExportInput = typeof ProviderTakePiVaultExportInput.Type;

export const ProviderTakePiVaultExportResult = Schema.Struct({
  filename: TrimmedNonEmptyString,
  archive: TrimmedNonEmptyString,
  key: TrimmedNonEmptyString,
});
export type ProviderTakePiVaultExportResult = typeof ProviderTakePiVaultExportResult.Type;

export class ProviderPiVaultExportError extends Schema.TaggedError<ProviderPiVaultExportError>()(
  "ProviderPiVaultExportError",
  { message: Schema.String },
) {}

export const ProviderUploadFeedbackInput = Schema.Struct({
  threadId: ThreadId,
  reason: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderUploadFeedbackInput = typeof ProviderUploadFeedbackInput.Type;

export const ProviderUploadFeedbackResult = Schema.Struct({
  feedbackId: TrimmedNonEmptyString,
});
export type ProviderUploadFeedbackResult = typeof ProviderUploadFeedbackResult.Type;

export class ProviderUploadFeedbackError extends Schema.TaggedError<ProviderUploadFeedbackError>()(
  "ProviderUploadFeedbackError",
  {
    threadId: ThreadId,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Failed to upload feedback for thread ${this.threadId}.`;
  }
}
