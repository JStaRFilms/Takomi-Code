import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ApprovalRequestId,
  ProviderInstanceId,
  ProviderDriverKind,
  ThreadId,
  type ProviderRuntimeEvent,
  type ProviderInstanceConfigMap,
} from "@t3tools/contracts";
import { expect, it, vi } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { ProviderSessionRuntimeRepository } from "../../persistence/ProviderSessionRuntime.ts";
import * as ProviderSessionRuntime from "../../persistence/ProviderSessionRuntime.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import * as AnalyticsService from "../../telemetry/AnalyticsService.ts";
import { PiDriver } from "../Drivers/PiDriver.ts";
import { ProviderExtensionState, type ExtensionStartAdmission } from "../ProviderExtensionState.ts";
import { ProviderValidationError } from "../Errors.ts";
import { ProviderInstanceRegistry } from "../Services/ProviderInstanceRegistry.ts";
import { ProviderInstanceRegistryMutator } from "../Services/ProviderInstanceRegistryMutator.ts";
import { ProviderAdapterRegistry } from "../Services/ProviderAdapterRegistry.ts";
import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";
import { ProviderService } from "../Services/ProviderService.ts";
import { ProviderAdapterRegistryLive } from "./ProviderAdapterRegistry.ts";
import { ProviderInstanceRegistryMutableLayer } from "./ProviderInstanceRegistryLive.ts";
import { ProviderSessionDirectoryLive } from "./ProviderSessionDirectory.ts";
import { ProviderServiceLive } from "./ProviderService.ts";
import { ProviderEventLoggers } from "./ProviderEventLoggers.ts";

const PI = ProviderInstanceId.make("controlled-pi");
const THREAD = ThreadId.make("controlled-thread");
const decoder = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);
const encoder = new TextEncoder();
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const makePeer = Effect.fnUntraced(function* (index: number) {
  const output = yield* Queue.unbounded<Uint8Array, Cause.Done>();
  const exited = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
  const requestedState = yield* Deferred.make<void>();
  const releaseState = yield* Deferred.make<void>();
  const stopped = yield* Deferred.make<void>();
  const releaseSpawn = yield* Deferred.make<void>();
  const secretReceived = yield* Deferred.make<unknown>();
  let queueReads = 0;
  const requestedQueue = yield* Deferred.make<string>();
  const releaseQueue = yield* Deferred.make<void>();
  let queue: unknown = {
    pendingMessageCount: 4,
    steeringMode: "all",
    followUpMode: "one-at-a-time",
    isStreaming: true,
    isCompacting: false,
    sessionFile: "/private/queue.jsonl",
    sessionId: "private-queue-id",
    model: { secret: "private-queue-model" },
    steering: ["PRIVATE_QUEUE_TEXT"],
  };
  const requestedStats = yield* Deferred.make<string>();
  const releaseStats = yield* Deferred.make<void>();
  let stats: unknown = {
    sessionFile: "/private/stats.jsonl",
    sessionId: "private-native-id",
    userMessages: 2,
    assistantMessages: 3,
    toolCalls: 4,
    toolResults: 4,
    totalMessages: 9,
    tokens: { input: 100, output: 20, cacheRead: 30, cacheWrite: 5, total: 155 },
    cost: 0,
    contextUsage: { tokens: null, contextWindow: 200000, percent: null },
    details: { secret: "private-stats-detail" },
  };
  let failState = false;
  const emit = (record: Record<string, unknown>) =>
    Queue.offer(output, encoder.encode(`${encodeJson(record)}\n`)).pipe(Effect.asVoid);
  const end = Deferred.succeed(exited, ChildProcessSpawner.ExitCode(0)).pipe(
    Effect.andThen(Queue.shutdown(output)),
    Effect.asVoid,
  );
  yield* emit({
    type: "extension_ui_request",
    method: "setWidget",
    widgetKey: "startup",
    widgetLines: [`startup-${index}`],
    widgetPlacement: "belowEditor",
  });
  yield* emit({ type: "extension_ui_request", method: "setTitle", title: "Runtime subtitle" });
  const handle = ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(index + 1),
    exitCode: Deferred.await(exited),
    isRunning: Deferred.isDone(exited).pipe(Effect.map((done) => !done)),
    kill: () => end,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.forEach((bytes: Uint8Array) =>
      Effect.gen(function* () {
        const request = decoder(new TextDecoder().decode(bytes));
        if (typeof request.id === "string" && request.id.startsWith("t3-pi-queue-state-")) {
          expect(request.type).toBe("get_state");
          queueReads++;
          yield* Deferred.succeed(requestedQueue, request.id);
          yield* Deferred.await(releaseQueue);
          yield* emit({
            type: "response",
            command: "get_state",
            id: request.id,
            success: true,
            data: queue,
          });
          return;
        }
        if (request.type === "get_state") {
          yield* Deferred.succeed(requestedState, undefined);
          yield* Deferred.await(releaseState);
        }
        if (request.type === "get_session_stats") {
          if (typeof request.id !== "string") return yield* Effect.die("Missing stats request ID");
          yield* Deferred.succeed(requestedStats, request.id);
          yield* Deferred.await(releaseStats);
          yield* emit({
            type: "response",
            command: "get_session_stats",
            id: request.id,
            success: true,
            data: stats,
          });
          return;
        }
        if (request.type === "extension_ui_response") {
          yield* Deferred.succeed(secretReceived, request.value);
          return;
        }
        if (request.type === "prompt" && request.message === "/vault-export") {
          yield* emit({ type: "takomi_vault_export", key: TRANSFER_KEY, path: TRANSFER_PATH });
        }
        yield* emit({
          type: "response",
          id: request.id,
          command: request.type,
          success: !(request.type === "get_state" && failState),
          data:
            request.type === "get_state"
              ? {
                  sessionFile: `/synthetic/session-${index}.jsonl`,
                  sessionName: "Manual native name",
                }
              : request.type === "get_commands"
                ? { commands: [{ name: "vault-export", source: "extension" }] }
                : request.type === "prompt"
                  ? { disposition: "handled" }
                  : {},
        });
      }),
    ),
    stdout: Stream.fromQueue(output),
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
  yield* Effect.addFinalizer(() =>
    end.pipe(Effect.andThen(Deferred.succeed(stopped, undefined)), Effect.asVoid),
  );
  return {
    handle,
    emit,
    requestedState,
    releaseState,
    stopped,
    releaseSpawn,
    secretReceived,
    requestedQueue,
    releaseQueue,
    queueReads: () => queueReads,
    setQueue: (value: unknown) =>
      Effect.sync(() => {
        queue = value;
      }),
    requestedStats,
    releaseStats,
    setStats: (value: unknown) =>
      Effect.sync(() => {
        stats = value;
      }),
    naturalEnd: Queue.end(output).pipe(
      Effect.andThen(Deferred.succeed(exited, ChildProcessSpawner.ExitCode(0))),
      Effect.asVoid,
    ),
    fail: Effect.sync(() => {
      failState = true;
    }),
  };
});

