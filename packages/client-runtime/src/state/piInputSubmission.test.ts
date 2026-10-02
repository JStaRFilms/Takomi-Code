import { expect, it } from "@effect/vitest";
import {
  ComposerContextId,
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ProviderDriverKind,
  ThreadId,
  EventId,
  ORCHESTRATION_WS_METHODS,
  WS_METHODS,
  WsRpcGroup,
  ProviderPiQueuedInputError,
  type OrchestrationThreadShell,
  type OrchestrationThreadStreamItem,
  type PiInputSubmission,
  type ProviderSubmitPiQueuedInputInput,
  type ServerConfig,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import { RpcClient } from "effect/unstable/rpc";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type SupervisorConnectionState,
  type PreparedConnection,
  type NetworkStatus,
} from "../connection/model.ts";
import type { ConnectionCatalogEntry } from "../connection/catalog.ts";
import type { RpcSession } from "../rpc/session.ts";
import type { ThreadExtensionState } from "./providerExtensionState.ts";
import {
  createEnvironmentPiInputSubmissionAtoms,
  type PiInputClientState,
} from "./piInputSubmission.ts";

const ENV = EnvironmentId.make("one");
const OTHER_ENV = EnvironmentId.make("two");
const THREAD = ThreadId.make("same-thread");
const PI = ProviderInstanceId.make("pi");
const OTHER = ProviderInstanceId.make("future");
const REF = { environmentId: ENV, threadId: THREAD };
const DATE = "2026-09-30T00:00:00.000Z";
const input: ProviderSubmitPiQueuedInputInput = {
  requestId: "request",
  threadId: THREAD,
  expectedProviderInstanceId: PI,
  expectedGeneration: "first",
  intent: "steer",
  text: "full authored input",
  attachments: [],
};
const submission = (
  outcome: PiInputSubmission["outcome"],
  patch: Partial<PiInputSubmission> = {},
): PiInputSubmission => ({
  requestId: input.requestId,
  threadId: THREAD,
  providerInstanceId: PI,
  generation: "first",
  intent: "steer",
  text: input.text,
  attachments: [],
  createdAt: DATE,
  updatedAt: DATE,
  fingerprint: "a".repeat(64),
  outcome,
  ...patch,
});
const event = (value: PiInputSubmission): OrchestrationThreadStreamItem => ({
  kind: "event",
  event: {
    type: value.outcome === "unconfirmed" ? "thread.pi-input-recorded" : "thread.pi-input-resolved",
    eventId: EventId.make(`event-${value.outcome}`),
    commandId: null,
    causationEventId: null,
    correlationId: null,
    aggregateKind: "thread",
    aggregateId: value.threadId,
    occurredAt: DATE,
    sequence: 900,
    metadata: {},
    payload: { threadId: value.threadId, submission: value, sequence: 3 },
  },
});
const shell: OrchestrationThreadShell = {
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
  settledOverride: "settled",
  settledAt: DATE,
  pullRequests: [],
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
  session: {
    threadId: THREAD,
    status: "ready",
    providerName: "pi",
    providerInstanceId: PI,
    runtimeMode: "full-access",
    activeTurnId: null,
    lastError: null,
    updatedAt: DATE,
  },
};
const extension: ThreadExtensionState = {
  status: "current",
  snapshot: {
    threadId: THREAD,
    providerInstanceId: PI,
    generation: "first",
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
};
const config: ServerConfig = {
  environment: {
    environmentId: ENV,
    label: "test",
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
  providers: [
    {
      instanceId: PI,
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
    },
  ],
  observability: {
    logsDirectoryPath: "/test/logs",
    localTracingEnabled: false,
    otlpTracesEnabled: false,
    otlpMetricsEnabled: false,
    otlpLogsEnabled: false,
  },
  settings: DEFAULT_SERVER_SETTINGS,
};
const peer = Effect.fnUntraced(function* () {
  const subscriptions = yield* Queue.unbounded<{
    emit: (item: OrchestrationThreadStreamItem) => Effect.Effect<void>;
    close: Effect.Effect<void>;
  }>();
  const calls = yield* Queue.unbounded<{
    payload: unknown;
    reply: Effect.Effect<void>;
    reject: Effect.Effect<void>;
  }>();
  const interruptions = yield* Queue.unbounded<void>();
  let writes = 0;
  const protocol = yield* RpcClient.Protocol.make((write) =>
    Effect.succeed({
      send: (clientId, message) => {
        if (
          message._tag === "Request" &&
          message.tag === ORCHESTRATION_WS_METHODS.subscribeThread
        ) {
          expect(message.payload).toEqual({ threadId: THREAD, turnLimit: 1 });
          return Queue.offer(subscriptions, {
            emit: (item) =>
              write(clientId, { _tag: "Chunk", requestId: message.id, values: [item] }),
            close: Effect.suspend(() =>
              write(clientId, {
                _tag: "Exit",
                requestId: message.id,
                exit: { _tag: "Success", value: undefined },
              }),
            ),
          }).pipe(Effect.asVoid);
        }
        if (message._tag === "Request") {
          expect(message.tag).toBe(WS_METHODS.providerSubmitPiQueuedInput);
          writes++;
          return Queue.offer(calls, {
            payload: message.payload,
            reply: Effect.suspend(() =>
              write(clientId, {
                _tag: "Exit",
                requestId: message.id,
                exit: { _tag: "Success", value: { requestId: input.requestId, sequence: 3 } },
              }),
            ),
            reject: Effect.suspend(() =>
              write(clientId, {
                _tag: "Exit",
                requestId: message.id,
                exit: {
                  _tag: "Failure",
                  cause: [
                    {
                      _tag: "Fail",
                      error: new ProviderPiQueuedInputError({ reason: "owner-unavailable" }),
                    },
                  ],
                },
              }),
            ),
          }).pipe(Effect.asVoid);
        }
        if (message._tag === "Interrupt")
          return Queue.offer(interruptions, undefined).pipe(Effect.asVoid);
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
    subscribeServerConfig: (value) => client[WS_METHODS.subscribeServerConfig](value),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
  return { session, calls, subscriptions, interruptions, writes: () => writes };
});
const harness = Effect.fnUntraced(function* () {
  const supervisors = new Map<EnvironmentId, EnvironmentSupervisor["Service"]>();
  for (const id of [ENV, OTHER_ENV])
    supervisors.set(
      id,
      EnvironmentSupervisor.of({
        target: new PrimaryConnectionTarget({
          environmentId: id,
          label: id,
          httpBaseUrl: "https://test",
          wsBaseUrl: "wss://test",
        }),
        state: yield* SubscriptionRef.make<SupervisorConnectionState>({
          ...AVAILABLE_CONNECTION_STATE,
          phase: "connected",
          generation: 1,
        }),
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
  const clock = yield* Clock.Clock;
  let sleepers = 0;
  const trackedClock = Clock.Clock.of({
    ...clock,
    sleep: (duration) =>
      Effect.suspend(() => {
        sleepers++;
        return clock.sleep(duration).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              sleepers--;
            }),
          ),
        );
      }),
  });
  const runtime = Atom.runtime(
    Layer.mergeAll(
      Layer.succeed(EnvironmentRegistry, environments),
      Layer.succeed(Clock.Clock, trackedClock),
    ),
  );
  const shells = Atom.family((id: EnvironmentId) =>
    Atom.make<OrchestrationThreadShell | null>({ ...shell, title: id }).pipe(Atom.keepAlive),
  );
  const extensions = Atom.family((id: EnvironmentId) =>
    Atom.make<ThreadExtensionState>({
      ...extension,
      snapshot: { ...extension.snapshot, generation: id === ENV ? "first" : "second" },
    }).pipe(Atom.keepAlive),
  );
  const configs = Atom.family((id: EnvironmentId) =>
    Atom.make<ServerConfig | null>({
      ...config,
      environment: { ...config.environment, environmentId: id },
    }).pipe(Atom.keepAlive),
  );
  const atoms = createEnvironmentPiInputSubmissionAtoms(runtime, {
    threadShellAtom: (ref) => shells(ref.environmentId),
    configValueAtom: configs,
    extensionStateAtom: (ref) => extensions(ref.environmentId),
  });
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (value) =>
    Effect.sync(() => value.dispose()),
  );
  const wait = (test: (state: PiInputClientState) => boolean) =>
    AtomRegistry.toStream(registry, atoms.stateAtom(REF)).pipe(
      Stream.filter((value) => AsyncResult.isSuccess(value) && test(value.value)),
      Stream.runHead,
    );
  const consumed = { count: 0 };
  const submit = (value = input) =>
    Effect.promise(() =>
      atoms.submit.run(registry, {
        ref: REF,
        input: value,
        consume: () => {
          consumed.count++;
        },
      }),
    );
  return {
    atoms,
    registry,
    supervisor,
    shells,
    extensions,
    configs,
    wait,
    consumed,
    submit,
    sleepers: () => sleepers,
  };
});

it.effect("accepts complete image/file/context outcomes after server id normalization", () =>
  Effect.gen(function* () {
    const h = yield* harness();
    const p = yield* peer();
    h.registry.mount(h.atoms.stateAtom(REF));
    yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
    const stream = yield* Queue.take(p.subscriptions);
    yield* stream.emit({ kind: "synchronized" });
    const full: ProviderSubmitPiQueuedInputInput = {
      ...input,
      attachments: [
        {
          type: "image",
          id: "local-image",
          name: "image.png",
          mimeType: "image/png",
          sizeBytes: 3,
          dataUrl: "data:image/png;base64,YWJj",
        },
        {
          type: "file",
          id: "pending-file",
          name: "notes.txt",
          mimeType: "text/plain",
          sizeBytes: 4,
        },
      ],
      context: {
        version: 1,
        records: [
          {
            version: 1,
            contextId: ComposerContextId.make("image-context"),
            kind: "image",
            label: "Image",
            attachmentId: "local-image",
            name: "image.png",
            mimeType: "image/png",
            sizeBytes: 3,
          },
        ],
      },
    };
    const pending = yield* h.submit(full).pipe(Effect.forkScoped);
    const call = yield* Queue.take(p.calls);
    expect(call.payload).toEqual(full);
    const stored = submission("queued", {
      attachments: full.attachments.map((attachment, index) => ({
        type: attachment.type,
        id: `stored-${index}`,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      })),
      context: {
        version: 1,
        records: [
          {
            version: 1,
            contextId: ComposerContextId.make("image-context"),
            kind: "image",
            label: "Image",
            attachmentId: "stored-0",
            name: "image.png",
            mimeType: "image/png",
            sizeBytes: 3,
          },
        ],
      },
    });
    yield* stream.emit(event(stored));
    yield* h.wait((value) => value.submission?.outcome === "queued");
    expect(h.consumed.count).toBe(1);
    yield* call.reply;
    yield* Fiber.join(pending);
  }).pipe(Effect.scoped),
);

for (const response of ["reply", "reject"] as const)
  it.effect(
    `late recording ${response} cannot clear the next request after native acceptance`,
    () =>
      Effect.gen(function* () {
        const h = yield* harness();
        const p = yield* peer();
        h.registry.mount(h.atoms.stateAtom(REF));
        yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
        const stream = yield* Queue.take(p.subscriptions);
        yield* stream.emit({ kind: "synchronized" });
        const first = yield* h.submit().pipe(Effect.forkScoped);
        const firstCall = yield* Queue.take(p.calls);
        yield* stream.emit(event(submission("queued")));
        yield* h.wait((value) => value.submission?.outcome === "queued");
        const nextInput = { ...input, requestId: "next" };
        const next = yield* h.submit(nextInput).pipe(Effect.forkScoped);
        const nextCall = yield* Queue.take(p.calls);
        yield* firstCall[response];
        yield* Fiber.join(first);
        const state = h.registry.get(h.atoms.stateAtom(REF));
        expect(AsyncResult.isSuccess(state) && state.value.pending && state.value.recording).toBe(
          true,
        );
        expect(h.consumed.count).toBe(1);
        yield* stream.emit(event(submission("handled", { requestId: nextInput.requestId })));
        yield* h.wait(
          (value) => value.submission?.requestId === nextInput.requestId && !value.pending,
        );
        expect(h.consumed.count).toBe(2);
        yield* nextCall.reply;
        yield* Fiber.join(next);
      }).pipe(Effect.scoped),
  );

it.effect(
  "isolates equal thread/request ids across environments and uses the current owner rather than future model",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const one = yield* peer();
      const two = yield* peer();
      const refTwo = { environmentId: OTHER_ENV, threadId: THREAD };
      h.registry.mount(h.atoms.stateAtom(REF));
      h.registry.mount(h.atoms.stateAtom(refTwo));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(one.session));
      yield* SubscriptionRef.set(h.supervisor(OTHER_ENV).session, Option.some(two.session));
      const first = yield* Queue.take(one.subscriptions);
      const second = yield* Queue.take(two.subscriptions);
      yield* first.emit({ kind: "synchronized" });
      yield* second.emit({ kind: "synchronized" });
      let secondConsumed = 0;
      const pendingOne = yield* h.submit().pipe(Effect.forkScoped);
      const pendingTwo = yield* Effect.promise(() =>
        h.atoms.submit.run(h.registry, {
          ref: refTwo,
          input: { ...input, expectedGeneration: "second" },
          consume: () => {
            secondConsumed++;
          },
        }),
      ).pipe(Effect.forkScoped);
      const callOne = yield* Queue.take(one.calls);
      const callTwo = yield* Queue.take(two.calls);
      expect(h.registry.get(h.atoms.sourceAtom(REF))?.owner).toBe(PI);
      yield* first.emit(event(submission("queued")));
      yield* h.wait((value) => value.submission?.outcome === "queued");
      expect(secondConsumed).toBe(0);
      yield* second.emit(event(submission("handled", { generation: "second" })));
      yield* AtomRegistry.toStream(h.registry, h.atoms.stateAtom(refTwo)).pipe(
        Stream.filter(
          (value) => AsyncResult.isSuccess(value) && value.value.submission?.outcome === "handled",
        ),
        Stream.runHead,
      );
      expect(secondConsumed).toBe(1);
      expect(h.consumed.count).toBe(1);
      yield* callOne.reply;
      yield* callTwo.reply;
      yield* Fiber.join(pendingOne);
      yield* Fiber.join(pendingTwo);
      h.registry.set(h.configs(ENV), {
        ...config,
        providers: config.providers.map((provider) => ({
          ...provider,
          capabilities: { queueState: false },
        })),
      });
      expect(h.registry.get(h.atoms.sourceAtom(REF))).toBeNull();
      expect(h.registry.get(h.atoms.sourceAtom(refTwo))?.owner).toBe(PI);
    }).pipe(Effect.scoped),
);

it.effect(
  "installs the hot listener before writing and accepts fast resolution without a retained history scan",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const stream = yield* Queue.take(p.subscriptions);
      const pending = yield* h.submit().pipe(Effect.forkScoped);
      expect(p.writes()).toBe(0);
      yield* stream.emit({ kind: "synchronized" });
      const call = yield* Queue.take(p.calls);
      expect(call.payload).toEqual(input);
      yield* stream.emit(event(submission("queued")));
      yield* h.wait((value) => value.submission?.outcome === "queued");
      expect(h.consumed.count).toBe(1);
      yield* call.reply;
      expect(AsyncResult.isSuccess(yield* Fiber.join(pending))).toBe(true);
    }).pipe(Effect.scoped),
);

