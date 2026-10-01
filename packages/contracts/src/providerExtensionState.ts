import * as Schema from "effect/Schema";
import { IsoDateTime, NonNegativeInt, ThreadId } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const EXTENSION_STATE_LIMITS = {
  statuses: 32,
  widgets: 16,
  widgetLines: 100,
  lineBytes: 2 * 1024,
  statusBytes: 16 * 1024,
  titlePoints: 4096,
  titleBytes: 16 * 1024,
  editorBytes: 512 * 1024,
  aggregateBytes: 128 * 1024,
  keyPoints: 256,
  keyBytes: 512,
  wireBytes: 1024 * 1024,
} as const;

const encoder = new TextEncoder();
export const extensionTextBytes = (text: string): number => encoder.encode(text).byteLength;
export const ExtensionStateKey = Schema.String.check(
  Schema.makeFilter(
    (key) =>
      key.length > 0 &&
      Array.from(key).length <= EXTENSION_STATE_LIMITS.keyPoints &&
      extensionTextBytes(key) <= EXTENSION_STATE_LIMITS.keyBytes &&
      Array.from(key).every((point) => {
        const code = point.codePointAt(0) ?? 0;
        return code >= 32 && !(code >= 127 && code <= 159) && !(code >= 0xd800 && code <= 0xdfff);
      }),
  ),
);
const boundedText = (bytes: number) =>
  Schema.String.check(Schema.makeFilter((text) => extensionTextBytes(text) <= bytes));
export const ProviderExtensionStateInput = Schema.Struct({ threadId: ThreadId });
export const ProviderExtensionStateSnapshot = Schema.Struct({
  threadId: ThreadId,
  providerInstanceId: Schema.NullOr(ProviderInstanceId),
  generation: Schema.NullOr(Schema.String.check(Schema.isMaxLength(128))),
  revision: NonNegativeInt,
  active: Schema.Boolean,
  updatedAt: IsoDateTime,
  statuses: Schema.Array(
    Schema.Struct({
      key: ExtensionStateKey,
      text: boundedText(EXTENSION_STATE_LIMITS.statusBytes),
    }),
  ).check(Schema.isMaxLength(EXTENSION_STATE_LIMITS.statuses)),
  widgets: Schema.Array(
    Schema.Struct({
      key: ExtensionStateKey,
      lines: Schema.Array(boundedText(EXTENSION_STATE_LIMITS.lineBytes)).check(
        Schema.isMaxLength(EXTENSION_STATE_LIMITS.widgetLines),
      ),
      placement: Schema.Literals(["aboveEditor", "belowEditor"]),
    }),
  ).check(Schema.isMaxLength(EXTENSION_STATE_LIMITS.widgets)),
  subtitle: Schema.NullOr(
    boundedText(EXTENSION_STATE_LIMITS.titleBytes).check(
      Schema.makeFilter((text) => Array.from(text).length <= EXTENSION_STATE_LIMITS.titlePoints),
    ),
  ),
  editorSuggestion: Schema.NullOr(
    Schema.Struct({
      id: Schema.String.check(Schema.isMaxLength(160)),
      text: boundedText(EXTENSION_STATE_LIMITS.editorBytes),
    }),
  ),
  truncated: Schema.Boolean,
  overflow: Schema.Boolean,
}).check(
  Schema.makeFilter(
    (snapshot) =>
      new Set(snapshot.statuses.map((entry) => entry.key)).size === snapshot.statuses.length &&
      new Set(snapshot.widgets.map((entry) => entry.key)).size === snapshot.widgets.length &&
      extensionTextBytes(
        snapshot.statuses.map((entry) => entry.text).join("") +
          snapshot.widgets.flatMap((entry) => entry.lines).join("") +
          (snapshot.subtitle ?? ""),
      ) <= EXTENSION_STATE_LIMITS.aggregateBytes &&
      extensionTextBytes(JSON.stringify(snapshot)) <= EXTENSION_STATE_LIMITS.wireBytes,
  ),
);
export type ProviderExtensionStateSnapshot = typeof ProviderExtensionStateSnapshot.Type;
export class ProviderExtensionStateError extends Schema.TaggedError<ProviderExtensionStateError>()(
  "ProviderExtensionStateError",
  { message: Schema.String },
) {}