const TRANSFER_KEY = "c9".repeat(32);
const TRANSFER_PATH = "/synthetic-private-vault-archive.enc";
type Peer = Effect.Success<ReturnType<typeof makePeer>>;
const makeHarness = Effect.fnUntraced(function* (releaseStartup = false, version = "0.99.1") {
  const config = yield* ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(config.stateDir, { recursive: true });
  const peers = yield* Queue.unbounded<Peer>();
  const nativeRecords: unknown[] = [];
  const canonical: unknown[] = [];
  let next = 0;
  let holdSpawn = false;
  const spawner = ChildProcessSpawner.make((command) => {
    if (
      command._tag !== "StandardCommand" ||
      !command.args.includes("--mode") ||
      command.args.includes("--no-session")
    )
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(1000),
          exitCode: Effect.succeed(
            ChildProcessSpawner.ExitCode(
              command._tag === "StandardCommand" && command.args.includes("--version") ? 0 : 1,
            ),
          ),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          unref: Effect.succeed(Effect.void),
          stdin: Sink.drain,
          stdout:
            command._tag === "StandardCommand" && command.args.includes("--version")
              ? Stream.succeed(encoder.encode(`${version}\n`))
              : Stream.empty,
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
        }),
      );
    const held = holdSpawn;
    holdSpawn = false;
    return makePeer(next++).pipe(
      Effect.tap((peer) =>
        releaseStartup ? Deferred.succeed(peer.releaseState, undefined) : Effect.void,
      ),
      Effect.tap((peer) =>
        Queue.offer(peers, peer).pipe(
          Effect.andThen(held ? Deferred.await(peer.releaseSpawn) : Effect.void),
        ),
      ),
      Effect.map((peer) => peer.handle),
    );
  });
  const configMap: ProviderInstanceConfigMap = {
    [PI]: {
      driver: ProviderDriverKind.make("pi"),
      config: {
        binaryPath: "synthetic-pi",
        homePath: config.stateDir,
        launchArgs: "--no-extensions",
        enabled: true,
      },
      environment: [
        { name: "HOME", value: config.stateDir, sensitive: false },
        { name: "USERPROFILE", value: config.stateDir, sensitive: false },
        { name: "APPDATA", value: config.stateDir, sensitive: false },
      ],
    },
  };
  const graph = ProviderServiceLive.pipe(
    Layer.provideMerge(
      ProviderAdapterRegistryLive.pipe(
        Layer.provideMerge(
          ProviderInstanceRegistryMutableLayer({ drivers: [PiDriver], configMap }),
        ),
      ),
    ),
    Layer.provideMerge(
      ProviderSessionDirectoryLive.pipe(
        Layer.provideMerge(ProviderSessionRuntime.layer),
        Layer.provideMerge(SqlitePersistenceMemory),
      ),
    ),
    Layer.provideMerge(ServerSettingsService.layerTest()),
    Layer.provideMerge(AnalyticsService.layerTest),
    Layer.provideMerge(
      Layer.succeed(ProviderEventLoggers, {
        native: {
          filePath: "in-memory-native",
          write: (record) =>
            Effect.sync(() => {
              nativeRecords.push(record);
            }),
          close: () => Effect.void,
        },
        canonical: {
          filePath: "in-memory-canonical",
          write: (record) =>
            Effect.sync(() => {
              canonical.push(record);
            }),
          close: () => Effect.void,
        },
      }),
    ),
    Layer.provide(
      Layer.mock(BackgroundPolicy.BackgroundPolicy)({
        shouldRunOpportunisticWork: Effect.succeed(false),
      }),
    ),
    Layer.provideMerge(ProviderExtensionState.layer),
    Layer.provideMerge(Layer.succeed(ServerConfig, config)),
    Layer.provide(
      Layer.mergeAll(
        NodeServices.layer,
        Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
      ),
    ),
  );
  const services = yield* Layer.build(graph);
  return {
    service: Context.get(services, ProviderService),
    extension: Context.get(services, ProviderExtensionState),
    registry: Context.get(services, ProviderAdapterRegistry),
    instances: Context.get(services, ProviderInstanceRegistry),
    mutator: Context.get(services, ProviderInstanceRegistryMutator),
    directory: Context.get(services, ProviderSessionDirectory),
    runtime: Context.get(services, ProviderSessionRuntimeRepository),
    peers,
    nativeRecords,
    canonical,
    configMap,
    config,
    holdNextSpawn: Effect.sync(() => {
      holdSpawn = true;
    }),
  };
});
const TEST_LAYER = ServerConfig.layerTest(process.cwd(), { prefix: "t3-pi-extension-" }).pipe(
  Layer.provideMerge(NodeServices.layer),
);
const current = (harness: Effect.Success<ReturnType<typeof makeHarness>>) =>
  Stream.runHead(harness.extension.observe(THREAD, Effect.void)).pipe(
    Effect.map(Option.getOrThrow),
  );
const start = (harness: Effect.Success<ReturnType<typeof makeHarness>>, instanceId = PI) =>
  harness.service.startSession(THREAD, {
    threadId: THREAD,
    providerInstanceId: instanceId,
    runtimeMode: "full-access",
    cwd: harness.config.stateDir,
  });

const holdBeforeReserve = Effect.fnUntraced(function* (
  harness: Effect.Success<ReturnType<typeof makeHarness>>,
  lookupNumber = 2,
) {
  const held = yield* Deferred.make<void>();
  const release = yield* Deferred.make<void>();
  const lookup = harness.registry.getByInstance;
  let calls = 0;
  const spy = vi.spyOn(harness.registry, "getByInstance").mockImplementation((instance) =>
    Effect.gen(function* () {
      if (++calls === lookupNumber) {
        yield* Deferred.succeed(held, undefined);
        yield* Deferred.await(release);
      }
      return yield* lookup(instance);
    }),
  );
  yield* Effect.addFinalizer(() => Effect.sync(() => spy.mockRestore()));
  return { held, release, calls: () => calls };
});

