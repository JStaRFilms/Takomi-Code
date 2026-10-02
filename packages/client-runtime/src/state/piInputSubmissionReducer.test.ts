import { describe, expect, it } from "vite-plus/test";
import {
  ComposerContextId,
  EventId,
  MessageId,
  OrchestrationThread,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  piInputActivityId,
  piInputSubmissionActivity,
  type OrchestrationEvent,
  type PiInputSubmission,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { applyThreadDetailEvent } from "./threadReducer.ts";

const threadJsonSchema = Schema.fromJsonString(OrchestrationThread);
const encodeThreadJson = Schema.encodeSync(threadJsonSchema);
const decodeThreadJson = Schema.decodeSync(threadJsonSchema);
const createdAt = "2026-01-01T00:00:00.000Z";
const threadId = ThreadId.make("thread-1");
const submission: PiInputSubmission = {
  requestId: "request-1",
  threadId,
  providerInstanceId: ProviderInstanceId.make("pi"),
  generation: "original-generation",
  text: "Original text",
  intent: "steer",
  outcome: "unconfirmed",
  fingerprint: "a".repeat(64),
  createdAt,
  updatedAt: createdAt,
  attachments: [
    { type: "image", id: "stored-image", name: "image.png", mimeType: "image/png", sizeBytes: 6 },
    { type: "file", id: "stored-file", name: "notes.txt", mimeType: "text/plain", sizeBytes: 5 },
  ],
  context: {
    version: 1,
    records: [
      {
        version: 1,
        contextId: ComposerContextId.make("image-context"),
        kind: "image",
        label: "Image",
        attachmentId: "stored-image",
        name: "image.png",
        mimeType: "image/png",
        sizeBytes: 6,
      },
    ],
  },
};
const thread: OrchestrationThread = {
  id: threadId,
  projectId: ProjectId.make("project-1"),
  title: "Existing title",
  modelSelection: { instanceId: ProviderInstanceId.make("pi"), model: "model" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt,
  updatedAt: createdAt,
  archivedAt: null,
  deletedAt: null,
  settledOverride: "settled",
  settledAt: createdAt,
  snoozedAt: createdAt,
  snoozedUntil: "2099-01-01T00:00:00.000Z",
  pullRequests: [],
  messages: [
    {
      id: MessageId.make("ordinary-user-message"),
      role: "user",
      text: "Ordinary message",
      turnId: null,
      streaming: false,
      createdAt,
      updatedAt: createdAt,
    },
  ],
  proposedPlans: [],
  checkpoints: [],
  session: null,
  activities: [
    {
      id: EventId.make("later-activity"),
      kind: "test.notice",
      tone: "info",
      turnId: null,
      sequence: 20,
      summary: "Later notice",
      createdAt: "2026-01-02T00:00:00.000Z",
      payload: {},
    },
  ],
};
const eventBase = {
  eventId: EventId.make("input-event"),
  commandId: null,
  causationEventId: null,
  correlationId: null,
  aggregateKind: "thread" as const,
  aggregateId: threadId,
  metadata: {},
  occurredAt: createdAt,
  sequence: 10,
};

describe("typed submission history reducer", () => {
  it("records one authored activity without creating a user-message boundary or changing settlement", () => {
    const event: OrchestrationEvent = {
      ...eventBase,
      type: "thread.pi-input-recorded",
      payload: { threadId, submission, sequence: 10 },
    };
    const recorded = applyThreadDetailEvent(thread, event);
    if (recorded.kind !== "updated") throw new Error("Submission was not recorded");
    const duplicate = applyThreadDetailEvent(recorded.thread, event);
    if (duplicate.kind !== "updated") throw new Error("Duplicate was not reduced");
    expect(duplicate.thread.activities).toEqual([
      piInputSubmissionActivity(submission, 10),
      thread.activities[0],
    ]);
    expect(duplicate.thread.messages).toBe(thread.messages);
    expect(duplicate.thread.latestTurn).toBe(thread.latestTurn);
    expect(duplicate.thread.session).toBe(thread.session);
    expect(duplicate.thread.checkpoints).toBe(thread.checkpoints);
    expect(duplicate.thread.settledOverride).toBe(thread.settledOverride);
    expect(duplicate.thread.snoozedUntil).toBe(thread.snoozedUntil);
    expect(duplicate.thread.title).toBe(thread.title);
  });

  it.each(["queued", "handled", "not-submitted", "rejected", "unknown"] as const)(
    "hydrates %s on the original row even without the recorded page",
    (outcome) => {
      const updated: PiInputSubmission = {
        ...submission,
        outcome,
        updatedAt: "2026-01-03T00:00:00.000Z",
      };
      const event: OrchestrationEvent = {
        ...eventBase,
        eventId: EventId.make("resolution"),
        sequence: 30,
        occurredAt: updated.updatedAt,
        type: "thread.pi-input-resolved",
        payload: { threadId, submission: updated, sequence: 10 },
      };
      for (const previous of [
        thread,
        {
          ...thread,
          activities: [piInputSubmissionActivity(submission, 10), ...thread.activities],
        },
      ]) {
        const reduced = applyThreadDetailEvent(previous, event);
        if (reduced.kind !== "updated") throw new Error("Submission was not resolved");
        const hydrated = decodeThreadJson(encodeThreadJson(reduced.thread));
        expect(hydrated.activities.map((activity) => activity.id)).toEqual([
          piInputActivityId(threadId, submission.requestId),
          "later-activity",
        ]);
        expect(hydrated.activities[0]).toMatchObject({
          sequence: 10,
          turnId: null,
          createdAt,
          payload: updated,
        });
        expect(hydrated.messages).toEqual(thread.messages);
        expect(hydrated.latestTurn).toBeNull();
        expect(hydrated.checkpoints).toEqual([]);
        expect(hydrated.session).toBeNull();
        expect(hydrated.settledAt).toBe(thread.settledAt);
        expect(hydrated.snoozedAt).toBe(thread.snoozedAt);
        expect(hydrated.snoozedUntil).toBe(thread.snoozedUntil);
      }
    },
  );
});
