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

// Each deadline starts only when its own stage starts. The supervisor retains
// a 50-second ceiling, so a healthy slow preparation cannot consume sync time.
export const CONNECTION_STAGE_TIMEOUT = "15 seconds";

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
    const prepared = yield* withStageDeadline("preparing", target.label, resolver.prepare(entry));
    yield* reportProgress({ stage: "opening", prepared });
    const session = yield* withStageDeadline(
      "opening",
      target.label,
      Effect.gen(function* () {
        const openedSession = yield* sessions.connect(prepared);
        yield* openedSession.opened ?? Effect.void;
        return openedSession;
      }),
    );
    yield* reportProgress({ stage: "synchronizing", prepared });
    yield* withStageDeadline("synchronizing", target.label, session.ready);
    return { prepared, session } satisfies EnvironmentConnectionLease;
  });

  return ConnectionDriver.of({ connect });
});

export const layer = Layer.effect(ConnectionDriver, make);