it.effect(
  "pre-reserve deletion rejects the original actual start without opening startup state",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness(true);
        const barrier = yield* holdBeforeReserve(harness);
        const starting = yield* start(harness).pipe(Effect.exit, Effect.forkScoped);
        yield* Deferred.await(barrier.held);
        expect(yield* harness.extension.retainedRecords).toBe(0);
        yield* harness.extension.delete(THREAD);
        yield* Deferred.succeed(barrier.release, undefined);
        expect(Exit.isFailure(yield* Fiber.join(starting))).toBe(true);
        expect(yield* Queue.size(harness.peers)).toBe(0);
        expect(yield* current(harness)).toMatchObject({ active: false, widgets: [] });
        expect(yield* harness.extension.retainedRecords).toBe(0);
        expect(yield* harness.extension.retainedStarts).toEqual({ lanes: 0, admissions: 0 });
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect("queued pre-delete starts fail while a later admission waits on the original lane", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const harness = yield* makeHarness(true);
      const barrier = yield* holdBeforeReserve(harness);
      const queued = yield* Queue.unbounded<void>();
      const withStart = harness.extension.withStart;
      const spy = vi
        .spyOn(harness.extension, "withStart")
        .mockImplementation(
          <A, E, R>(input: ExtensionStartAdmission, effect: Effect.Effect<A, E, R>) => {
            Queue.offerUnsafe(queued, undefined);
            return withStart(input, effect);
          },
        );
      yield* Effect.addFinalizer(() => Effect.sync(() => spy.mockRestore()));
      const first = yield* start(harness).pipe(Effect.exit, Effect.forkScoped);
      yield* Deferred.await(barrier.held);
      yield* Queue.take(queued);
      const second = yield* start(harness).pipe(
        Effect.exit,
        Effect.forkScoped({ startImmediately: true }),
      );
      yield* Queue.take(queued);
      yield* harness.extension.delete(THREAD);
      const later = yield* start(harness).pipe(
        Effect.exit,
        Effect.forkScoped({ startImmediately: true }),
      );
      yield* Queue.take(queued);
      expect(barrier.calls()).toBe(2);
      expect(yield* Queue.size(harness.peers)).toBe(0);
      expect(yield* harness.extension.retainedStarts).toEqual({ lanes: 1, admissions: 3 });
      yield* Deferred.succeed(barrier.release, undefined);
      const results = yield* Effect.all([Fiber.join(first), Fiber.join(second), Fiber.join(later)]);
      expect(Exit.isFailure(results[1])).toBe(true);
      expect(Exit.isFailure(results[0])).toBe(true);
      expect(Exit.isSuccess(results[2])).toBe(true);
      expect(yield* Queue.size(harness.peers)).toBe(1);
      expect(yield* current(harness)).toMatchObject({
        active: true,
        widgets: [{ key: "startup", lines: ["startup-0"] }],
      });
      yield* harness.service.stopSession({ threadId: THREAD });
      expect(yield* harness.extension.retainedStarts).toEqual({ lanes: 0, admissions: 0 });
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "pre-reserve recovery deletion rejects its captured admission without resurrecting UI",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness(true);
        yield* start(harness);
        const original = yield* Queue.take(harness.peers);
        yield* harness.service.stopSession({ threadId: THREAD });
        yield* Deferred.await(original.stopped);
        // sendTurn probes routing twice before recovery's two adapter lookups.
        const barrier = yield* holdBeforeReserve(harness, 4);
        const recovering = yield* harness.service
          .sendTurn({ threadId: THREAD, input: "/recover", attachments: [] })
          .pipe(Effect.exit, Effect.forkScoped);
        yield* Deferred.await(barrier.held);
        expect(yield* harness.extension.retainedStarts).toEqual({ lanes: 1, admissions: 1 });
        yield* harness.extension.delete(THREAD);
        yield* Deferred.succeed(barrier.release, undefined);
        expect(Exit.isFailure(yield* Fiber.join(recovering))).toBe(true);
        expect(yield* Queue.size(harness.peers)).toBe(0);
        expect(yield* current(harness)).toMatchObject({ active: false, widgets: [] });
        expect(yield* harness.extension.retainedStarts).toEqual({ lanes: 0, admissions: 0 });
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "deletion while recovery verifies live adoption rejects the stale return without reopening its lease",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness(true);
        yield* start(harness);
        yield* Queue.take(harness.peers);
        const adapter = yield* harness.registry.getByInstance(PI);
        const held = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const originalList = adapter.listSessions;
        const routing = vi
          .spyOn(adapter, "hasSession")
          .mockImplementationOnce(() => Effect.succeed(false))
          .mockImplementationOnce(() => Effect.succeed(false));
        const listing = vi
          .spyOn(adapter, "listSessions")
          .mockImplementation(() =>
            Deferred.succeed(held, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(originalList()),
            ),
          );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            routing.mockRestore();
            listing.mockRestore();
          }),
        );
        const adopting = yield* harness.service
          .sendTurn({ threadId: THREAD, input: "/adopt", attachments: [] })
          .pipe(Effect.exit, Effect.forkScoped);
        yield* Deferred.await(held);
        yield* harness.extension.delete(THREAD);
        yield* Deferred.succeed(release, undefined);
        expect(Exit.isFailure(yield* Fiber.join(adopting))).toBe(true);
        expect(yield* Queue.size(harness.peers)).toBe(0);
        expect(yield* current(harness)).toMatchObject({ active: false, widgets: [] });
        expect(yield* harness.extension.retainedStarts).toEqual({ lanes: 0, admissions: 0 });
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "real Pi factory/registry/service publishes startup and idle state before binding, without logging or journaling setters",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        const starting = yield* start(harness).pipe(Effect.forkScoped);
        const peer = yield* Queue.take(harness.peers).pipe(
          Effect.race(
            Fiber.join(starting).pipe(
              Effect.andThen(Effect.die("Start settled before creating the controlled peer")),
            ),
          ),
        );
        yield* Deferred.await(peer.requestedState);
        const startup = yield* Stream.runHead(
          harness.extension
            .observe(THREAD, Effect.void)
            .pipe(Stream.filter((state) => state.widgets.length > 0)),
        ).pipe(Effect.map(Option.getOrThrow));
        expect(startup.widgets).toEqual([
          { key: "startup", lines: ["startup-0"], placement: "belowEditor" },
        ]);
        expect(Option.isNone(yield* harness.directory.getBinding(THREAD))).toBe(true);
        yield* Deferred.succeed(peer.releaseState, undefined);
        const session = yield* Fiber.join(starting);
        const adapter = yield* harness.registry.getByInstance(PI);
        expect(adapter).toBe((yield* harness.instances.getInstance(PI))?.adapter);
        expect(session.resumeCursor).toEqual({
          schemaVersion: 1,
          sessionFile: "/synthetic/session-0.jsonl",
        });
        yield* peer.emit({
          type: "extension_ui_request",
          method: "setStatus",
          statusKey: "idle",
          statusText: "Ready",
        });
        const idle = yield* Stream.runHead(
          harness.extension
            .observe(THREAD, Effect.void)
            .pipe(Stream.filter((state) => state.statuses.length > 0)),
        ).pipe(Effect.map(Option.getOrThrow));
        expect(idle.generation).toBe(startup.generation);
        expect(idle.subtitle).toBe("Runtime subtitle");
        const prompt = yield* harness.service.sendTurn({
          threadId: THREAD,
          input: "/command",
          attachments: [],
        });
        expect(prompt.threadId).toBe(THREAD);
        expect((yield* current(harness)).widgets).toEqual(idle.widgets);
        expect(encodeJson(harness.nativeRecords)).not.toContain("startup-0");
        expect(encodeJson(harness.canonical)).not.toContain("startup-0");
        expect(encodeJson(harness.canonical)).not.toContain("Runtime subtitle");
        expect(Option.getOrThrow(yield* harness.directory.getBinding(THREAD)).threadId).toBe(
          THREAD,
        );
        yield* harness.service.stopSession({ threadId: THREAD });
        expect(yield* current(harness)).toMatchObject({
          active: false,
          widgets: [],
          statuses: [],
          subtitle: null,
        });
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "failed startup and deletion during startup fence leases and release controlled processes",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        const failing = yield* start(harness).pipe(Effect.exit, Effect.forkScoped);
        const peer = yield* Queue.take(harness.peers);
        yield* Deferred.await(peer.requestedState);
        yield* peer.fail;
        yield* Deferred.succeed(peer.releaseState, undefined);
        expect(Exit.isFailure(yield* Fiber.join(failing))).toBe(true);
        expect(yield* current(harness)).toMatchObject({ active: false, widgets: [] });
        yield* Deferred.await(peer.stopped);
        yield* harness.holdNextSpawn;
        const deleted = yield* start(harness).pipe(Effect.exit, Effect.forkScoped);
        const pending = yield* Queue.take(harness.peers);
        yield* harness.extension.delete(THREAD);
        yield* Deferred.succeed(pending.releaseSpawn, undefined);
        expect(Exit.isFailure(yield* Fiber.join(deleted))).toBe(true);
        yield* Deferred.await(pending.stopped);
        expect(yield* current(harness)).toMatchObject({ active: false, widgets: [] });
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "binding failure after native startup closes ownership and rejects later setter output",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        const failedBinding = vi.spyOn(harness.directory, "upsert").mockImplementationOnce(() =>
          Effect.fail(
            new ProviderValidationError({
              operation: "upsert",
              issue: "Synthetic binding failure",
            }),
          ),
        );
        const starting = yield* start(harness).pipe(Effect.exit, Effect.forkScoped);
        const peer = yield* Queue.take(harness.peers);
        yield* Deferred.succeed(peer.releaseState, undefined);
        expect(Exit.isFailure(yield* Fiber.join(starting))).toBe(true);
        failedBinding.mockRestore();
        expect(yield* current(harness)).toMatchObject({ active: false, widgets: [] });
        yield* peer.emit({
          type: "extension_ui_request",
          method: "setTitle",
          title: "late after binding failure",
        });
        yield* peer.naturalEnd;
        yield* Deferred.await(peer.stopped);
        expect(yield* current(harness)).toMatchObject({ active: false, subtitle: null });
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "normal replacement, same-instance rebuild, cross-instance switch and scope retirement cannot retain old UI",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        const firstStart = yield* start(harness).pipe(Effect.forkScoped);
        const first = yield* Queue.take(harness.peers);
        yield* Deferred.succeed(first.releaseState, undefined);
        yield* Fiber.join(firstStart);
        const old = yield* current(harness);
        const secondStart = yield* start(harness).pipe(Effect.forkScoped);
        const second = yield* Queue.take(harness.peers);
        yield* Deferred.succeed(second.releaseState, undefined);
        yield* Fiber.join(secondStart);
        expect((yield* current(harness)).generation).not.toBe(old.generation);
        yield* Deferred.await(first.stopped);
        const oldAdapter = yield* harness.registry.getByInstance(PI);
        yield* harness.mutator.reconcile({
          [PI]: {
            ...harness.configMap[PI],
            driver: ProviderDriverKind.make("pi"),
            config: {
              binaryPath: "synthetic-pi-rebuilt",
              homePath: harness.config.stateDir,
              launchArgs: "--no-extensions",
            },
            environment: [{ name: "HOME", value: harness.config.stateDir, sensitive: false }],
          },
        });
        expect(yield* current(harness)).toMatchObject({ active: false, widgets: [] });
        expect(yield* harness.registry.getByInstance(PI)).not.toBe(oldAdapter);
        const rebuiltStart = yield* start(harness).pipe(Effect.forkScoped);
        const rebuilt = yield* Queue.take(harness.peers);
        yield* Deferred.succeed(rebuilt.releaseState, undefined);
        yield* Fiber.join(rebuiltStart);
        const other = ProviderInstanceId.make("other-pi");
        const otherConfig = harness.configMap[PI];
        if (!otherConfig) return yield* Effect.die("Missing test config");
        yield* harness.mutator.reconcile({ ...harness.configMap, [other]: otherConfig });
        const binding = Option.getOrThrow(yield* harness.directory.getBinding(THREAD));
        // Cross-instance continuation is deliberately forbidden. Exercise replacement
        // without a native resume cursor, rather than weaken that production check.
        yield* harness.directory.upsert({ ...binding, resumeCursor: null });
        const otherStart = yield* start(harness, other).pipe(Effect.forkScoped);
        const otherPeer = yield* Queue.take(harness.peers).pipe(
          Effect.race(
            Fiber.join(otherStart).pipe(
              Effect.andThen(Effect.die("Cross-instance start settled before spawning")),
            ),
          ),
        );
        yield* Deferred.succeed(otherPeer.releaseState, undefined);
        yield* Fiber.join(otherStart);
        expect((yield* current(harness)).providerInstanceId).toBe(other);
        yield* harness.mutator.reconcile({});
        expect(yield* current(harness)).toMatchObject({ active: false, widgets: [] });
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "verified live recovery adoption retains the process lease; turn settlement retains UI and drained natural exit erases it",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        const starting = yield* start(harness).pipe(Effect.forkScoped);
        const peer = yield* Queue.take(harness.peers);
        yield* Deferred.succeed(peer.releaseState, undefined);
        yield* Fiber.join(starting);
        const initial = yield* current(harness);
        const adapter = yield* harness.registry.getByInstance(PI);
        // The first routing query and recovery admission see a missing context.
        // Recovery then verifies the actual still-live context through has/list.
        const probe = vi
          .spyOn(adapter, "hasSession")
          .mockImplementationOnce(() => Effect.succeed(false))
          .mockImplementationOnce(() => Effect.succeed(false));
        yield* harness.service.sendTurn({ threadId: THREAD, input: "/handled", attachments: [] });
        expect(probe.mock.calls.length).toBeGreaterThanOrEqual(3);
        probe.mockRestore();
        expect((yield* current(harness)).generation).toBe(initial.generation);
        expect((yield* current(harness)).revision).toBe(initial.revision);
        yield* peer.emit({ type: "agent_start" });
        yield* peer.emit({ type: "agent_end", messages: [], willRetry: false });
        yield* peer.emit({ type: "agent_settled" });
        yield* peer.emit({
          type: "extension_ui_request",
          method: "setStatus",
          statusKey: "after-turn",
          statusText: "Retained",
        });
        const settled = yield* Stream.runHead(
          harness.extension
            .observe(THREAD, Effect.void)
            .pipe(Stream.filter((state) => state.statuses.length > 0)),
        ).pipe(Effect.map(Option.getOrThrow));
        expect(settled.active).toBe(true);
        expect(settled.widgets).toEqual(initial.widgets);
        expect(settled.generation).toBe(initial.generation);
        yield* peer.naturalEnd;
        const ended = yield* Stream.runHead(
          harness.extension
            .observe(THREAD, Effect.void)
            .pipe(Stream.filter((state) => !state.active)),
        ).pipe(Effect.map(Option.getOrThrow));
        expect(ended).toMatchObject({
          widgets: [],
          statuses: [],
          subtitle: null,
          editorSuggestion: null,
        });
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "private Vault answers and ignored native setter fields stay out of snapshots and both log streams",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        const starting = yield* start(harness).pipe(Effect.forkScoped);
        const peer = yield* Queue.take(harness.peers);
        yield* Deferred.succeed(peer.releaseState, undefined);
        yield* Fiber.join(starting);
        const requested = yield* harness.service.streamEvents.pipe(
          Stream.filter(
            (event): event is Extract<ProviderRuntimeEvent, { type: "user-input.requested" }> =>
              event.type === "user-input.requested",
          ),
          Stream.runHead,
          Effect.map(Option.getOrThrow),
          Effect.forkScoped({ startImmediately: true }),
        );
        yield* peer.emit({
          type: "extension_ui_request",
          id: "private",
          method: "input",
          title: "[takomi-vault-secret] Synthetic entry",
        });
        const request = yield* Fiber.join(requested);
        const privateValue = "synthetic-private-value-not-a-credential";
        if (!request.requestId) return yield* Effect.die("Private request had no correlation ID");
        yield* harness.service.respondPiSecretInput({
          threadId: THREAD,
          requestId: ApprovalRequestId.make(request.requestId),
          value: privateValue,
        });
        expect(yield* Deferred.await(peer.secretReceived)).toBe(privateValue);
        yield* peer.emit({
          type: "extension_ui_request",
          method: "setStatus",
          statusKey: "safe",
          statusText: "Ready",
          ignoredPrivateField: privateValue,
        });
        const state = yield* Stream.runHead(
          harness.extension
            .observe(THREAD, Effect.void)
            .pipe(Stream.filter((state) => state.statuses.length > 0)),
        ).pipe(Effect.map(Option.getOrThrow));
        const exported = yield* harness.service.streamEvents.pipe(
          Stream.filter(
            (event) =>
              event.type === "runtime.warning" && event.payload.category === "vault-export-ready",
          ),
          Stream.runHead,
          Effect.map(Option.getOrThrow),
          Effect.forkScoped({ startImmediately: true }),
        );
        yield* harness.service.sendTurn({
          threadId: THREAD,
          input: "/vault-export",
          attachments: [],
        });
        yield* Fiber.join(exported);
        for (const value of [privateValue, TRANSFER_KEY, TRANSFER_PATH]) {
          expect(encodeJson(yield* current(harness))).not.toContain(value);
          expect(encodeJson(harness.nativeRecords)).not.toContain(value);
          expect(encodeJson(harness.canonical)).not.toContain(value);
        }
        expect(state.statuses).toEqual([{ key: "safe", text: "Ready" }]);
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