for (const outcome of ["queued", "handled", "not-submitted", "rejected", "unknown"] as const)
  it.effect(`consumes only queued/handled originating content, outcome ${outcome}`, () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const stream = yield* Queue.take(p.subscriptions);
      yield* stream.emit({ kind: "synchronized" });
      const pending = yield* h.submit().pipe(Effect.forkScoped);
      const call = yield* Queue.take(p.calls);
      yield* stream.emit(event(submission("unconfirmed")));
      yield* h.wait((value) => value.submission?.outcome === "unconfirmed");
      yield* call.reply;
      yield* Fiber.join(pending);
      expect(h.consumed.count).toBe(0);
      const busy = yield* h.submit({ ...input, requestId: "competing" });
      expect(AsyncResult.isSuccess(busy)).toBe(false);
      expect(p.writes()).toBe(1);
      yield* stream.emit(event(submission(outcome)));
      yield* h.wait((value) => value.submission?.outcome === outcome && !value.pending);
      expect(h.consumed.count).toBe(outcome === "queued" || outcome === "handled" ? 1 : 0);
      yield* stream.emit(event(submission(outcome)));
      expect(h.consumed.count).toBe(outcome === "queued" || outcome === "handled" ? 1 : 0);
    }).pipe(Effect.scoped),
  );

