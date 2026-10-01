import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  WsRpcGroup,
  WS_METHODS,
  type ProviderExtensionStateSnapshot,
  type OrchestrationThreadShell,
  type ServerConfig,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import type { ConnectionCatalogEntry } from "../connection/catalog.ts";
import { EnvironmentRegistry } from "../connection/registry.ts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { RpcClient, RpcClientError } from "effect/unstable/rpc";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type NetworkStatus,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import type { RpcSession } from "../rpc/session.ts";
import {
  createEnvironmentExtensionStateAtoms,
  extensionStateSupport,
  threadExtensionStateChanges,
  type ThreadExtensionState,
  type ThreadExtensionPresentation,
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

const ONE = EnvironmentId.make("one");
const TWO = EnvironmentId.make("two");
const PI = ProviderInstanceId.make("pi");
const CODEX = ProviderInstanceId.make("codex");
const PI_TWO = ProviderInstanceId.make("pi-two");
const REF = { environmentId: ONE, threadId: THREAD };
const DATE = "2026-09-30T00:00:00.000Z";

function provider(
  instanceId: ProviderInstanceId,
  driver: string,
  supported = false,
): ServerProvider {
  return {
    instanceId,
    driver: ProviderDriverKind.make(driver),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "unknown" },
    checkedAt: DATE,
    models: [],
    slashCommands: [],
    skills: [],
    capabilities: supported ? { extensionState: "text-v1" } : {},
  };
}
function config(
  environmentId: EnvironmentId,
  providers: ReadonlyArray<ServerProvider>,
): ServerConfig {
  return {
    environment: {
      environmentId,
      label: environmentId,
      platform: { os: "linux", arch: "x64" },
      serverVersion: "test",
      capabilities: { repositoryIdentity: false },
    },
    auth: {
      policy: "loopback-browser",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["browser-session-cookie"],
      sessionCookieName: "test",
    },
    cwd: "/test",
    keybindingsConfigPath: "/test/keybindings.json",
    keybindings: [],
    issues: [],
    providers,
    availableEditors: [],
    observability: {
      logsDirectoryPath: "/test/logs",
      localTracingEnabled: false,
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
      otlpLogsEnabled: false,
    },
    settings: DEFAULT_SERVER_SETTINGS,
  };
}
function shell(owner: ProviderInstanceId | null = PI): OrchestrationThreadShell {
  return {
    id: THREAD,
    projectId: ProjectId.make("project"),
    title: "Manual thread title",
    modelSelection: { instanceId: CODEX, model: "future-model" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: DATE,
    updatedAt: DATE,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    pullRequests: [],
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    session:
      owner === null
        ? null
        : {
            threadId: THREAD,
            providerInstanceId: owner,
            providerName: "pi",
            status: "ready",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: DATE,
          },
  };
}
const textSnapshot = (generation = "first"): ProviderExtensionStateSnapshot => ({
  ...snapshot(generation),
  statuses: [{ key: "status", text: "Ready" }],
  widgets: [
    {
      key: "widget",
      lines: ["<b>plain text</b>", "https://example.test", "last line"],
      placement: "aboveEditor",
    },
    { key: "widget ", lines: ["below"], placement: "belowEditor" },
  ],
  subtitle: "Runtime title",
  editorSuggestion: { id: "ignored-editor", text: "Do not write this draft" },
});

const boundHarness = Effect.fnUntraced(function* () {
  const one = yield* harness("one");
  const two = yield* harness("two");
  const supervisors = new Map([
    [ONE, one],
    [TWO, two],
  ]);
  const owningSupervisor = (id: EnvironmentId) => {
    const supervisor = supervisors.get(id);
    if (!supervisor) throw new Error("Unexpected environment");
    return supervisor;
  };
  const unexpected = () => Effect.die("Unexpected mutation");
  const environments = EnvironmentRegistry.of({
    entries: yield* SubscriptionRef.make<ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>>(
      new Map(),
    ),
    networkStatus: yield* SubscriptionRef.make<NetworkStatus>("online"),
    start: Effect.void,
    register: unexpected,
    registerPlatform: unexpected,
    reconcilePlatform: unexpected,
    remove: unexpected,
    removeRelayEnvironments: unexpected,
    retryNow: unexpected,
    setEnabled: unexpected,
    setCompatibility: unexpected,
    state: (id) => SubscriptionRef.get(owningSupervisor(id).state),
    stateChanges: (id) => SubscriptionRef.changes(owningSupervisor(id).state),
    run: (id, effect) => Effect.provideService(effect, EnvironmentSupervisor, owningSupervisor(id)),
    runStream: (id, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor, owningSupervisor(id)),
    followStream: (id, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor, owningSupervisor(id)),
  });
  const runtime = Atom.runtime(Layer.succeed(EnvironmentRegistry, environments));
  const shells = Atom.family((_id: EnvironmentId) =>
    Atom.make<OrchestrationThreadShell | null>(shell()).pipe(Atom.keepAlive),
  );
  const configs = Atom.family((id: EnvironmentId) =>
    Atom.make<ServerConfig | null>(
      config(id, [
        provider(PI, "pi", true),
        provider(PI_TWO, "pi", true),
        provider(CODEX, "codex"),
      ]),
    ).pipe(Atom.keepAlive),
  );
  const atoms = createEnvironmentExtensionStateAtoms(runtime, {
    threadShellAtom: (ref) => shells(ref.environmentId),
    configValueAtom: configs,
  });
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  const wait = (ref: typeof REF, test: (value: ThreadExtensionPresentation) => boolean) =>
    AtomRegistry.toStream(registry, atoms.presentationAtom(ref)).pipe(
      Stream.filter(test),
      Stream.runHead,
    );
  return { one, two, registry, atoms, shells, configs, wait };
});

describe("bound extension presentation", () => {
  it.effect(
    "uses the active session owner rather than future model selection, replaces exact keys, clears inactive content, and never projects editor suggestions",
    () =>
      Effect.gen(function* () {
        const h = yield* boundHarness();
        const connection = yield* peer();
        h.registry.mount(h.atoms.presentationAtom(REF));
        yield* SubscriptionRef.set(h.one.session, Option.some(connection.session));
        yield* Deferred.await(connection.requested);
        yield* connection.emit(textSnapshot());
        yield* h.wait(REF, (value) => value.subtitle?.text === "Runtime title");
        const first = h.registry.get(h.atoms.presentationAtom(REF));
        expect(first.statuses.map((entry) => [entry.key, entry.text])).toEqual([
          ["status", "Ready"],
        ]);
        expect(first.aboveEditor.map((entry) => [entry.key, entry.text])).toEqual([
          ["widget", "<b>plain text</b>\nhttps://example.test\nlast line"],
        ]);
        expect(first.belowEditor.map((entry) => entry.key)).toEqual(["widget "]);
        expect(first).not.toHaveProperty("editorSuggestion");
        expect(h.registry.get(h.shells(ONE))?.title).toBe("Manual thread title");
        yield* connection.emit({
          ...textSnapshot(),
          revision: 2,
          statuses: [{ key: "status", text: "Changed" }],
          widgets: [{ key: "widget", lines: ["replacement"], placement: "belowEditor" }],
          subtitle: "",
        });
        yield* h.wait(REF, (value) => value.statuses[0]?.text === "Changed");
        const replaced = h.registry.get(h.atoms.presentationAtom(REF));
        expect(replaced.subtitle).toBeNull();
        expect(replaced.aboveEditor).toEqual([]);
        expect(replaced.belowEditor.map((entry) => entry.text)).toEqual(["replacement"]);
        yield* connection.emit({ ...snapshot("first"), revision: 3 });
        yield* h.wait(
          REF,
          (value) => value.statuses.length === 0 && value.belowEditor.length === 0,
        );
        yield* connection.emit({ ...textSnapshot("ended"), active: false });
        yield* AtomRegistry.toStream(h.registry, h.atoms.stateAtom(REF)).pipe(
          Stream.filter(
            (state) =>
              state.status === "current" &&
              state.snapshot.generation === "ended" &&
              !state.snapshot.active,
          ),
          Stream.runHead,
        );
        expect(h.registry.get(h.atoms.presentationAtom(REF))).toMatchObject({
          subtitle: null,
          statuses: [],
          aboveEditor: [],
          belowEditor: [],
        });
        expect(connection.inputs).toEqual([{ threadId: THREAD }]);
      }),
  );

  it.effect(
    "labels retained snapshots and omitted text, fences a new owner, and reopens only new-generation content on reconnect",
    () =>
      Effect.gen(function* () {
        const h = yield* boundHarness();
        const first = yield* peer();
        const next = yield* peer();
        h.registry.mount(h.atoms.presentationAtom(REF));
        yield* SubscriptionRef.set(h.one.session, Option.some(first.session));
        yield* Deferred.await(first.requested);
        yield* first.emit({ ...textSnapshot(), truncated: true });
        yield* h.wait(REF, (value) => value.omitted);
        const id = h.registry.get(h.atoms.presentationAtom(REF)).statuses[0]?.id;
        yield* SubscriptionRef.set(h.one.session, Option.none());
        yield* h.wait(REF, (value) => value.notice?.includes("Disconnected") === true);
        expect(h.registry.get(h.atoms.presentationAtom(REF)).subtitle?.text).toBe("Runtime title");
        h.registry.set(h.shells(ONE), shell(PI_TWO));
        expect(h.registry.get(h.atoms.presentationAtom(REF)).subtitle).toBeNull();
        yield* SubscriptionRef.set(h.one.session, Option.some(next.session));
        yield* Deferred.await(next.requested);
        yield* next.emit({ ...textSnapshot("second"), providerInstanceId: PI_TWO, overflow: true });
        yield* h.wait(REF, (value) => value.subtitle !== null && value.notice === null);
        const current = h.registry.get(h.atoms.presentationAtom(REF));
        expect(current.omitted).toBe(true);
        expect(current.statuses[0]?.id).not.toBe(id);
        yield* SubscriptionRef.set(h.one.session, Option.none());
        yield* h.wait(REF, (value) => value.notice?.includes("Disconnected") === true);
        yield* SubscriptionRef.set(h.one.session, Option.some(first.session));
        yield* h.wait(REF, (value) => value.notice?.includes("Reconnecting") === true);
        expect(h.registry.get(h.atoms.presentationAtom(REF)).notice).toContain("last known");
      }),
  );

  it.effect("isolates same-thread output and support metadata by owning environment", () =>
    Effect.gen(function* () {
      const h = yield* boundHarness();
      const one = yield* peer();
      const two = yield* peer();
      const refTwo = { environmentId: TWO, threadId: THREAD };
      h.registry.mount(h.atoms.presentationAtom(REF));
      h.registry.mount(h.atoms.presentationAtom(refTwo));
      yield* SubscriptionRef.set(h.one.session, Option.some(one.session));
      yield* SubscriptionRef.set(h.two.session, Option.some(two.session));
      yield* Deferred.await(one.requested);
      yield* Deferred.await(two.requested);
      yield* one.emit({ ...textSnapshot("one"), subtitle: "One" });
      yield* two.emit({ ...textSnapshot("two"), subtitle: "Two" });
      yield* h.wait(REF, (value) => value.subtitle?.text === "One");
      yield* h.wait(refTwo, (value) => value.subtitle?.text === "Two");
      expect(h.registry.get(h.atoms.presentationAtom(REF)).statuses[0]?.id).not.toBe(
        h.registry.get(h.atoms.presentationAtom(refTwo)).statuses[0]?.id,
      );
      h.registry.set(h.configs(TWO), config(TWO, [provider(PI, "pi")]));
      expect(h.registry.get(h.atoms.presentationAtom(refTwo)).notice).toContain("unknown");
      expect(h.registry.get(h.atoms.presentationAtom(refTwo)).subtitle).toBeNull();
      expect(h.registry.get(h.atoms.presentationAtom(REF)).subtitle?.text).toBe("One");
    }),
  );

  it.effect("does not authorize an active non-Pi owner using a future Pi model choice", () =>
    Effect.gen(function* () {
      const h = yield* boundHarness();
      const connection = yield* peer();
      yield* SubscriptionRef.set(h.one.session, Option.some(connection.session));
      h.registry.set(h.shells(ONE), {
        ...shell(CODEX),
        modelSelection: { instanceId: PI, model: "future-pi" },
      });
      h.registry.mount(h.atoms.presentationAtom(REF));
      expect(h.registry.get(h.atoms.stateAtom(REF))).toMatchObject({
        status: "unsupported",
        support: "unsupported",
      });
      expect(connection.inputs).toEqual([]);
    }),
  );

  it.effect.each(["codex", "pi", "missing"])(
    "does not subscribe when owning provider support is %s",
    (kind) =>
      Effect.gen(function* () {
        const h = yield* boundHarness();
        const connection = yield* peer();
        yield* SubscriptionRef.set(h.one.session, Option.some(connection.session));
        h.registry.set(h.configs(ONE), config(ONE, kind === "missing" ? [] : [provider(PI, kind)]));
        h.registry.mount(h.atoms.presentationAtom(REF));
        expect(h.registry.get(h.atoms.stateAtom(REF))).toMatchObject({
          status: "unsupported",
          support: kind === "codex" ? "unsupported" : "unknown",
        });
        expect(h.registry.get(h.atoms.presentationAtom(REF)).subtitle).toBeNull();
        expect(connection.inputs).toEqual([]);
      }),
  );
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
