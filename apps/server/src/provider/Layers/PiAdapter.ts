import {
  EventId,
  type PiSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderRuntimeEvent,
  type ProviderSession,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape, ProviderThreadSnapshot } from "../Services/ProviderAdapter.ts";

const DRIVER_KIND = ProviderDriverKind.make("pi");

export interface PiAdapterOptions {
  readonly instanceId: ProviderInstanceId;
  readonly environment: Record<string, string | undefined>;
}

export function makePiAdapter(
  _settings: PiSettings,
  options: PiAdapterOptions,
): Effect.Effect<ProviderAdapterShape<ProviderAdapterError>, never, Crypto.Crypto> {
  return Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const sessionsRef = yield* Ref.make<Map<ThreadId, ProviderSession>>(new Map());
    const eventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();

    const startSession = (input: {
      readonly threadId: ThreadId;
      readonly cwd?: string;
      readonly modelSelection?: any;
    }): Effect.Effect<ProviderSession, ProviderAdapterError> =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        const isoNow = now.pipe(DateTime.formatIso);
        const session: ProviderSession = {
          provider: DRIVER_KIND,
          providerInstanceId: options.instanceId,
          status: "ready",
          runtimeMode: "full-access",
          cwd: input.cwd,
          threadId: input.threadId,
          createdAt: isoNow,
          updatedAt: isoNow,
        };

        yield* Ref.update(sessionsRef, (map) => {
          const next = new Map(map);
          next.set(input.threadId, session);
          return next;
        });

        const randomStr = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
        const eventId = EventId.make(`evt_${randomStr.slice(0, 8)}`);
        yield* Queue.offer(eventQueue, {
          type: "session.started",
          eventId,
          provider: DRIVER_KIND,
          providerInstanceId: options.instanceId,
          threadId: input.threadId,
          createdAt: isoNow,
          payload: {
            message: "Pi / Takomi session initialized",
          },
        });

        return session;
      });

    const sendTurn = (input: {
      readonly threadId: ThreadId;
      readonly input?: string;
    }): Effect.Effect<{ threadId: ThreadId; turnId: TurnId }, ProviderAdapterError> =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        const isoNow = now.pipe(DateTime.formatIso);
        const turnId = TurnId.make(`turn_${Date.now()}`);

        const randomStr = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
        const eventId = EventId.make(`evt_${randomStr.slice(0, 8)}`);

        // Emit content delta event for turn
        yield* Queue.offer(eventQueue, {
          type: "content.delta",
          eventId,
          provider: DRIVER_KIND,
          providerInstanceId: options.instanceId,
          threadId: input.threadId,
          turnId,
          createdAt: isoNow,
          payload: {
            streamKind: "assistant_text",
            delta: input.input
              ? `[Takomi] Executing: ${input.input}\n`
              : "[Takomi] Processing turn...\n",
          },
        });

        return {
          threadId: input.threadId,
          turnId,
        };
      });

    const interruptTurn = (_threadId: ThreadId, _turnId?: TurnId) => Effect.void;

    const respondToRequest = () => Effect.void;

    const respondToUserInput = () => Effect.void;

    const stopSession = (threadId: ThreadId) =>
      Ref.update(sessionsRef, (map) => {
        const next = new Map(map);
        next.delete(threadId);
        return next;
      });

    const listSessions = () =>
      Ref.get(sessionsRef).pipe(Effect.map((map) => Array.from(map.values())));

    const hasSession = (threadId: ThreadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((map) => map.has(threadId)));

    const readThread = (threadId: ThreadId): Effect.Effect<ProviderThreadSnapshot> =>
      Effect.succeed({
        threadId,
        turns: [],
      });

    const rollbackThread = (threadId: ThreadId): Effect.Effect<ProviderThreadSnapshot> =>
      Effect.succeed({
        threadId,
        turns: [],
      });

    const stopAll = () => Ref.set(sessionsRef, new Map());

    const streamEvents: Stream.Stream<ProviderRuntimeEvent> = Stream.fromQueue(eventQueue);

    return {
      provider: DRIVER_KIND,
      capabilities: {
        sessionModelSwitch: "in-session",
      },
      startSession: startSession as any,
      sendTurn: sendTurn as any,
      interruptTurn: interruptTurn as any,
      respondToRequest: respondToRequest as any,
      respondToUserInput: respondToUserInput as any,
      stopSession,
      listSessions,
      hasSession,
      readThread,
      rollbackThread,
      stopAll,
      streamEvents,
    };
  });
}
