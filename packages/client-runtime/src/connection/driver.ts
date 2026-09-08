import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";

import type { ConnectionCatalogEntry } from "./catalog.ts";
import {
  ConnectionTransientError,
  type ConnectionAttemptError,
  type ConnectionAttemptStage,
  type PreparedConnection,
} from "./model.ts";
import * as ConnectionResolver from "./resolver.ts";
import * as RpcSession from "../rpc/session.ts";

export type ConnectionDriverProgress =
  | {
      readonly stage: "preparing";
    }
  | {
      readonly stage: Exclude<ConnectionAttemptStage, "preparing">;
      readonly prepared: PreparedConnection;
    };

export interface EnvironmentConnectionLease {
  readonly prepared: PreparedConnection;
  readonly session: RpcSession.RpcSession;
}

export class ConnectionDriver extends Context.Service<
  ConnectionDriver,
  {
    readonly connect: (
      entry: ConnectionCatalogEntry,
      reportProgress: (progress: ConnectionDriverProgress) => Effect.Effect<void>,
    ) => Effect.Effect<EnvironmentConnectionLease, ConnectionAttemptError, Scope.Scope>;
  }
>()("@t3tools/client-runtime/connection/driver/ConnectionDriver") {}

// The driver now uses the supervisor's single setup deadline, but unit tests
// retain this stage helper to cover the individual timeout diagnostics.
export const CONNECTION_STAGE_TIMEOUT = "15 seconds";

export function withStageDeadline<A, E, R>(
  stage: ConnectionAttemptStage,
  label: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | ConnectionTransientError, R> {
  return Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis;
    let timedOut = false;
    return yield* effect.pipe(
      Effect.timeoutOrElse({
        duration: CONNECTION_STAGE_TIMEOUT,
        orElse: () => {
          timedOut = true;
          return Clock.currentTimeMillis.pipe(
            Effect.flatMap((now) =>
              Effect.fail(
                new ConnectionTransientError({
                  reason: "timeout",
                  detail: `${label} timed out while ${stage}.`,
                  stage,
                  elapsedMs: now - startedAt,
                }),
              ),
            ),
          );
        },
      }),
      Effect.onExit((exit) =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((finishedAt) =>
            Effect.annotateCurrentSpan({
              [`connection.stage.${stage}.duration_ms`]: finishedAt - startedAt,
              [`connection.stage.${stage}.outcome`]: timedOut
                ? "timeout"
                : Exit.isSuccess(exit)
                  ? "success"
                  : "failure",
            }),
          ),
        ),
      ),
    );
  }).pipe(
    Effect.withSpan(`connection.stage.${stage}`, {
      attributes: { "connection.stage": stage },
    }),
  );
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const resolver = yield* ConnectionResolver.ConnectionResolver;
  const sessions = yield* RpcSession.RpcSessionFactory;

  const connect = Effect.fn("ConnectionDriver.connect")(function* (
    entry: ConnectionCatalogEntry,
    reportProgress: (progress: ConnectionDriverProgress) => Effect.Effect<void>,
  ) {
    const target = entry.target;
    yield* Effect.annotateCurrentSpan({
      "connection.environment.id": target.environmentId,
      "connection.target.kind": target._tag,
    });
    yield* reportProgress({ stage: "preparing" });
    const prepared = yield* resolver.prepare(entry);
    yield* reportProgress({ stage: "opening", prepared });
    const session = yield* sessions.connect(prepared);
    yield* reportProgress({ stage: "synchronizing", prepared });
    yield* session.ready;
    return { prepared, session } satisfies EnvironmentConnectionLease;
  });

  return ConnectionDriver.of({ connect });
});

export const layer = Layer.effect(ConnectionDriver, make);