const readStats = (h: Effect.Success<ReturnType<typeof makeHarness>>, owner = PI) => {
  if (!h.service.getPiSessionStats) return Effect.die("Missing statistics route");
  return h.service.getPiSessionStats({ threadId: THREAD, expectedProviderInstanceId: owner });
};

for (const claimedType of ["agent_start", "setWidget", "set_editor_text"] as const) {
  for (const lifecycle of ["pending", "interrupted", "settled"] as const) {
    it.effect(`native stats wrong-type ${claimedType} is private while ${lifecycle}`, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness(true);
          yield* start(h);
          const peer = yield* Queue.take(h.peers);
          // Publishing this sentinel drains startup through the canonical logger.
          const startup = yield* h.service.streamEvents.pipe(
            Stream.filter(
              (event) => event.type === "runtime.warning" && event.payload.message === "Ready",
            ),
            Stream.runHead,
            Effect.forkScoped({ startImmediately: true }),
          );
          yield* peer.emit({
            type: "extension_ui_request",
            id: "startup-drain",
            method: "notify",
            message: "Ready",
          });
          yield* Fiber.join(startup);
          const initial = yield* current(h);
          const reading = yield* readStats(h).pipe(
            Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }),
            Effect.forkScoped,
          );
          const id = yield* Deferred.await(peer.requestedStats);
          if (lifecycle === "interrupted") {
            yield* Fiber.interrupt(reading);
            expect(Exit.hasInterrupts(yield* Fiber.await(reading))).toBe(true);
          } else if (lifecycle === "settled") {
            yield* Deferred.succeed(peer.releaseStats, undefined);
            expect(yield* Fiber.join(reading)).toBeUndefined();
          }
          const events = yield* h.service.streamEvents.pipe(
            Stream.takeUntil((event) => event.type === "user-input.requested"),
            Stream.runCollect,
            Effect.forkScoped({ startImmediately: true }),
          );
          const privatePath = "/private/review-stats.jsonl";
          const privateText = "REVIEW_PRIVATE_STATS";
          const malformed = {
            type: claimedType === "agent_start" ? "agent_start" : "extension_ui_request",
            method: claimedType,
            widgetKey: "private-stats",
            widgetLines: [privateText, privatePath],
            widgetPlacement: "belowEditor",
            text: privateText,
            success: true,
            data: {
              sessionFile: privatePath,
              sessionId: privateText,
              userMessages: 2,
              assistantMessages: 3,
              toolCalls: 4,
              toolResults: 4,
              totalMessages: 9,
              tokens: { input: 100, output: 20, cacheRead: 30, cacheWrite: 5, total: 155 },
              cost: 0,
              contextUsage: { tokens: null, contextWindow: 200000, percent: null },
              details: privateText,
            },
          };
          yield* peer.emit({ ...malformed, id });
          yield* peer.emit({ ...malformed, id: "unrelated-record", command: "get_session_stats" });
          yield* peer.emit({ ...malformed, id: "get_session_stats-unseen-late-record" });
          yield* peer.emit({
            type: "extension_ui_request",
            id: "post-stats-input",
            method: "input",
            title: "Normal input",
          });
          const received = yield* Fiber.join(events);
          const snapshot = yield* current(h);
          for (const marker of [privatePath, privateText]) {
            expect(encodeJson([received, snapshot, h.nativeRecords, h.canonical])).not.toContain(
              marker,
            );
          }
          expect(snapshot).toEqual(initial);
          expect(received.map((event) => event.type)).toEqual(["user-input.requested"]);
          if (lifecycle === "pending") {
            const error = yield* Fiber.join(reading);
            expect(error).toMatchObject({
              _tag: "ProviderAdapterRequestError",
              method: "get_session_stats",
              detail: "Pi returned invalid session statistics.",
            });
            expect(encodeJson(error)).not.toContain(privateText);
            expect(encodeJson(error)).not.toContain(privatePath);
          }
          yield* Deferred.succeed(peer.releaseStats, undefined);
          const input = received.at(-1);
          if (input?.type !== "user-input.requested" || !input.requestId)
            return yield* Effect.die("Normal input was not delivered");
          yield* h.service.respondToUserInput({
            threadId: THREAD,
            requestId: ApprovalRequestId.make(input.requestId),
            answers: { [input.requestId]: "Normal answer" },
          });
          expect(yield* Deferred.await(peer.secretReceived)).toBe("Normal answer");
          const turn = yield* h.service.streamEvents.pipe(
            Stream.takeUntil((event) => event.type === "turn.completed"),
            Stream.runCollect,
            Effect.forkScoped({ startImmediately: true }),
          );
          yield* peer.emit({ type: "agent_start" });
          yield* peer.emit({ type: "agent_end", messages: [], willRetry: false });
          yield* peer.emit({ type: "agent_settled" });
          expect((yield* Fiber.join(turn)).map((event) => event.type)).toEqual([
            "turn.started",
            "turn.completed",
          ]);
          for (const marker of [privatePath, privateText])
            expect(encodeJson([yield* current(h), h.nativeRecords, h.canonical])).not.toContain(
              marker,
            );
        }),
      ).pipe(Effect.provide(TEST_LAYER)),
    );
  }
}

