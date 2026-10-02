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
  type ProviderPiSessionStats,
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
  createEnvironmentPiSessionStatsAtoms,
  piSessionStatsLines,
  type PiSessionStatsState,
} from "./piSessionStats.ts";

const PI = ProviderInstanceId.make("pi");
const OTHER = ProviderInstanceId.make("other");
const THREAD = ThreadId.make("same-thread");
const ONE = EnvironmentId.make("one");
const TWO = EnvironmentId.make("two");
const REF = { environmentId: ONE, threadId: THREAD };
const DATE = "2026-09-30T00:00:00.000Z";
const stats = (generation = "first", owner = PI): ProviderPiSessionStats => ({
  threadId: THREAD,
  providerInstanceId: owner,
  generation,
  fetchedAt: DATE,
  source: "pi-native",
  scope: "all-session-entries",
  messages: { user: 2, assistant: 2, toolCalls: 3, toolResults: 3, total: 7 },
  tokens: { input: 1000, output: 1000, cacheRead: 1000, cacheWrite: 1000, total: 4000 },
  cost: { amount: 0, currency: "USD", provenance: "native-reported" },
  contextUsage: {
    tokens: null,
    percent: null,
    contextWindow: 200000,
    provenance: "native-estimate",
  },
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
    capabilities: { sessions: { stats: true } },
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
    readonly reply: (value: ProviderPiSessionStats) => Effect.Effect<void>;
  }>();
  const interrupted = yield* Queue.unbounded<void>();
  const pending = new Map<unknown, Deferred.Deferred<void>>();
  let count = 0;
  const protocol = yield* RpcClient.Protocol.make((write) =>
    Effect.succeed({
      send: (clientId, message) => {
        if (message._tag === "Request") {
          expect(message.tag).toBe(WS_METHODS.providerGetPiSessionStats);
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
  const atoms = createEnvironmentPiSessionStatsAtoms(runtime, {
    threadShellAtom: (ref) => shells(ref.environmentId),
    configValueAtom: configs,
    extensionStateAtom: (ref) => extensions(ref.environmentId),
  });
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (value) =>
    Effect.sync(() => value.dispose()),
  );
  const wait = (ref: ScopedThreadRef, test: (value: PiSessionStatsState) => boolean) =>
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
      expect(read.payload).toEqual({ threadId: THREAD, expectedProviderInstanceId: PI });
      for (let n = 0; n < 20; n++) h.atoms.refresh(h.registry, REF);
      expect(p.count()).toBe(1);
      yield* read.reply(stats());
      yield* h.wait(REF, (state) => state.status === "current");
      h.registry.set(h.shells(ONE), { ...shell(), updatedAt: "2026-10-01T00:00:00.000Z" });
      h.registry.set(h.extensions(ONE), {
        ...extension(),
        snapshot: { ...extension().snapshot, revision: 2 },
      });
      expect(p.count()).toBe(1);
      h.atoms.refresh(h.registry, REF);
      const second = yield* Queue.take(p.calls);
      yield* second.reply(stats());
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
      yield* (yield* Queue.take(first.calls)).reply(stats());
      yield* h.wait(REF, (state) => state.status === "current");
      yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.none());
      yield* h.wait(REF, (state) => state.status === "stale");
      expect(h.registry.get(h.atoms.stateAtom(REF))).toMatchObject({
        canRefresh: false,
        snapshot: { tokens: { total: 4000 } },
      });
      const second = yield* peer();
      yield* SubscriptionRef.set(h.supervisor(ONE).session, Option.some(second.session));
      yield* (yield* Queue.take(second.calls)).reply(stats());
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
    yield* stale.reply(stats("old"));
    yield* current.reply(stats());
    yield* h.wait(REF, (state) => state.status === "current");
    h.atoms.refresh(h.registry, REF);
    const ownerRead = yield* Queue.take(replacement.calls);
    h.registry.set(h.shells(ONE), shell(OTHER));
    h.registry.set(h.extensions(ONE), extension("new", OTHER));
    const next = yield* Queue.take(replacement.calls);
    yield* ownerRead.reply(stats());
    yield* next.reply(stats("new", OTHER));
    yield* h.wait(REF, (state) => state.snapshot?.generation === "new");
    h.atoms.refresh(h.registry, REF);
    const closed = yield* Queue.take(replacement.calls);
    h.registry.set(h.atoms.openAtom(REF), false);
    yield* Deferred.await(closed.interrupted);
    yield* closed.reply({ ...stats("new", OTHER), tokens: { ...stats().tokens, total: 999 } });
    expect(h.registry.get(h.atoms.stateAtom(REF)).snapshot?.tokens.total).not.toBe(999);
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
      yield* (yield* Queue.take(one.calls)).reply(stats());
      yield* (yield* Queue.take(two.calls)).reply({
        ...stats(),
        tokens: { ...stats().tokens, total: 8000 },
      });
      yield* h.wait(REF, (state) => state.status === "current");
      yield* h.wait(refTwo, (state) => state.status === "current");
      expect(h.registry.get(h.atoms.stateAtom(REF)).snapshot?.tokens.total).toBe(4000);
      expect(h.registry.get(h.atoms.stateAtom(refTwo)).snapshot?.tokens.total).toBe(8000);
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
        ...stats(),
        threadId: ThreadId.make("wrong-thread"),
      });
      yield* h.wait(REF, (state) => state.status === "error");
      expect(h.registry.get(h.atoms.stateAtom(REF)).snapshot).toBeNull();
      h.atoms.refresh(h.registry, REF);
      yield* (yield* Queue.take(p.calls)).reply(stats());
      yield* h.wait(REF, (state) => state.status === "current");
      h.atoms.refresh(h.registry, REF);
      yield* (yield* Queue.take(p.calls)).reply(stats("wrong-process"));
      yield* h.wait(REF, (state) => state.status === "error");
      expect(h.registry.get(h.atoms.stateAtom(REF))).toMatchObject({
        message: "Could not refresh. Statistics are last known.",
        snapshot: { generation: "first" },
        canRefresh: true,
      });
    }).pipe(Effect.scoped),
);

it("keeps cumulative usage and zero native USD cost separate from unknown, absent and zero estimated context", () => {
  expect(piSessionStatsLines(stats()).join("\n")).toContain("Cumulative tokens: 4,000");
  expect(piSessionStatsLines(stats()).join("\n")).toContain("unknown until the next response");
  expect(piSessionStatsLines(stats()).join("\n")).toContain("$0 USD");
  expect(piSessionStatsLines({ ...stats(), contextUsage: null }).join("\n")).toContain(
    "estimate: unavailable",
  );
  expect(
    piSessionStatsLines({
      ...stats(),
      contextUsage: { tokens: 0, percent: 0, contextWindow: 200000, provenance: "native-estimate" },
    }).join("\n"),
  ).toContain("estimate: 0 / 200,000 tokens, 0.0%");
});