it.effect(
  "ignores other-device/thread/owner/generation/content events and never consumes another environment",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const stream = yield* Queue.take(p.subscriptions);
      yield* stream.emit({ kind: "synchronized" });
      const pending = yield* h.submit().pipe(Effect.forkScoped);
      const call = yield* Queue.take(p.calls);
      for (const patch of [
        { requestId: "other-device" },
        { threadId: ThreadId.make("other-thread") },
        { providerInstanceId: OTHER },
        { generation: "replacement" },
        { text: "other content" },
        { intent: "follow-up" as const },
      ])
        yield* stream.emit(event(submission("queued", patch)));
      yield* stream.emit(event(submission("unconfirmed")));
      yield* h.wait((value) => value.submission?.outcome === "unconfirmed");
      expect(h.consumed.count).toBe(0);
      yield* call.reply;
      yield* Fiber.join(pending);
      yield* stream.emit(event(submission("handled")));
      yield* h.wait((value) => value.submission?.outcome === "handled");
      expect(h.consumed.count).toBe(1);
    }).pipe(Effect.scoped),
);

it.effect(
  "disconnect/reconnect and generation replacement dispose consumption callbacks without replaying writes",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const first = yield* Queue.take(p.subscriptions);
      yield* first.emit({ kind: "synchronized" });
      const pending = yield* h.submit().pipe(Effect.forkScoped);
      yield* (yield* Queue.take(p.calls)).reply;
      yield* Fiber.join(pending);
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.none());
      yield* h.wait((value) => !value.pending);
      const replacement = yield* peer();
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(replacement.session));
      const next = yield* Queue.take(replacement.subscriptions);
      yield* next.emit(event(submission("queued")));
      expect(replacement.writes()).toBe(0);
      expect(h.consumed.count).toBe(0);
      h.registry.set(h.extensions(ENV), {
        ...extension,
        snapshot: { ...extension.snapshot, generation: "replacement" },
      });
      const generation = yield* Queue.take(replacement.subscriptions);
      yield* generation.emit(event(submission("handled")));
      expect(replacement.writes()).toBe(0);
      expect(h.consumed.count).toBe(0);
    }).pipe(Effect.scoped),
);