it.effect(
  "native stats read routes the live owner, preserves zero/null and excludes private fields and raw logs",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const reading = yield* readStats(h).pipe(Effect.forkScoped);
        yield* Deferred.await(peer.requestedStats);
        yield* Deferred.succeed(peer.releaseStats, undefined);
        const stats = yield* Fiber.join(reading);
        expect(stats).toMatchObject({
          source: "pi-native",
          scope: "all-session-entries",
          providerInstanceId: PI,
          messages: { user: 2, assistant: 3, toolCalls: 4, toolResults: 4, total: 9 },
          tokens: { total: 155 },
          cost: { amount: 0, currency: "USD", provenance: "native-reported" },
          contextUsage: {
            tokens: null,
            percent: null,
            contextWindow: 200000,
            provenance: "native-estimate",
          },
        });
        expect(stats.generation).toBe((yield* current(h)).generation);
        const text = encodeJson([stats, h.nativeRecords, h.canonical]);
        for (const privateValue of [
          "/private/stats.jsonl",
          "private-native-id",
          "private-stats-detail",
          "get_session_stats",
        ])
          expect(text).not.toContain(privateValue);
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect("native stats read rejects wrong and stopped owners without startup or recovery", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* makeHarness(true);
      yield* start(h);
      const peer = yield* Queue.take(h.peers);
      expect(
        Exit.isFailure(yield* readStats(h, ProviderInstanceId.make("other")).pipe(Effect.exit)),
      ).toBe(true);
      expect(yield* Deferred.isDone(peer.requestedStats)).toBe(false);
      yield* h.service.stopSession({ threadId: THREAD });
      const starting = vi.spyOn(h.service, "startSession");
      expect(Exit.isFailure(yield* readStats(h).pipe(Effect.exit))).toBe(true);
      expect(starting).not.toHaveBeenCalled();
      expect(yield* Queue.size(h.peers)).toBe(0);
      starting.mockRestore();
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect("native stats read discards a replaced same-instance process", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* makeHarness(true);
      yield* start(h);
      const first = yield* Queue.take(h.peers);
      const old = (yield* current(h)).generation;
      const reading = yield* readStats(h).pipe(Effect.exit, Effect.forkScoped);
      yield* Deferred.await(first.requestedStats);
      yield* start(h);
      expect((yield* current(h)).generation).not.toBe(old);
      yield* Deferred.succeed(first.releaseStats, undefined);
      expect(Exit.isFailure(yield* Fiber.join(reading))).toBe(true);
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "native stats malformed required fields fail without fabricated usage or raw logging",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        yield* peer.setStats({
          sessionFile: "/private/malformed.jsonl",
          cost: 0,
          userMessages: -1,
        });
        yield* Deferred.succeed(peer.releaseStats, undefined);
        expect(Exit.isFailure(yield* readStats(h).pipe(Effect.exit))).toBe(true);
        expect(encodeJson([h.nativeRecords, h.canonical])).not.toContain(
          "/private/malformed.jsonl",
        );
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

const readQueue = (
  h: Effect.Success<ReturnType<typeof makeHarness>>,
  generation: string | null,
  owner = PI,
) => {
  if (!generation) return Effect.die("Missing native lease");
  if (!h.service.getPiQueueState) return Effect.die("Missing queue route");
  return h.service
    .getPiQueueState({
      threadId: THREAD,
      expectedProviderInstanceId: owner,
      expectedGeneration: generation,
    })
    .pipe(Effect.map((read) => read.state));
};
for (const claimedType of ["agent_start", "setWidget", "set_editor_text"] as const) {
  for (const lifecycle of ["pending", "interrupted", "settled"] as const) {
    it.effect(`native queue wrong-type ${claimedType} is private while ${lifecycle}`, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness(true);
          yield* start(h);
          const peer = yield* Queue.take(h.peers);
          // Publishing this sentinel drains startup through the canonical logger.
          const startup = yield* h.service.streamEvents.pipe(
            Stream.filter(
              (event) => event.type === "runtime.warning" && event.payload.message === "Ready",
            ),
            Stream.runHead,
            Effect.forkScoped({ startImmediately: true }),
          );
          yield* peer.emit({
            type: "extension_ui_request",
            id: "startup-drain",
            method: "notify",
            message: "Ready",
          });
          yield* Fiber.join(startup);
          const initial = yield* current(h);
          const reading = yield* readQueue(h, (yield* current(h)).generation).pipe(
            Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }),
            Effect.forkScoped,
          );
          const id = yield* Deferred.await(peer.requestedQueue);
          if (lifecycle === "interrupted") {
            yield* Fiber.interrupt(reading);
            expect(Exit.hasInterrupts(yield* Fiber.await(reading))).toBe(true);
          } else if (lifecycle === "settled") {
            yield* Deferred.succeed(peer.releaseQueue, undefined);
            expect(yield* Fiber.join(reading)).toBeUndefined();
          }
          const events = yield* h.service.streamEvents.pipe(
            Stream.takeUntil((event) => event.type === "user-input.requested"),
            Stream.runCollect,
            Effect.forkScoped({ startImmediately: true }),
          );
          const privatePath = "/private/review-queue.jsonl";
          const privateText = "REVIEW_PRIVATE_QUEUE";
          const malformed = {
            type: claimedType === "agent_start" ? "agent_start" : "extension_ui_request",
            method: claimedType,
            widgetKey: "private-queue",
            widgetLines: [privateText, privatePath],
            widgetPlacement: "belowEditor",
            text: privateText,
            success: true,
            data: {
              sessionFile: privatePath,
              sessionId: privateText,
              pendingMessageCount: 2,
              steeringMode: "all",
              followUpMode: "one-at-a-time",
              isStreaming: false,
              isCompacting: false,
              details: privateText,
            },
          };
          yield* peer.emit({ ...malformed, id });
          yield* peer.emit({
            ...malformed,
            id: "t3-pi-queue-state-unrelated-record",
            command: "get_state",
          });
          yield* peer.emit({ ...malformed, id: "t3-pi-queue-state-unseen-late-record" });
          yield* peer.emit({
            type: "extension_ui_request",
            id: "post-queue-input",
            method: "input",
            title: "Normal input",
          });
          const received = yield* Fiber.join(events);
          const snapshot = yield* current(h);
          for (const marker of [privatePath, privateText]) {
            expect(encodeJson([received, snapshot, h.nativeRecords, h.canonical])).not.toContain(
              marker,
            );
          }
          expect(snapshot).toEqual(initial);
          expect(received.map((event) => event.type)).toEqual(["user-input.requested"]);
          if (lifecycle === "pending") {
            const error = yield* Fiber.join(reading);
            expect(error).toMatchObject({
              _tag: "ProviderAdapterRequestError",
              method: "get_state",
              detail: "Pi returned invalid native queue state.",
            });
            expect(encodeJson(error)).not.toContain(privateText);
            expect(encodeJson(error)).not.toContain(privatePath);
          }
          yield* Deferred.succeed(peer.releaseQueue, undefined);
          const input = received.at(-1);
          if (input?.type !== "user-input.requested" || !input.requestId)
            return yield* Effect.die("Normal input was not delivered");
          yield* h.service.respondToUserInput({
            threadId: THREAD,
            requestId: ApprovalRequestId.make(input.requestId),
            answers: { [input.requestId]: "Normal answer" },
          });
          expect(yield* Deferred.await(peer.secretReceived)).toBe("Normal answer");
          const turn = yield* h.service.streamEvents.pipe(
            Stream.takeUntil((event) => event.type === "turn.completed"),
            Stream.runCollect,
            Effect.forkScoped({ startImmediately: true }),
          );
          yield* peer.emit({ type: "agent_start" });
          yield* peer.emit({ type: "agent_end", messages: [], willRetry: false });
          yield* peer.emit({ type: "agent_settled" });
          expect((yield* Fiber.join(turn)).map((event) => event.type)).toEqual([
            "turn.started",
            "turn.completed",
          ]);
          for (const marker of [privatePath, privateText])
            expect(encodeJson([yield* current(h), h.nativeRecords, h.canonical])).not.toContain(
              marker,
            );
        }),
      ).pipe(Effect.provide(TEST_LAYER)),
    );
  }
}

