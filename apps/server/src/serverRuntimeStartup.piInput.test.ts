import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ApprovalRequestId,
  EventId,
  type OrchestrationCommand,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import * as OrchestrationEngine from "./orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { reconcilePiUserInputs } from "./serverRuntimeStartup.ts";

it.effect("cancels orphaned Pi questions on restart without touching resolved requests", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread-pi");
    const openId = ApprovalRequestId.make("pi-ui-1-input-old");
    const closedId = ApprovalRequestId.make("pi-ui-1-input-closed");
    const dispatched: OrchestrationCommand[] = [];

    yield* reconcilePiUserInputs.pipe(
      Effect.provideService(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
        listPendingPiUserInputs: () =>
          Effect.succeed([
            { threadId, requestId: openId },
            { threadId, requestId: closedId },
          ]),
        getUserInputActivity: ({ requestId }: { readonly requestId: ApprovalRequestId }) =>
          Effect.succeed(
            Option.some({
              id: EventId.make(`request-${requestId}`),
              kind: requestId === openId ? "user-input.requested" : "user-input.resolved",
              tone: "info",
              summary: "Question",
              payload: { requestId },
              turnId: null,
              createdAt: "2026-01-01T00:00:00.000Z",
            }),
          ),
      } as unknown as ProjectionSnapshotQuery.ProjectionSnapshotQuery["Service"]),
      Effect.provideService(OrchestrationEngine.OrchestrationEngineService, {
        readEvents: () => Stream.empty,
        readThreadEvents: () => Stream.empty,
        getThreadReplayStats: () => Effect.die("unused"),
        dispatch: (command) =>
          Effect.sync(() => {
            dispatched.push(command);
            return { sequence: dispatched.length };
          }),
        streamDomainEvents: Stream.empty,
        subscribeDomainEvents: Effect.succeed(Stream.empty),
        latestSequence: Effect.succeed(0),
      }),
      Effect.provide(NodeServices.layer),
    );

    assert.equal(dispatched.length, 1);
    const command = dispatched[0]!;
    if (command.type !== "thread.activity.append") return assert.fail(command.type);
    assert.equal(command.threadId, threadId);
    assert.equal(command.activity.kind, "user-input.resolved");
    assert.deepEqual(command.activity.payload, { requestId: openId, answers: {} });
  }),
);
