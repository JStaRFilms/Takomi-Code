import { describe, expect, it } from "vite-plus/test";
import {
  ComposerContextId,
  EventId,
  PiInputSubmission,
  ProviderInstanceId,
  ThreadId,
  piInputSubmissionActivity,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { buildThreadFeed, deriveThreadFeedPresentation } from "./threadActivity";
const date = "2026-09-30T00:00:00.000Z";
const submission: PiInputSubmission = {
  requestId: "request",
  threadId: ThreadId.make("thread"),
  providerInstanceId: ProviderInstanceId.make("pi"),
  generation: "first",
  intent: "follow-up",
  text: "authored [file](t3-context://v1/file/file-context)",
  attachments: [
    { type: "file", id: "file", name: "notes.txt", mimeType: "text/plain", sizeBytes: 4 },
    { type: "image", id: "image", name: "screen.png", mimeType: "image/png", sizeBytes: 3 },
  ],
  context: {
    version: 1,
    records: [
      {
        version: 1,
        contextId: ComposerContextId.make("file-context"),
        kind: "file",
        label: "notes.txt",
        attachmentId: "file",
        name: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 4,
      },
    ],
  },
  createdAt: date,
  updatedAt: date,
  fingerprint: "a".repeat(64),
  outcome: "unconfirmed",
};
const codec = Schema.fromJsonString(PiInputSubmission);
const hydrate = (value: PiInputSubmission) =>
  Schema.decodeSync(codec)(Schema.encodeSync(codec)(value));
const work = (id: string, sequence: number): OrchestrationThreadActivity => ({
  id: EventId.make(id),
  kind: "runtime.warning",
  summary: id,
  tone: "info",
  turnId: null,
  createdAt: date,
  sequence,
  payload: {},
});
const rows = (value: PiInputSubmission) =>
  deriveThreadFeedPresentation(
    buildThreadFeed({
      messages: [],
      activities: [work("before", 1), piInputSubmissionActivity(value, 2), work("after", 3)],
    }),
    null,
    new Set(),
  );
describe("mobile typed native Pi submission history", () => {
  it.each(["unconfirmed", "queued", "handled", "not-submitted", "rejected", "unknown"] as const)(
    "keeps hydrated %s content standalone with its original ordering",
    (outcome) => {
      const list = rows(hydrate({ ...submission, outcome, updatedAt: "2026-10-01T00:00:00.000Z" }));
      expect(list.map((row) => row.type)).toEqual(["work-toggle", "activity-group", "work-toggle"]);
      expect(list[1]).toMatchObject({
        createdAt: date,
        turnId: null,
        activities: [
          {
            workEntry: {
              piInputSubmission: { ...submission, outcome, updatedAt: "2026-10-01T00:00:00.000Z" },
            },
          },
        ],
      });
      expect(list[1]?.id).toBe(rows(submission)[1]?.id);
      expect(list.some((row) => row.type === "message")).toBe(false);
    },
  );
});