it.effect(
  "native queue read preserves combined counts/modes and excludes private state and queue_update before logs/events",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const generation = (yield* current(h)).generation;
        const reading = yield* readQueue(h, generation).pipe(Effect.forkScoped);
        yield* Deferred.await(peer.requestedQueue);
        yield* Deferred.succeed(peer.releaseQueue, undefined);
        const result = yield* Fiber.join(reading);
        expect(result).toMatchObject({
          providerInstanceId: PI,
          generation,
          source: "pi-native",
          pendingMessageCount: 4,
          steeringMode: "all",
          followUpMode: "one-at-a-time",
          isStreaming: true,
          isCompacting: false,
        });
        const drained = yield* h.service.streamEvents.pipe(
          Stream.filter((event) => event.type === "user-input.requested"),
          Stream.runHead,
          Effect.forkScoped({ startImmediately: true }),
        );
        yield* peer.emit({
          type: "queue_update",
          steering: ["PRIVATE_QUEUE_UPDATE"],
          followUp: ["PRIVATE_FOLLOW_UP"],
        });
        yield* peer.emit({
          type: "extension_ui_request",
          method: "input",
          id: "drain-queue",
          title: "Normal input",
        });
        yield* Fiber.join(drained);
        const text = encodeJson([result, yield* current(h), h.nativeRecords, h.canonical]);
        for (const marker of [
          "/private/queue.jsonl",
          "private-queue-id",
          "private-queue-model",
          "PRIVATE_QUEUE_TEXT",
          "PRIVATE_QUEUE_UPDATE",
          "PRIVATE_FOLLOW_UP",
          "t3-pi-queue-state-",
        ])
          expect(text).not.toContain(marker);
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "native queue rejects wrong generations/owners and stopped/deleted threads without recovery",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const generation = (yield* current(h)).generation;
        for (const [lease, owner] of [
          ["wrong", PI],
          [generation, ProviderInstanceId.make("other")],
        ] as const)
          expect(Exit.isFailure(yield* readQueue(h, lease, owner).pipe(Effect.exit))).toBe(true);
        expect(yield* Deferred.isDone(peer.requestedQueue)).toBe(false);
        yield* h.service.stopSession({ threadId: THREAD });
        expect(Exit.isFailure(yield* readQueue(h, generation).pipe(Effect.exit))).toBe(true);
        yield* h.extension.delete(THREAD);
        expect(Exit.isFailure(yield* readQueue(h, generation).pipe(Effect.exit))).toBe(true);
        expect(yield* Queue.size(h.peers)).toBe(0);
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect("native queue discards a replaced same-instance process and its old lease", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* makeHarness(true);
      yield* start(h);
      const first = yield* Queue.take(h.peers);
      const old = (yield* current(h)).generation;
      const reading = yield* readQueue(h, old).pipe(Effect.exit, Effect.forkScoped);
      yield* Deferred.await(first.requestedQueue);
      yield* start(h);
      expect((yield* current(h)).generation).not.toBe(old);
      yield* Deferred.succeed(first.releaseQueue, undefined);
      expect(Exit.isFailure(yield* Fiber.join(reading))).toBe(true);
      expect(Exit.isFailure(yield* readQueue(h, old).pipe(Effect.exit))).toBe(true);
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

for (const version of ["0.84.4", "unknown", "0.99.2"]) {
  it.effect(
    "native queue rejects captured unsupported launch version " + version + " with a valid lease",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness(true, version);
          yield* start(h);
          const peer = yield* Queue.take(h.peers);
          const generation = (yield* current(h)).generation;
          expect(Exit.isFailure(yield* readQueue(h, generation).pipe(Effect.exit))).toBe(true);
          expect(yield* Deferred.isDone(peer.requestedQueue)).toBe(false);
        }),
      ).pipe(Effect.provide(TEST_LAYER)),
  );
}

