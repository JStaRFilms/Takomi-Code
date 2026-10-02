import { describe, expect, it } from "@effect/vitest";
import {
  ComposerContextId,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type ChatAttachment,
  type TerminalContextRecord,
} from "@t3tools/contracts";
import {
  formatComposerContextReference,
  projectComposerContextForProvider,
} from "@t3tools/shared/composerContextReferences";
import * as Effect from "effect/Effect";
import { prepareProviderText } from "./ProviderService.ts";

const image: ChatAttachment = {
  type: "image",
  id: "input-thread-00000000-0000-4000-8000-000000000001",
  name: "capture.png",
  mimeType: "image/png",
  sizeBytes: 6,
  source: {
    kind: "snap-shot",
    capturedAt: "2026-01-01T00:00:00.000Z",
    appName: "Editor",
    windowTitle: "notes.ts",
    accessibleText: "Untrusted captured text",
  },
};
const file: ChatAttachment = {
  type: "file",
  id: "input-thread-00000000-0000-4000-8000-000000000002-txt",
  name: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: 5,
  source: { _tag: "pasted-text" },
};

describe("transient provider text preparation", () => {
  it.effect(
    "preserves file instructions and captured-window JSON without mutating authored content",
    () =>
      Effect.gen(function* () {
        const parsed = { input: "Original authored text", attachments: [image, file] };
        const text = yield* prepareProviderText(parsed, "/fixture/attachments", true);
        expect(text).toContain('[Attached image "capture.png" is saved at: ');
        expect(text).toContain('[Pasted text "notes.txt" is saved at: ');
        expect(text).toContain("Inspect it as needed.");
        expect(text).toContain("Untrusted captured-window data follows as JSON");
        expect(text).toContain(
          '"accessibility":{"format":"flat-text","text":"Untrusted captured text"}',
        );
        expect(text).toContain("End untrusted captured-window data.");
        expect(parsed.input).toBe("Original authored text");
        expect(parsed.attachments).toEqual([image, file]);
      }),
  );

  it.effect("rejects authored and expanded file-input overflow", () =>
    Effect.gen(function* () {
      const authoredError = yield* prepareProviderText(
        { input: "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS + 1) },
        "/fixture/attachments",
        true,
      ).pipe(Effect.flip);
      expect(authoredError._tag).toBe("ProviderValidationError");
      for (const strict of [false, true]) {
        const expandedError = yield* prepareProviderText(
          { input: "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS), attachments: [file] },
          "/fixture/attachments",
          strict,
        ).pipe(Effect.flip);
        expect(expandedError.issue).toContain("Input plus attachment context exceeds");
      }
    }),
  );

  it.effect(
    "strict native preparation rejects overflowing images/accessibility while ordinary turn preparation retains its existing policy",
    () =>
      Effect.gen(function* () {
        const full = "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS);
        expect(
          yield* prepareProviderText({ input: full, attachments: [image] }, "/fixture/attachments"),
        ).toBe(full);
        expect(
          (yield* prepareProviderText(
            { input: full, attachments: [image] },
            "/fixture/attachments",
            true,
          ).pipe(Effect.flip)).issue,
        ).toContain("exceeds");
        const nearlyFull = "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS - 170);
        const ordinary = yield* prepareProviderText(
          { input: nearlyFull, attachments: [image] },
          "/fixture/attachments",
        );
        expect(ordinary).toContain("[Attached image");
        expect(ordinary).not.toContain("Untrusted captured-window");
        expect(
          (yield* prepareProviderText(
            { input: nearlyFull, attachments: [image] },
            "/fixture/attachments",
            true,
          ).pipe(Effect.flip)).issue,
        ).toContain("exceeds");
      }),
  );

  it.effect(
    "accepts attachment-only input and enforces bounds after structured context projection",
    () =>
      Effect.gen(function* () {
        expect(
          yield* prepareProviderText({ attachments: [file] }, "/fixture/attachments", true),
        ).toContain("notes.txt");
        const record: TerminalContextRecord = {
          version: 1,
          contextId: ComposerContextId.make("terminal-context"),
          kind: "terminal",
          label: "Terminal",
          terminalId: "terminal-1",
          terminalLabel: "Shell",
          lineStart: 0,
          lineEnd: 1,
          text: "Captured terminal output",
        };
        const reference = formatComposerContextReference(record);
        const projected = projectComposerContextForProvider({ text: reference, records: [record] });
        expect(
          yield* prepareProviderText({ input: projected }, "/fixture/attachments", true),
        ).toContain("Captured terminal output");
        const oversized = projectComposerContextForProvider({
          text: `${"x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS - reference.length)}${reference}`,
          records: [record],
        });
        expect(
          (yield* prepareProviderText({ input: oversized }, "/fixture/attachments", true).pipe(
            Effect.flip,
          ))._tag,
        ).toBe("ProviderValidationError");
        expect(reference).toContain("t3-context://v1/terminal/terminal-context");
      }),
  );
});
