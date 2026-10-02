import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ProviderInstanceId,
  ProviderDriverKind,
  ThreadId,
  type ProviderInstanceConfigMap,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as Scope from "effect/Scope";
import { ChildProcessSpawner } from "effect/unstable/process";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { ProviderSessionRuntimeRepository } from "../../persistence/ProviderSessionRuntime.ts";
import * as ProviderSessionRuntime from "../../persistence/ProviderSessionRuntime.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import * as AnalyticsService from "../../telemetry/AnalyticsService.ts";
import { PiDriver } from "../Drivers/PiDriver.ts";
import { ProviderExtensionState } from "../ProviderExtensionState.ts";
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

export const PI = ProviderInstanceId.make("controlled-pi");
export const THREAD = ThreadId.make("controlled-thread");
export const TRANSFER_KEY = "c9".repeat(32);
export const TRANSFER_PATH = "/synthetic-private-vault-archive.enc";
const decoder = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);
const encoder = new TextEncoder();
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const makePeer = Effect.fnUntraced(function* (index: number) {
  const peerScope = yield* Scope.Scope;
  const output = yield* Queue.unbounded<Uint8Array, Cause.Done>();
  const requestedInput = yield* Deferred.make<Record<string, unknown>>();
  const releaseInput = yield* Deferred.make<void>();
  let inputReply: Record<string, unknown> = {};
  let inputWrites = 0;
  let failInput = false;
  const requestedPrompt = yield* Deferred.make<void>();
  const requestedLiveness = yield* Deferred.make<void>();
  const releaseLiveness = yield* Deferred.make<void>();
  let holdLiveness = false;
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
    isRunning: Effect.gen(function* () {
      const done = yield* Deferred.isDone(exited);
      if (holdLiveness) {
        holdLiveness = false;
        yield* Deferred.succeed(requestedLiveness, undefined);
        yield* Deferred.await(releaseLiveness);
      }
      return !done;
    }),
    kill: () => end,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.forEach((bytes: Uint8Array) =>
      Effect.gen(function* () {
        const request = decoder(new TextDecoder().decode(bytes));
        if (request.type === "steer" || request.type === "follow_up") {
          inputWrites++;
          yield* Deferred.succeed(requestedInput, request);
          if (failInput) return yield* Effect.die(new Error("PRIVATE_NATIVE_WRITER"));
          yield* Deferred.await(releaseInput).pipe(
            Effect.andThen(
              Effect.suspend(() =>
                emit({
                  type: "response",
                  id: request.id,
                  command: request.type,
                  success: true,
                  data: { disposition: "queued" },
                  ...inputReply,
                }),
              ),
            ),
            Effect.forkIn(peerScope),
          );
          return;
        }
        if (request.type === "prompt") yield* Deferred.succeed(requestedPrompt, undefined);
        if (typeof request.id === "string" && request.id.startsWith("t3-pi-queue-state-")) {
          if (request.type !== "get_state")
            return yield* Effect.die("Invalid controlled queue request");
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
        if (request.type === "prompt" && request.message === "/vault-export")
          yield* emit({ type: "takomi_vault_export", key: TRANSFER_KEY, path: TRANSFER_PATH });
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
    requestedInput,
    releaseInput,
    requestedPrompt,
    inputWrites: () => inputWrites,
    setInputReply: (value: Record<string, unknown>) =>
      Effect.sync(() => {
        inputReply = value;
      }),
    failInput: Effect.sync(() => {
      failInput = true;
    }),
    requestedLiveness,
    releaseLiveness,
    holdNextLiveness: Effect.sync(() => {
      holdLiveness = true;
    }),
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
type Peer = Effect.Success<ReturnType<typeof makePeer>>;

/** Real Pi driver, registry and service with disposable storage and a controlled stdin/stdout peer. */
export const makeHarness = Effect.fnUntraced(function* (
  releaseStartup = false,
  version = "0.99.1",
) {
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
        Layer.succeed(FileSystem.FileSystem, fs),
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
    fileSystem: fs,
    holdNextSpawn: Effect.sync(() => {
      holdSpawn = true;
    }),
  };
});
