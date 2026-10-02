import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  WS_METHODS,
  WsRpcGroup,
  type OrchestrationThreadShell,
  type ProviderPiQueueState,
  type ScopedThreadRef,
  type ServerConfig,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import { RpcClient } from "effect/unstable/rpc";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type NetworkStatus,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import type { ConnectionCatalogEntry } from "../connection/catalog.ts";
import type { RpcSession } from "../rpc/session.ts";
import type { ThreadExtensionState } from "./providerExtensionState.ts";
import {
  createEnvironmentPiQueueStateAtoms,
  piQueueStateLines,
  type PiQueueState,
} from "./piQueueState.ts";

const PI = ProviderInstanceId.make("pi");
const OTHER = ProviderInstanceId.make("other");
const THREAD = ThreadId.make("same-thread");
const ONE = EnvironmentId.make("one");
const TWO = EnvironmentId.make("two");
const REF = { environmentId: ONE, threadId: THREAD };
const DATE = "2026-09-30T00:00:00.000Z";
const queueState = (generation = "first", owner = PI): ProviderPiQueueState => ({
  threadId: THREAD,
  providerInstanceId: owner,
  generation,
  fetchedAt: DATE,
  source: "pi-native",
  pendingMessageCount: 4,
  steeringMode: "all",
  followUpMode: "one-at-a-time",
  isStreaming: true,
  isCompacting: false,
});
const shell = (owner = PI): OrchestrationThreadShell => ({
  id: THREAD,
  projectId: ProjectId.make("project"),
  title: "Manual title",
  modelSelection: { instanceId: OTHER, model: "future" },
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
  session: {
    threadId: THREAD,
    status: "ready",
    providerName: "pi",
    providerInstanceId: owner,
    runtimeMode: "full-access",
    activeTurnId: null,
    lastError: null,
    updatedAt: DATE,
  },
});
const extension = (generation = "first", owner = PI) =>
  ({
    status: "current",
    snapshot: {
      threadId: THREAD,
      providerInstanceId: owner,
      generation,
      active: true,
      revision: 1,
      updatedAt: DATE,
      statuses: [],
      widgets: [],
      subtitle: null,
      editorSuggestion: null,
      truncated: false,
      overflow: false,
    },
  }) satisfies ThreadExtensionState;