it.effect(
  "connection generation changes fence same-session callbacks even before transport replacement",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const first = yield* Queue.take(p.subscriptions);
      yield* first.emit({ kind: "synchronized" });
      const pending = yield* h.submit().pipe(Effect.forkScoped);
      yield* (yield* Queue.take(p.calls)).reply;
      yield* Fiber.join(pending);
      yield* SubscriptionRef.set(h.supervisor(ENV).state, {
        ...AVAILABLE_CONNECTION_STATE,
        phase: "offline" as const,
        generation: 2,
      });
      yield* h.wait((value) => !value.pending);
      yield* SubscriptionRef.set(h.supervisor(ENV).state, {
        ...AVAILABLE_CONNECTION_STATE,
        phase: "connected" as const,
        generation: 3,
      });
      const next = yield* Queue.take(p.subscriptions);
      yield* next.emit(event(submission("queued")));
      expect(h.consumed.count).toBe(0);
      expect(p.writes()).toBe(1);
    }).pipe(Effect.scoped),
);

it.effect(
  "missing resolution releases the local slot without acceptance, consumption or retry",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const stream = yield* Queue.take(p.subscriptions);
      yield* stream.emit({ kind: "synchronized" });
      const first = yield* h.submit().pipe(Effect.forkScoped);
      const call = yield* Queue.take(p.calls);
      yield* stream.emit(event(submission("unconfirmed")));
      yield* h.wait((value) => value.submission?.outcome === "unconfirmed");
      yield* call.reply;
      yield* Fiber.join(first);
      yield* TestClock.adjust("1 hour");
      const expired = h.registry.get(h.atoms.stateAtom(REF));
      expect(p.writes()).toBe(1);
      expect(h.consumed.count).toBe(0);
      const next = yield* h
        .submit({ ...input, requestId: "explicit-next" })
        .pipe(Effect.forkScoped);
      yield* Effect.race(
        Queue.take(p.calls).pipe(Effect.flatMap((value) => value.reply)),
        Fiber.join(next),
      );
      expect(AsyncResult.isSuccess(yield* Fiber.join(next))).toBe(true);
      expect(
        AsyncResult.isSuccess(expired) && !expired.value.pending && !expired.value.recording,
      ).toBe(true);
      expect(AsyncResult.isSuccess(expired) && expired.value.submission?.outcome).toBe(
        "unconfirmed",
      );
      expect(AsyncResult.isSuccess(expired) && expired.value.message).toContain("may duplicate");
      expect(h.consumed.count).toBe(0);
      expect(p.writes()).toBe(2);
    }).pipe(Effect.scoped),
);

