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
import { deriveTimelineEntries, deriveWorkLogEntries } from "../../session-logic";
import { deriveMessagesTimelineRows } from "./MessagesTimeline.logic";
const date = "2026-09-30T00:00:00.000Z";
const submission: PiInputSubmission = {
  requestId: "request",
  threadId: ThreadId.make("thread"),
  providerInstanceId: ProviderInstanceId.make("pi"),
  generation: "first",
  intent: "steer",
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
  deriveMessagesTimelineRows({
    timelineEntries: deriveTimelineEntries(
      [],
      [],
      deriveWorkLogEntries([
        work("before", 1),
        piInputSubmissionActivity(value, 2),
        work("after", 3),
      ]),
    ),
    isWorking: false,
    activeTurnStartedAt: null,
    turnDiffSummaries: [],
    supportsConversationRollback: false,
  });
describe("typed native Pi timeline rows", () => {
  it.each(["unconfirmed", "queued", "handled", "not-submitted", "rejected", "unknown"] as const)(
    "keeps hydrated %s authored input outside collapsed work without a message boundary",
    (outcome) => {
      const list = rows(hydrate({ ...submission, outcome, updatedAt: "2026-10-01T00:00:00.000Z" }));
      expect(list.map((row) => row.kind)).toEqual(["work-toggle", "pi-input", "work-toggle"]);
      expect(list[1]).toMatchObject({
        createdAt: date,
        submission: { ...submission, outcome, updatedAt: "2026-10-01T00:00:00.000Z" },
      });
      expect(list[1]?.id).toBe(rows(submission)[1]?.id);
      expect(list.some((row) => row.kind === "message" || row.kind === "activity-group")).toBe(
        false,
      );
    },
  );
});
