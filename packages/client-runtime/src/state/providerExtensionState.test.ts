import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  WsRpcGroup,
  WS_METHODS,
  type ProviderExtensionStateSnapshot,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { RpcClient, RpcClientError } from "effect/unstable/rpc";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import type { RpcSession } from "../rpc/session.ts";
import {
  extensionStateSupport,
  threadExtensionStateChanges,
  type ThreadExtensionState,
} from "./providerExtensionState.ts";

const THREAD = ThreadId.make("same-thread");
const snapshot = (generation: string, active = true): ProviderExtensionStateSnapshot => ({
  threadId: THREAD,
  providerInstanceId: ProviderInstanceId.make("pi"),
  generation,
  revision: 1,
  active,
  updatedAt: "2026-09-30T00:00:00.000Z",
  statuses: [],
  widgets: [],
  subtitle: null,
  editorSuggestion: null,
  truncated: false,
  overflow: false,
});
const harness = Effect.fnUntraced(function* (environment = "one") {
  const state = yield* SubscriptionRef.make<SupervisorConnectionState>(AVAILABLE_CONNECTION_STATE);
  const session = yield* SubscriptionRef.make<Option.Option<RpcSession>>(Option.none());
  const prepared = yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none());
  return EnvironmentSupervisor.of({
    target: new PrimaryConnectionTarget({
      environmentId: EnvironmentId.make(environment),
      label: environment,
      httpBaseUrl: "https://example.test",
      wsBaseUrl: "wss://example.test",
    }),
    state,
    session,
    prepared,
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  });
});
const peer = Effect.fnUntraced(function* () {
  const requested = yield* Deferred.make<void>();
  const interrupted = yield* Deferred.make<void>();
  const inputs: unknown[] = [];
  let emit: (value: ProviderExtensionStateSnapshot) => Effect.Effect<void> = () =>
    Effect.die("Subscription not established");
  let fail: (transport: boolean) => Effect.Effect<void> = () =>
    Effect.die("Subscription not established");
  const protocol = yield* RpcClient.Protocol.make((writeResponse) =>
    Effect.succeed({
      send: (clientId, message) => {
        if (message._tag === "Request") {
          expect(message.tag).toBe(WS_METHODS.providerExtensionStateSubscribe);
          inputs.push(message.payload);
          emit = (value) =>
            writeResponse(clientId, { _tag: "Chunk", requestId: message.id, values: [value] });
          fail = (transport) =>
            writeResponse(
              clientId,
              transport
                ? {
                    _tag: "ClientProtocolError",
                    error: new RpcClientError.RpcClientError({
                      reason: new RpcClientError.RpcClientDefect({
                        message: "Synthetic socket failure",
                        cause: undefined,
                      }),
                    }),
                  }
                : {
                    _tag: "Exit",
                    requestId: message.id,
                    exit: {
                      _tag: "Failure",
                      cause: [
                        {
                          _tag: "Fail",
                          error: { _tag: "ProviderExtensionStateError", message: "Unavailable" },
                        },
                      ],
                    },
                  },
            );
          return Deferred.succeed(requested, undefined).pipe(Effect.asVoid);
        }
        if (message._tag === "Interrupt")
          return Deferred.succeed(interrupted, undefined).pipe(Effect.asVoid);
        return Effect.void;
      },
      supportsAck: true,
      supportsTransferables: false,
      codecFor: Schema.toCodecJson,
    }),
  );
  const client = yield* RpcClient.make(WsRpcGroup).pipe(
    Effect.provideService(RpcClient.Protocol, protocol),
  );
  const session: RpcSession = {
    client,
    initialConfig: Effect.never,
    subscribeServerConfig: (input) => client[WS_METHODS.subscribeServerConfig](input),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
  return {
    session,
    requested,
    interrupted,
    inputs,
    emit: (value: ProviderExtensionStateSnapshot) => emit(value),
    fail: (transport: boolean) => fail(transport),
  };
});

const watch = Effect.fnUntraced(function* (supervisor: EnvironmentSupervisor["Service"]) {
  const seen: ThreadExtensionState[] = [];
  const signals: Array<{
    readonly test: (state: ThreadExtensionState) => boolean;
    readonly done: Deferred.Deferred<void>;
  }> = [];
  const fiber = yield* threadExtensionStateChanges(THREAD).pipe(
    Stream.runForEach((state) =>
      Effect.gen(function* () {
        seen.push(state);
        for (const signal of signals)
          if (signal.test(state)) yield* Deferred.succeed(signal.done, undefined);
      }),
    ),
    Effect.provideService(EnvironmentSupervisor, supervisor),
    Effect.forkScoped,
  );
  const wait = (test: (state: ThreadExtensionState) => boolean) =>
    Effect.gen(function* () {
      if (seen.some(test)) return;
      const done = yield* Deferred.make<void>();
      signals.push({ test, done });
      yield* Deferred.await(done);
    });
  return { seen, fiber, wait };
});

describe("shared extension state", () => {
  it("requires explicit capability and distinguishes legacy Pi from other providers", () => {
    expect(extensionStateSupport(undefined)).toBe("unknown");
    expect(extensionStateSupport({ driver: ProviderDriverKind.make("pi") })).toBe("unknown");
    expect(extensionStateSupport({ driver: ProviderDriverKind.make("pi"), capabilities: {} })).toBe(
      "unknown",
    );
    expect(
      extensionStateSupport({ driver: ProviderDriverKind.make("codex"), capabilities: {} }),
    ).toBe("unsupported");
    expect(
      extensionStateSupport({
        driver: ProviderDriverKind.make("pi"),
        capabilities: { extensionState: "text-v1" },
      }),
    ).toBe("supported");
  });
  it.effect(
    "reconnects by current supervisor session, fences old callbacks, and distinguishes inactive current state from disconnected stale data",
    () =>
      Effect.gen(function* () {
        const supervisor = yield* harness();
        const first = yield* peer();
        const second = yield* peer();
        const watching = yield* watch(supervisor);
        yield* watching.wait((state) => state.status === "disconnected" && state.snapshot === null);
        yield* SubscriptionRef.set(supervisor.session, Option.some(first.session));
        yield* Deferred.await(first.requested);
        yield* first.emit(snapshot("first"));
        yield* watching.wait(
          (state) => state.status === "current" && state.snapshot.generation === "first",
        );
        yield* SubscriptionRef.set(supervisor.session, Option.none());
        yield* watching.wait(
          (state) => state.status === "disconnected" && state.snapshot?.generation === "first",
        );
        yield* SubscriptionRef.set(supervisor.session, Option.some(second.session));
        yield* Deferred.await(second.requested);
        yield* Deferred.await(first.interrupted);
        const reconnectIndex = watching.seen.length;
        yield* first.emit(snapshot("late-old"));
        yield* second.emit({
          ...snapshot("wrong-thread"),
          threadId: ThreadId.make("other-thread"),
        });
        yield* second.emit(snapshot("second", false));
        yield* watching.wait(
          (state) => state.status === "current" && state.snapshot.generation === "second",
        );
        expect(
          watching.seen
            .slice(reconnectIndex)
            .some(
              (state) => state.status === "current" && state.snapshot.generation === "late-old",
            ),
        ).toBe(false);
        expect(watching.seen.at(-1)).toMatchObject({
          status: "current",
          snapshot: { generation: "second", active: false },
        });
        expect(first.inputs).toEqual([{ threadId: THREAD }]);
        expect(second.inputs).toEqual([{ threadId: THREAD }]);
        yield* Fiber.interrupt(watching.fiber);
        yield* Deferred.await(second.interrupted);
      }),
  );
  it.effect.each([true, false])(
    "marks retained data disconnected after transport=%s failure without a session change",
    (transport) =>
      Effect.gen(function* () {
        const supervisor = yield* harness();
        const connection = yield* peer();
        const watching = yield* watch(supervisor);
        yield* SubscriptionRef.set(supervisor.session, Option.some(connection.session));
        yield* Deferred.await(connection.requested);
        yield* connection.emit(snapshot("retained"));
        yield* watching.wait((state) => state.status === "current");
        yield* connection.fail(transport);
        yield* watching.wait(
          (state) => state.status === "disconnected" && state.snapshot?.generation === "retained",
        );
        expect(Option.getOrThrow(yield* SubscriptionRef.get(supervisor.session))).toBe(
          connection.session,
        );
        yield* Fiber.interrupt(watching.fiber);
      }),
  );
  it.effect("isolates equal thread IDs in different environments", () =>
    Effect.gen(function* () {
      const one = yield* harness("one");
      const two = yield* harness("two");
      const first = yield* peer();
      const second = yield* peer();
      const left = yield* watch(one);
      const right = yield* watch(two);
      yield* SubscriptionRef.set(one.session, Option.some(first.session));
      yield* SubscriptionRef.set(two.session, Option.some(second.session));
      yield* Deferred.await(first.requested);
      yield* Deferred.await(second.requested);
      yield* first.emit(snapshot("environment-one"));
      yield* second.emit(snapshot("environment-two"));
      yield* left.wait((state) => state.snapshot?.generation === "environment-one");
      yield* right.wait((state) => state.snapshot?.generation === "environment-two");
      expect(left.seen.some((state) => state.snapshot?.generation === "environment-two")).toBe(
        false,
      );
      expect(right.seen.some((state) => state.snapshot?.generation === "environment-one")).toBe(
        false,
      );
      yield* Fiber.interrupt(left.fiber);
      yield* Fiber.interrupt(right.fiber);
    }),
  );
});
