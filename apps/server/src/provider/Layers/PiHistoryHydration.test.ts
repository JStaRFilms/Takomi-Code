// @effect-diagnostics nodeBuiltinImport:off - this integration test seeds real session files.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { CommandId, EventId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { extractPiHistory } from "@t3tools/takomi-pi-host/sessionHistory";
import * as Effect from "effect/Effect";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { decideOrchestrationCommand } from "../../orchestration/decider.ts";
import { createEmptyReadModel, projectEvent } from "../../orchestration/projector.ts";
import { toHistoryImportMessages } from "./PiSessionAttach.ts";

/**
 * Full hydration chain: a real Pi session file on disk is extracted,
 * mapped to import messages, and decided into visible thread history —
 * the same events the attach RPC dispatches before starting the session.
 */
describe("Pi history hydration chain", () => {
  it.effect("projects CLI conversation into visible thread messages", () =>
    Effect.gen(function* () {
      const root = yield* Effect.tryPromise(() =>
        NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "takomi-hydrate-")),
      );
      yield* Effect.gen(function* () {
        const file = NodePath.join(root, "session.jsonl");
        yield* Effect.tryPromise(() =>
          NodeFSP.writeFile(
            file,
            [
              {
                type: "session",
                version: 3,
                id: "hydrate-source",
                timestamp: "2026-09-13T19:00:00.000Z",
                cwd: root,
              },
              {
                type: "message",
                id: "m1",
                parentId: null,
                timestamp: "2026-09-13T19:00:01.000Z",
                message: { role: "user", content: "review this app for launch" },
              },
              {
                type: "message",
                id: "m2",
                parentId: "m1",
                timestamp: "2026-09-13T19:00:02.000Z",
                message: {
                  role: "assistant",
                  content: [{ type: "text", text: "reviewing now" }],
                },
              },
              {
                type: "message",
                id: "m3",
                parentId: "m2",
                timestamp: "2026-09-13T19:00:03.000Z",
                message: {
                  role: "toolResult",
                  toolCallId: "call_1",
                  toolName: "read",
                  content: [],
                  isError: false,
                },
              },
            ]
              .map((entry) => `${JSON.stringify(entry)}\n`)
              .join(""),
          ),
        );

        const extraction = yield* Effect.tryPromise(() =>
          extractPiHistory({ file }, { signal: new AbortController().signal }),
        );
        expect(extraction.messages.map((message) => message.text)).toEqual([
          "review this app for launch",
          "reviewing now",
        ]);

        const createdAt = "2026-09-13T20:00:00.000Z";
        const threadId = ThreadId.make("thread-hydration-chain");
        const projectId = ProjectId.make("project-hydration");
        let readModel = yield* projectEvent(createEmptyReadModel(createdAt), {
          sequence: 1,
          eventId: EventId.make("event-hydration-thread-created"),
          aggregateKind: "thread",
          aggregateId: threadId,
          type: "thread.created",
          occurredAt: createdAt,
          commandId: CommandId.make("command-hydration-thread-created"),
          causationEventId: null,
          correlationId: CommandId.make("command-hydration-thread-created"),
          metadata: {},
          payload: {
            threadId,
            projectId,
            title: "Continue: hydrate-source",
            modelSelection: { instanceId: ProviderInstanceId.make("pi"), model: "pi-default" },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt,
            updatedAt: createdAt,
          },
        });

        const events = yield* decideOrchestrationCommand({
          command: {
            type: "thread.history.import",
            commandId: CommandId.make("command-hydration-import"),
            threadId,
            messages: toHistoryImportMessages(threadId, extraction.messages),
          },
          readModel,
        });

        expect(events).toMatchObject([
          {
            type: "thread.message-sent",
            metadata: { historyImport: true },
            payload: { role: "user", text: "review this app for launch", turnId: null },
          },
          {
            type: "thread.message-sent",
            metadata: { historyImport: true },
            payload: { role: "assistant", text: "reviewing now", turnId: null },
          },
          { type: "thread.settled", metadata: { historyImport: true } },
        ]);

        const plannedEvents = Array.isArray(events) ? events : [events];
        for (const [index, event] of plannedEvents.entries()) {
          readModel = yield* projectEvent(readModel, { ...event, sequence: index + 2 });
        }
        const projected = readModel.threads.find((thread) => thread.id === threadId);
        expect(projected?.messages.map((message) => message.text)).toEqual([
          "review this app for launch",
          "reviewing now",
        ]);

        // A later CLI message appends into the non-empty thread without
        // touching settlement, and re-appending the same id is refused.
        const appended = yield* decideOrchestrationCommand({
          command: {
            type: "thread.history.append",
            commandId: CommandId.make("command-hydration-append"),
            threadId,
            messages: toHistoryImportMessages(threadId, [
              {
                role: "user",
                text: "and another thing",
                createdAt: "2026-09-13T19:00:04.000Z",
                recordIndex: 3,
              },
            ]),
          },
          readModel,
        });
        expect(appended).toMatchObject([
          {
            type: "thread.message-sent",
            metadata: { historyImport: true },
            payload: { role: "user", text: "and another thing", turnId: null },
          },
        ]);
        const appendedEvents = Array.isArray(appended) ? appended : [appended];
        expect(
          appendedEvents.find(
            (event) =>
              typeof event === "object" && event !== null && event.type === "thread.settled",
          ),
        ).toBeUndefined();
        for (const [index, event] of appendedEvents.entries()) {
          readModel = yield* projectEvent(readModel, { ...event, sequence: index + 5 });
        }
        expect(
          readModel.threads
            .find((thread) => thread.id === threadId)
            ?.messages.map((message) => message.text),
        ).toEqual(["review this app for launch", "reviewing now", "and another thing"]);

        const duplicate = yield* decideOrchestrationCommand({
          command: {
            type: "thread.history.append",
            commandId: CommandId.make("command-hydration-duplicate"),
            threadId,
            messages: toHistoryImportMessages(threadId, [
              {
                role: "user",
                text: "and another thing",
                createdAt: "2026-09-13T19:00:04.000Z",
                recordIndex: 3,
              },
            ]),
          },
          readModel,
        }).pipe(Effect.flip);
        expect(duplicate._tag).toBe("OrchestrationCommandInvariantError");
      }).pipe(
        Effect.ensuring(
          Effect.tryPromise(() => NodeFSP.rm(root, { recursive: true, force: true })).pipe(
            Effect.ignore,
          ),
        ),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