it.effect("native queue rejects deletion during an awaited read without reviving the owner", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* makeHarness(true);
      yield* start(h);
      const peer = yield* Queue.take(h.peers);
      const generation = (yield* current(h)).generation;
      const reading = yield* readQueue(h, generation).pipe(Effect.exit, Effect.forkScoped);
      yield* Deferred.await(peer.requestedQueue);
      yield* h.extension.delete(THREAD);
      yield* Deferred.succeed(peer.releaseQueue, undefined);
      expect(Exit.isFailure(yield* Fiber.join(reading))).toBe(true);
      expect(yield* Queue.size(h.peers)).toBe(0);
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect("native queue rejects an awaited read when the actual registry wrapper is retired", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* makeHarness(true);
      yield* start(h);
      const peer = yield* Queue.take(h.peers);
      const generation = (yield* current(h)).generation;
      const oldAdapter = yield* h.registry.getByInstance(PI);
      const reading = yield* readQueue(h, generation).pipe(Effect.exit, Effect.forkScoped);
      yield* Deferred.await(peer.requestedQueue);
      yield* h.mutator.reconcile({
        [PI]: {
          ...h.configMap[PI],
          driver: ProviderDriverKind.make("pi"),
          config: {
            binaryPath: "synthetic-pi-rebuilt",
            homePath: h.config.stateDir,
            launchArgs: "--no-extensions",
          },
          environment: [{ name: "HOME", value: h.config.stateDir, sensitive: false }],
        },
      });
      expect(yield* h.registry.getByInstance(PI)).not.toBe(oldAdapter);
      yield* Deferred.succeed(peer.releaseQueue, undefined);
      expect(Exit.isFailure(yield* Fiber.join(reading))).toBe(true);
      expect(Exit.isFailure(yield* readQueue(h, generation).pipe(Effect.exit))).toBe(true);
      expect(yield* Queue.size(h.peers)).toBe(0);
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "native queue malformed required data fails generically without native paths or queued text",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        yield* peer.setQueue({
          pendingMessageCount: 0,
          sessionFile: "/private/malformed-queue.jsonl",
          steering: ["PRIVATE_MALFORMED_QUEUE"],
        });
        yield* Deferred.succeed(peer.releaseQueue, undefined);
        const error = yield* readQueue(h, (yield* current(h)).generation).pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "ProviderAdapterRequestError",
          method: "get_state",
          detail: "Pi returned invalid native queue state.",
        });
        const text = encodeJson([error, yield* current(h), h.nativeRecords, h.canonical]);
        expect(text).not.toContain("/private/malformed-queue.jsonl");
        expect(text).not.toContain("PRIVATE_MALFORMED_QUEUE");
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