const config = (id: EnvironmentId): ServerConfig => ({
  environment: {
    environmentId: id,
    label: id,
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
  keybindingsConfigPath: "/test/keys",
  keybindings: [],
  issues: [],
  availableEditors: [],
  providers: [PI, OTHER].map((instanceId) => ({
    instanceId,
    driver: ProviderDriverKind.make("pi"),
    enabled: true,
    installed: true,
    version: "0.99.1",
    status: "ready",
    auth: { status: "unknown" },
    checkedAt: DATE,
    models: [],
    slashCommands: [],
    skills: [],
    capabilities: { queueState: true },
  })),
  observability: {
    logsDirectoryPath: "/test/logs",
    localTracingEnabled: false,
    otlpTracesEnabled: false,
    otlpMetricsEnabled: false,
    otlpLogsEnabled: false,
  },
  settings: DEFAULT_SERVER_SETTINGS,
});

const peer = Effect.fnUntraced(function* () {
  const calls = yield* Queue.unbounded<{
    readonly payload: unknown;
    readonly interrupted: Deferred.Deferred<void>;
    readonly reply: (value: ProviderPiQueueState) => Effect.Effect<void>;
  }>();
  const interrupted = yield* Queue.unbounded<void>();
  const pending = new Map<unknown, Deferred.Deferred<void>>();
  let count = 0;
  const protocol = yield* RpcClient.Protocol.make((write) =>
    Effect.succeed({
      send: (clientId, message) => {
        if (message._tag === "Request") {
          expect(message.tag).toBe(WS_METHODS.providerGetPiQueueState);
          count++;
          return Effect.gen(function* () {
            const done = yield* Deferred.make<void>();
            pending.set(message.id, done);
            yield* Queue.offer(calls, {
              payload: message.payload,
              interrupted: done,
              reply: (value) =>
                write(clientId, {
                  _tag: "Exit",
                  requestId: message.id,
                  exit: { _tag: "Success", value },
                }),
            });
          });
        }
        if (message._tag === "Interrupt") {
          const done = pending.get(message.requestId);
          return (done ? Deferred.succeed(done, undefined) : Effect.void).pipe(
            Effect.andThen(Queue.offer(interrupted, undefined)),
            Effect.asVoid,
          );
        }
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
  return { session, calls, interrupted, count: () => count };
});
const harness = Effect.fnUntraced(function* () {
  const supervisors = new Map<EnvironmentId, EnvironmentSupervisor["Service"]>();
  for (const id of [ONE, TWO])
    supervisors.set(
      id,
      EnvironmentSupervisor.of({
        target: new PrimaryConnectionTarget({
          environmentId: id,
          label: id,
          httpBaseUrl: "https://test",
          wsBaseUrl: "wss://test",
        }),
        state: yield* SubscriptionRef.make<SupervisorConnectionState>(AVAILABLE_CONNECTION_STATE),
        session: yield* SubscriptionRef.make<Option.Option<RpcSession>>(Option.none()),
        prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none()),
        connect: Effect.void,
        disconnect: Effect.void,
        retryNow: Effect.void,
      }),
    );
  const supervisor = (id: EnvironmentId) => {
    const value = supervisors.get(id);
    if (!value) throw new Error("Unexpected environment");
    return value;
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
    state: (id) => SubscriptionRef.get(supervisor(id).state),
    stateChanges: (id) => SubscriptionRef.changes(supervisor(id).state),
    run: (id, effect) => Effect.provideService(effect, EnvironmentSupervisor, supervisor(id)),
    runStream: (id, stream) => Stream.provideService(stream, EnvironmentSupervisor, supervisor(id)),
    followStream: (id, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor, supervisor(id)),
  });
  const runtime = Atom.runtime(Layer.succeed(EnvironmentRegistry, environments));
  const shells = Atom.family((_id: EnvironmentId) =>
    Atom.make<OrchestrationThreadShell | null>(shell()).pipe(Atom.keepAlive),
  );
  const extensions = Atom.family((_id: EnvironmentId) =>
    Atom.make<ThreadExtensionState>(extension()).pipe(Atom.keepAlive),
  );
  const configs = Atom.family((id: EnvironmentId) =>
    Atom.make<ServerConfig | null>(config(id)).pipe(Atom.keepAlive),
  );
  const atoms = createEnvironmentPiQueueStateAtoms(runtime, {
    threadShellAtom: (ref) => shells(ref.environmentId),
    configValueAtom: configs,
    extensionStateAtom: (ref) => extensions(ref.environmentId),
  });
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (value) =>
    Effect.sync(() => value.dispose()),
  );
  const wait = (ref: ScopedThreadRef, test: (value: PiQueueState) => boolean) =>
    AtomRegistry.toStream(registry, atoms.stateAtom(ref)).pipe(Stream.filter(test), Stream.runHead);
  return { registry, atoms, supervisor, shells, extensions, configs, wait };
});

it.effect(
  "reads only on open/refresh, coalesces pending refreshes and ignores unrelated shell or extension updates",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.some(p.session));
      yield* h.wait(REF, (state) => state.status === "loading");
      expect(p.count()).toBe(0);
      h.registry.set(h.atoms.openAtom(REF), true);
      const read = yield* Queue.take(p.calls);
      expect(read.payload).toEqual({
        threadId: THREAD,
        expectedProviderInstanceId: PI,
        expectedGeneration: "first",
      });
      for (let n = 0; n < 20; n++) h.atoms.refresh(h.registry, REF);
      expect(p.count()).toBe(1);
      yield* read.reply(queueState());
      yield* h.wait(REF, (state) => state.status === "current");
      h.registry.set(h.shells(ONE), { ...shell(), updatedAt: "2026-10-01T00:00:00.000Z" });
      h.registry.set(h.extensions(ONE), {
        ...extension(),
        snapshot: { ...extension().snapshot, revision: 2 },
      });
      expect(p.count()).toBe(1);
      h.atoms.refresh(h.registry, REF);
      const second = yield* Queue.take(p.calls);
      yield* second.reply(queueState());
      yield* h.wait(REF, (state) => state.status === "current");
      expect(p.count()).toBe(2);
    }).pipe(Effect.scoped),
);

it.effect(
  "retains labeled last-known data on disconnect and reads once on reconnect only while open",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const first = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      h.registry.set(h.atoms.openAtom(REF), true);
      yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.some(first.session));
      yield* (yield* Queue.take(first.calls)).reply(queueState());
      yield* h.wait(REF, (state) => state.status === "current");
      yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.none());
      yield* h.wait(REF, (state) => state.status === "stale");
      expect(h.registry.get(h.atoms.stateAtom(REF))).toMatchObject({
        canRefresh: false,
        snapshot: { pendingMessageCount: 4 },
      });
      const second = yield* peer();
      yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.some(second.session));
      yield* (yield* Queue.take(second.calls)).reply(queueState());
      yield* h.wait(REF, (state) => state.status === "current");
      expect(second.count()).toBe(1);
      h.registry.set(h.atoms.openAtom(REF), false);
      yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.none());
      const third = yield* peer();
      yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.some(third.session));
      yield* h.wait(REF, (state) => state.status === "stale");
      expect(third.count()).toBe(0);
    }).pipe(Effect.scoped),
);