for (const outcome of ["queued", "handled", "rejected", "unknown", "not-submitted"] as const)
  it.effect(`terminal ${outcome} just before local confirmation expiry cancels its timer`, () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const stream = yield* Queue.take(p.subscriptions);
      yield* stream.emit({ kind: "synchronized" });
      const first = yield* h.submit().pipe(Effect.forkScoped);
      const call = yield* Queue.take(p.calls);
      yield* stream.emit(event(submission("unconfirmed")));
      yield* call.reply;
      yield* Fiber.join(first);
      yield* TestClock.adjust("59 seconds");
      expect(h.sleepers()).toBe(1);
      yield* stream.emit(event(submission(outcome)));
      yield* h.wait((value) => value.submission?.outcome === outcome);
      expect(h.sleepers()).toBe(0);
      yield* TestClock.adjust("1 hour");
      const state = h.registry.get(h.atoms.stateAtom(REF));
      expect(AsyncResult.isSuccess(state) && state.value.submission?.outcome).toBe(outcome);
      expect(AsyncResult.isSuccess(state) && !state.value.pending).toBe(true);
      expect(h.consumed.count).toBe(outcome === "queued" || outcome === "handled" ? 1 : 0);
      expect(p.writes()).toBe(1);
    }).pipe(Effect.scoped),
  );