for (const change of ["delete", "restart"] as const) {
  it.effect(
    `native queue post-read service fence rejects ${change} while the second registry lookup is held`,
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness(true);
          yield* start(h);
          const peer = yield* Queue.take(h.peers);
          const generation = (yield* current(h)).generation;
          const barrier = yield* holdBeforeReserve(h, 2);
          const reading = yield* readQueue(h, generation).pipe(Effect.exit, Effect.forkScoped);
          yield* Deferred.await(peer.requestedQueue);
          yield* Deferred.succeed(peer.releaseQueue, undefined);
          yield* Deferred.await(barrier.held);
          if (change === "delete") {
            yield* h.extension.delete(THREAD);
            expect(yield* current(h)).toMatchObject({ active: false });
          } else {
            yield* start(h);
            expect((yield* current(h)).generation).not.toBe(generation);
          }
          yield* Deferred.succeed(barrier.release, undefined);
          expect(Exit.isFailure(yield* Fiber.join(reading))).toBe(true);
          expect(peer.queueReads()).toBe(1);
        }),
      ).pipe(Effect.provide(TEST_LAYER)),
  );
}

for (const command of ["get_session_stats", "get_commands", undefined]) {
  it.effect(
    "native queue identity rejects private mismatched command " + String(command) + " immediately",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness(true);
          yield* start(h);
          const peer = yield* Queue.take(h.peers);
          const reading = yield* readQueue(h, (yield* current(h)).generation).pipe(
            Effect.flip,
            Effect.forkScoped,
          );
          const id = yield* Deferred.await(peer.requestedQueue);
          yield* peer.emit({
            id,
            type: "response",
            command,
            success: true,
            data: { secret: "PRIVATE_WRONG_COMMAND" },
          });
          const error = yield* Fiber.join(reading);
          expect(error).toMatchObject({
            _tag: "ProviderAdapterRequestError",
            method: "get_state",
            detail: "Pi returned invalid native queue state.",
          });
          yield* Deferred.succeed(peer.releaseQueue, undefined);
          const drained = yield* h.service.streamEvents.pipe(
            Stream.filter((event) => event.type === "user-input.requested"),
            Stream.runHead,
            Effect.forkScoped({ startImmediately: true }),
          );
          yield* peer.emit({
            type: "extension_ui_request",
            method: "input",
            id: "wrong-command-drain",
            title: "Normal input",
          });
          yield* Fiber.join(drained);
          expect(
            encodeJson([error, yield* current(h), h.nativeRecords, h.canonical]),
          ).not.toContain("PRIVATE_WRONG_COMMAND");
        }),
      ).pipe(Effect.provide(TEST_LAYER)),
  );
}