it.effect("discards late responses after transport, owner/process and navigation changes", () =>
  Effect.gen(function* () {
    const h = yield* harness();
    const first = yield* peer();
    h.registry.mount(h.atoms.stateAtom(REF));
    h.registry.set(h.atoms.openAtom(REF), true);
    yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.some(first.session));
    const stale = yield* Queue.take(first.calls);
    const replacement = yield* peer();
    yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.some(replacement.session));
    const current = yield* Queue.take(replacement.calls);
    yield* stale.reply(queueState("old"));
    yield* current.reply(queueState());
    yield* h.wait(REF, (state) => state.status === "current");
    h.atoms.refresh(h.registry, REF);
    const ownerRead = yield* Queue.take(replacement.calls);
    h.registry.set(h.shells(ONE), shell(OTHER));
    h.registry.set(h.extensions(ONE), extension("new", OTHER));
    const next = yield* Queue.take(replacement.calls);
    yield* ownerRead.reply(queueState());
    yield* next.reply(queueState("new", OTHER));
    yield* h.wait(REF, (state) => state.snapshot?.generation === "new");
    h.atoms.refresh(h.registry, REF);
    const closed = yield* Queue.take(replacement.calls);
    h.registry.set(h.atoms.openAtom(REF), false);
    yield* Deferred.await(closed.interrupted);
    yield* closed.reply({ ...queueState("new", OTHER), pendingMessageCount: 999 });
    expect(h.registry.get(h.atoms.stateAtom(REF)).snapshot?.pendingMessageCount).not.toBe(999);
  }).pipe(Effect.scoped),
);

it.effect(
  "isolates identical thread IDs across environments and withholds unavailable support without selecting the future owner",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const one = yield* peer();
      const two = yield* peer();
      const refTwo = { ...REF, environmentId: TWO };
      for (const [ref, p] of [
        [REF, one],
        [refTwo, two],
      ] as const) {
        h.registry.mount(h.atoms.stateAtom(ref));
        h.registry.set(h.atoms.openAtom(ref), true);
        yield* SubscriptionRef.set(h.supervisor(ref.environmentId).session, Option.some(p.session));
      }
      yield* (yield* Queue.take(one.calls)).reply(queueState());
      yield* (yield* Queue.take(two.calls)).reply({
        ...queueState(),
        pendingMessageCount: 8,
      });
      yield* h.wait(REF, (state) => state.status === "current");
      yield* h.wait(refTwo, (state) => state.status === "current");
      expect(h.registry.get(h.atoms.stateAtom(REF)).snapshot?.pendingMessageCount).toBe(4);
      expect(h.registry.get(h.atoms.stateAtom(refTwo)).snapshot?.pendingMessageCount).toBe(8);
      h.registry.set(h.configs(ONE), {
        ...config(ONE),
        providers: config(ONE).providers.map((p) =>
          p.instanceId === PI ? { ...p, capabilities: {} } : p,
        ),
      });
      yield* h.wait(REF, (state) => state.status === "unavailable");
      expect(h.registry.get(h.atoms.stateAtom(REF)).snapshot).toBeNull();
      expect(one.count()).toBe(1);
    }).pipe(Effect.scoped),
);

it.effect(
  "rejects wrong thread and process results, labels prior data last known, and permits an explicit retry",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      h.registry.set(h.atoms.openAtom(REF), true);
      yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.some(p.session));
      yield* (yield* Queue.take(p.calls)).reply({
        ...queueState(),
        threadId: ThreadId.make("wrong-thread"),
      });
      yield* h.wait(REF, (state) => state.status === "error");
      expect(h.registry.get(h.atoms.stateAtom(REF)).snapshot).toBeNull();
      h.atoms.refresh(h.registry, REF);
      yield* (yield* Queue.take(p.calls)).reply(queueState());
      yield* h.wait(REF, (state) => state.status === "current");
      h.atoms.refresh(h.registry, REF);
      yield* (yield* Queue.take(p.calls)).reply(queueState("wrong-process"));
      yield* h.wait(REF, (state) => state.status === "error");
      expect(h.registry.get(h.atoms.stateAtom(REF))).toMatchObject({
        message: "Could not refresh. Queue state is last known.",
        snapshot: { generation: "first" },
        canRefresh: true,
      });
    }).pipe(Effect.scoped),
);

it("shows only a combined native count, read-only modes and unavailable contents, separate from local drafts", () => {
  const lines = piQueueStateLines(queueState()).join("\n");
  expect(lines).toContain("Native queued messages: 4 combined");
  expect(lines).toContain("Separate from local waiting drafts");
  expect(lines).toContain("Queue contents are unavailable");
  expect(lines).toContain("Steering delivery: All");
  expect(lines).toContain("Follow-up delivery: One at a time");
  expect(lines).toContain("Delivery modes are read-only");
  expect(piQueueStateLines({ ...queueState(), pendingMessageCount: 0 }).join("\n")).toContain(
    "0 combined",
  );
});

it.effect("disposal cancels a pending queue read and cannot publish its late response", () =>
  Effect.gen(function* () {
    const h = yield* harness();
    const p = yield* peer();
    h.registry.mount(h.atoms.stateAtom(REF));
    h.registry.set(h.atoms.openAtom(REF), true);
    yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.some(p.session));
    const read = yield* Queue.take(p.calls);
    h.registry.dispose();
    yield* Deferred.await(read.interrupted);
    yield* read.reply(queueState());
    expect(p.count()).toBe(1);
  }).pipe(Effect.scoped),
);