it.effect(
  "a retired confirmation timer cannot release the next request or retain its callback",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const stream = yield* Queue.take(p.subscriptions);
      yield* stream.emit({ kind: "synchronized" });
      const first = yield* h.submit().pipe(Effect.forkScoped);
      yield* (yield* Queue.take(p.calls)).reply;
      yield* Fiber.join(first);
      yield* TestClock.adjust("59 seconds");
      expect(h.sleepers()).toBe(1);
      yield* stream.emit(event(submission("queued")));
      yield* h.wait((value) => value.submission?.outcome === "queued");
      expect(h.sleepers()).toBe(0);
      const nextInput = { ...input, requestId: "new-window" };
      const next = yield* h.submit(nextInput).pipe(Effect.forkScoped);
      yield* (yield* Queue.take(p.calls)).reply;
      yield* Fiber.join(next);
      yield* stream.emit(event(submission("unconfirmed", { requestId: nextInput.requestId })));
      yield* h.wait((value) => value.submission?.requestId === nextInput.requestId);
      yield* TestClock.adjust("1 second");
      const state = h.registry.get(h.atoms.stateAtom(REF));
      expect(AsyncResult.isSuccess(state) && state.value.pending).toBe(true);
      expect(h.sleepers()).toBe(1);
      expect(h.consumed.count).toBe(1);
      yield* TestClock.adjust("59 seconds");
      yield* h.wait((value) => !value.pending);
      expect(h.sleepers()).toBe(0);
      expect(h.consumed.count).toBe(1);
      expect(p.writes()).toBe(2);
    }).pipe(Effect.scoped),
);

for (const outcome of ["queued", "handled"] as const)
  it.effect(
    `late ${outcome} after local expiry updates confirmation but never consumes the expired draft`,
    () =>
      Effect.gen(function* () {
        const h = yield* harness();
        const p = yield* peer();
        h.registry.mount(h.atoms.stateAtom(REF));
        yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
        const stream = yield* Queue.take(p.subscriptions);
        yield* stream.emit({ kind: "synchronized" });
        const first = yield* h.submit().pipe(Effect.forkScoped);
        const call = yield* Queue.take(p.calls);
        yield* stream.emit(event(submission("unconfirmed")));
        yield* h.wait((value) => value.submission?.outcome === "unconfirmed");
        yield* call.reply;
        yield* Fiber.join(first);
        yield* TestClock.adjust("60 seconds");
        yield* h.wait((value) => !value.pending);
        expect(h.consumed.count).toBe(0);
        expect(h.sleepers()).toBe(0);
        yield* stream.emit(event(submission(outcome)));
        yield* h.wait((value) => value.submission?.outcome === outcome);
        expect(h.consumed.count).toBe(0);
        expect(p.writes()).toBe(1);
      }).pipe(Effect.scoped),
  );

it.effect(
  "an expired request's late acknowledgment cannot consume or overwrite a newer request",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const stream = yield* Queue.take(p.subscriptions);
      yield* stream.emit({ kind: "synchronized" });
      const first = yield* h.submit().pipe(Effect.forkScoped);
      const call = yield* Queue.take(p.calls);
      yield* stream.emit(event(submission("unconfirmed")));
      yield* h.wait((value) => value.submission?.outcome === "unconfirmed");
      yield* call.reply;
      yield* Fiber.join(first);
      yield* TestClock.adjust("60 seconds");
      yield* h.wait((value) => !value.pending);
      const nextInput = { ...input, requestId: "new-after-expiry" };
      const next = yield* h.submit(nextInput).pipe(Effect.forkScoped);
      yield* (yield* Queue.take(p.calls)).reply;
      yield* Fiber.join(next);
      yield* stream.emit(event(submission("queued")));
      yield* stream.emit(event(submission("unconfirmed", { requestId: nextInput.requestId })));
      yield* h.wait((value) => value.submission?.requestId === nextInput.requestId);
      const state = h.registry.get(h.atoms.stateAtom(REF));
      expect(AsyncResult.isSuccess(state) && state.value.pending).toBe(true);
      expect(h.consumed.count).toBe(0);
      yield* stream.emit(event(submission("handled", { requestId: nextInput.requestId })));
      yield* h.wait((value) => value.submission?.outcome === "handled");
      expect(h.consumed.count).toBe(1);
      expect(h.sleepers()).toBe(0);
    }).pipe(Effect.scoped),
);

for (const change of ["generation", "disconnect", "listener", "unmount", "dispose"] as const)
  it.effect(`${change} cancels the confirmation timer without consumption or replay`, () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      const unmount = h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const stream = yield* Queue.take(p.subscriptions);
      yield* stream.emit({ kind: "synchronized" });
      const first = yield* h.submit().pipe(Effect.forkScoped);
      yield* (yield* Queue.take(p.calls)).reply;
      yield* Fiber.join(first);
      yield* TestClock.adjust("0 millis");
      expect(h.sleepers()).toBe(1);
      if (change === "generation")
        h.registry.set(h.extensions(ENV), {
          ...extension,
          snapshot: { ...extension.snapshot, generation: "replacement" },
        });
      if (change === "disconnect")
        yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.none());
      if (change === "listener") {
        yield* stream.close;
        yield* h.wait((value) => value.message?.includes("listener ended") === true);
      } else {
        if (change === "unmount") unmount();
        if (change === "dispose") h.registry.dispose();
        yield* Queue.take(p.interruptions);
      }
      yield* TestClock.adjust("0 millis");
      expect(h.sleepers()).toBe(0);
      yield* TestClock.adjust("1 hour");
      expect(h.consumed.count).toBe(0);
      expect(p.writes()).toBe(1);
    }).pipe(Effect.scoped),
  );

it.effect(
  "stream closure and rejected RPC release pending state and never consume late outcomes",
  () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const p = yield* peer();
      h.registry.mount(h.atoms.stateAtom(REF));
      yield* SubscriptionRef.set(h.supervisor(ENV).session, Option.some(p.session));
      const stream = yield* Queue.take(p.subscriptions);
      yield* stream.emit({ kind: "synchronized" });
      const pending = yield* h.submit().pipe(Effect.forkScoped);
      yield* (yield* Queue.take(p.calls)).reject;
      yield* Fiber.join(pending);
      yield* stream.emit(event(submission("queued")));
      expect(h.consumed.count).toBe(0);
      yield* stream.close;
      yield* h.wait((value) => value.message?.includes("listener ended") === true);
      const denied = yield* h.submit();
      expect(AsyncResult.isSuccess(denied)).toBe(false);
      expect(p.writes()).toBe(1);
    }).pipe(Effect.scoped),
);
