import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ApprovalRequestId,
  type PiInputSubmission,
  type ChatAttachment,
  type OrchestrationMessageContext,
  ComposerContextId,
  ProviderInstanceId,
  ProviderDriverKind,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { expect, it, vi } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { ServerConfig } from "../../config.ts";
import { createAttachmentId, resolveAttachmentPath } from "../../attachmentStore.ts";
import type { ExtensionStartAdmission } from "../ProviderExtensionState.ts";
import { ProviderValidationError } from "../Errors.ts";

import { PI, THREAD, TRANSFER_KEY, TRANSFER_PATH, makeHarness } from "./PiTestHarness.ts";
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const stageNativeInput = Effect.fnUntraced(function* (
  h: Effect.Success<ReturnType<typeof makeHarness>>,
  options: {
    text?: string;
    intent?: PiInputSubmission["intent"];
    attachments?: readonly ChatAttachment[];
    context?: OrchestrationMessageContext;
    beforeAdmission?: Effect.Effect<void>;
  } = {},
) {
  const capture = h.service.capturePiQueuedInput;
  const deliver = h.service.deliverPiQueuedInput;
  const release = h.service.releasePiQueuedInput;
  if (!capture || !deliver || !release) return yield* Effect.die("Missing actual Pi input service");
  const generation = (yield* current(h)).generation;
  if (generation === null) return yield* Effect.die("Missing live Pi generation");
  const preparation = yield* capture({
    threadId: THREAD,
    expectedProviderInstanceId: PI,
    expectedGeneration: generation,
  });
  const submission: PiInputSubmission = {
    requestId: "native-input-fixture",
    threadId: THREAD,
    providerInstanceId: PI,
    generation,
    intent: options.intent ?? "steer",
    text: options.text ?? "Authored input",
    attachments: options.attachments ?? [],
    ...(options.context ? { context: options.context } : {}),
    fingerprint: "a".repeat(64),
    outcome: "unconfirmed",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
  };
  yield* preparation.validateOwnership;
  yield* preparation.stage(submission, options.beforeAdmission ?? Effect.void);
  return { submission, run: deliver(submission), release: release(submission) };
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

for (const [label, reply, expected] of [
  [
    "queued",
    { data: { disposition: "queued", privateEcho: "PRIVATE_NATIVE_REPLY" } },
    { outcome: "queued" },
  ],
  ["handled", { data: { disposition: "handled" } }, { outcome: "handled" }],
  [
    "rejected",
    { success: false, error: "PRIVATE_NATIVE_REPLY", data: undefined },
    { outcome: "rejected", reason: "native-rejected" },
  ],
  [
    "wrong command",
    { command: "get_session_stats", data: { secret: "PRIVATE_NATIVE_REPLY" } },
    { outcome: "unknown", reason: "invalid-response" },
  ],
  [
    "wrong type",
    { type: "extension_ui_request", method: "setEditorText", text: "PRIVATE_NATIVE_REPLY" },
    { outcome: "unknown", reason: "invalid-response" },
  ],
  [
    "invalid disposition",
    { data: { disposition: "executed", secret: "PRIVATE_NATIVE_REPLY" } },
    { outcome: "unknown", reason: "invalid-response" },
  ],
] as const) {
  it.effect(
    `native authored input ${label} is correlated and private through actual driver/registry/service`,
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness(true);
          yield* start(h);
          const peer = yield* Queue.take(h.peers);
          const staged = yield* stageNativeInput(h, { intent: "follow-up" });
          yield* peer.setInputReply(reply);
          const submitting = yield* staged.run.pipe(Effect.forkScoped);
          const request = yield* Deferred.await(peer.requestedInput);
          expect(request).toMatchObject({
            type: "follow_up",
            message: "Authored input",
            id: expect.stringMatching(/^t3-pi-input-/),
          });
          yield* Deferred.succeed(peer.releaseInput, undefined);
          const result = yield* Fiber.join(submitting);
          expect(result).toEqual(expected);
          expect(
            encodeJson([result, yield* current(h), h.nativeRecords, h.canonical]),
          ).not.toContain("PRIVATE_NATIVE_REPLY");
          expect(encodeJson(h.canonical)).not.toContain('"type":"turn.started"');
          expect(peer.inputWrites()).toBe(1);
          yield* staged.release;
        }),
      ).pipe(Effect.provide(TEST_LAYER)),
  );
}

it.effect("native input sends every image/file/context without changing authored content", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* makeHarness(true);
      yield* start(h);
      const peer = yield* Queue.take(h.peers);
      const fs = yield* FileSystem.FileSystem;
      const imageId = createAttachmentId(THREAD);
      const fileId = createAttachmentId(THREAD, ".txt");
      if (!imageId || !fileId) return yield* Effect.die("Invalid fixture attachment IDs");
      const attachments: readonly ChatAttachment[] = [
        { type: "image", id: imageId, name: "capture.png", mimeType: "image/png", sizeBytes: 6 },
        { type: "file", id: fileId, name: "notes.txt", mimeType: "text/plain", sizeBytes: 5 },
      ];
      yield* fs.makeDirectory(h.config.attachmentsDir, { recursive: true });
      for (const attachment of attachments) {
        const path = resolveAttachmentPath({ attachmentsDir: h.config.attachmentsDir, attachment });
        if (!path) return yield* Effect.die("Invalid fixture attachment path");
        yield* fs.writeFileString(path, attachment.type === "image" ? "pixels" : "notes");
      }
      const context: OrchestrationMessageContext = {
        version: 1,
        records: [
          {
            version: 1,
            kind: "terminal",
            contextId: ComposerContextId.make("terminal-native"),
            label: "Terminal",
            terminalId: "shell",
            terminalLabel: "Shell",
            lineStart: 1,
            lineEnd: 1,
            text: "Terminal selection",
          },
        ],
      };
      const text = "Authored input\n[Terminal](t3-context://v1/terminal/terminal-native)";
      const staged = yield* stageNativeInput(h, { text, attachments, context });
      const submitting = yield* staged.run.pipe(Effect.forkScoped);
      const request = yield* Deferred.await(peer.requestedInput);
      expect(request).toMatchObject({
        type: "steer",
        images: [{ type: "image", mimeType: "image/png", data: "cGl4ZWxz" }],
      });
      expect(request.message).toContain("Terminal selection");
      expect(request.message).toContain(h.config.attachmentsDir);
      expect(request.message).toContain(`${fileId}.txt`);
      expect(staged.submission).toMatchObject({ text, attachments, context });
      yield* Deferred.succeed(peer.releaseInput, undefined);
      expect(yield* Fiber.join(submitting)).toEqual({ outcome: "queued" });
      expect(encodeJson(h.nativeRecords)).not.toContain("cGl4ZWxz");
      yield* staged.release;
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

for (const lookupNumber of [1, 2])
  it.effect(`original native owner is rechecked at routing await ${lookupNumber}`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const staged = yield* stageNativeInput(h);
        const barrier = yield* holdBeforeReserve(h, lookupNumber);
        const submitting = yield* staged.run.pipe(Effect.forkScoped);
        yield* Deferred.await(barrier.held);
        yield* h.mutator.reconcile({});
        yield* Deferred.succeed(barrier.release, undefined);
        expect(yield* Fiber.join(submitting)).toEqual({
          outcome: "not-submitted",
          reason: "owner-unavailable",
        });
        expect(peer.inputWrites()).toBe(0);
        expect(yield* Queue.size(h.peers)).toBe(0);
        yield* staged.release;
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
  );

it.effect(
  "native pre-admission thread barrier cannot redirect prepared content to another process",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const held = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const staged = yield* stageNativeInput(h, {
          beforeAdmission: Deferred.succeed(held, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
          ),
        });
        const submitting = yield* staged.run.pipe(Effect.forkScoped);
        yield* Deferred.await(held);
        yield* h.service.stopSession({ threadId: THREAD });
        yield* start(h);
        const replacement = yield* Queue.take(h.peers);
        yield* Deferred.succeed(release, undefined);
        expect(yield* Fiber.join(submitting)).toEqual({
          outcome: "not-submitted",
          reason: "owner-unavailable",
        });
        expect(peer.inputWrites()).toBe(0);
        expect(replacement.inputWrites()).toBe(0);
        yield* staged.release;
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "native input is bounded through persistence and does not route ordinary Send into its slot",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const staged = yield* stageNativeInput(h);
        const submitting = yield* staged.run.pipe(Effect.forkScoped);
        yield* Deferred.await(peer.requestedInput);
        const capture = h.service.capturePiQueuedInput;
        if (!capture) return yield* Effect.die("Missing input capture");
        const input = {
          threadId: THREAD,
          expectedProviderInstanceId: PI,
          expectedGeneration: staged.submission.generation,
        };
        expect(yield* capture(input).pipe(Effect.flip)).toMatchObject({
          issue: "Native input is busy.",
        });
        yield* h.service.sendTurn({ threadId: THREAD, input: "Ordinary send" });
        yield* Deferred.await(peer.requestedPrompt);
        expect(peer.inputWrites()).toBe(1);
        yield* Deferred.succeed(peer.releaseInput, undefined);
        expect(yield* Fiber.join(submitting)).toEqual({ outcome: "queued" });
        expect(yield* capture(input).pipe(Effect.flip)).toMatchObject({
          issue: "Native input is busy.",
        });
        yield* staged.release;
        const next = yield* capture(input);
        yield* next.release;
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

for (const ending of ["timeout", "transport loss", "replacement"] as const)
  it.effect(`native admission followed by ${ending} is unknown and never retried`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const staged = yield* stageNativeInput(h);
        const submitting = yield* staged.run.pipe(Effect.forkScoped);
        yield* Deferred.await(peer.requestedInput);
        if (ending === "timeout") yield* TestClock.adjust("30 seconds");
        else if (ending === "replacement") yield* h.mutator.reconcile({});
        else yield* peer.naturalEnd;
        expect(yield* Fiber.join(submitting)).toEqual({
          outcome: "unknown",
          reason: ending === "timeout" ? "acknowledgment-timeout" : "transport-lost",
        });
        expect(peer.inputWrites()).toBe(1);
        expect(yield* Queue.size(h.peers)).toBe(0);
        yield* staged.release;
        if (ending === "timeout") {
          yield* peer.setInputReply({
            error: "PRIVATE_LATE_NATIVE",
            data: { disposition: "handled", echo: "PRIVATE_LATE_NATIVE" },
          });
          yield* Deferred.succeed(peer.releaseInput, undefined);
          yield* peer.emit({
            type: "extension_error",
            event: "input",
            error: "PRIVATE_LATE_NATIVE",
            extensionPath: "PRIVATE_LATE_NATIVE",
          });
          yield* peer.emit({
            type: "extension_ui_request",
            method: "setStatus",
            statusKey: "late-drain",
            statusText: "Drained",
          });
          yield* h.extension.observe(THREAD, Effect.void).pipe(
            Stream.filter((state) => state.statuses.some((status) => status.key === "late-drain")),
            Stream.runHead,
          );
          expect(encodeJson([h.nativeRecords, h.canonical, yield* current(h)])).not.toContain(
            "PRIVATE_LATE_NATIVE",
          );
        }
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
  );

it.effect(
  "input-hook/skill errors cannot leak or settle independent work before handled acceptance",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const staged = yield* stageNativeInput(h);
        yield* peer.setInputReply({ data: { disposition: "handled", echo: "PRIVATE_HOOK_TEXT" } });
        const submitting = yield* staged.run.pipe(Effect.forkScoped);
        yield* Deferred.await(peer.requestedInput);
        for (const event of ["input", "skill_expansion"])
          yield* peer.emit({
            type: "extension_error",
            event,
            error: "PRIVATE_HOOK_TEXT /private/hooks cGl4ZWxz",
            extensionPath: "/private/hooks",
            stack: "PRIVATE_HOOK_TEXT",
          });
        yield* peer.emit({
          id: "t3-pi-input-unowned",
          type: "extension_ui_request",
          method: "setEditorText",
          text: "PRIVATE_HOOK_TEXT",
        });
        yield* peer.emit({ type: "queue_update", steering: ["PRIVATE_HOOK_TEXT"] });
        const started = yield* h.service.streamEvents.pipe(
          Stream.filter((event) => event.type === "turn.started"),
          Stream.runHead,
          Effect.forkScoped({ startImmediately: true }),
        );
        yield* peer.emit({ type: "agent_start" });
        const startEvent = Option.getOrThrow(yield* Fiber.join(started));
        yield* Deferred.succeed(peer.releaseInput, undefined);
        expect(yield* Fiber.join(submitting)).toEqual({ outcome: "handled" });
        expect(
          (yield* h.service.listSessions()).find((session) => session.threadId === THREAD),
        ).toMatchObject({ status: "running", activeTurnId: startEvent.turnId });
        expect(encodeJson([h.nativeRecords, h.canonical, yield* current(h)])).not.toContain(
          "PRIVATE_HOOK_TEXT",
        );
        expect(encodeJson([h.nativeRecords, h.canonical])).not.toContain("/private/hooks");
        const completed = yield* h.service.streamEvents.pipe(
          Stream.filter((event) => event.type === "turn.completed"),
          Stream.runHead,
          Effect.forkScoped({ startImmediately: true }),
        );
        yield* peer.emit({ type: "agent_settled" });
        expect(Option.getOrThrow(yield* Fiber.join(completed))).toMatchObject({
          turnId: startEvent.turnId,
          payload: { state: "completed" },
        });
        yield* staged.release;
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect(
  "native cancellation after admission is unknown, even when the caller is interrupted",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const staged = yield* stageNativeInput(h);
        const result =
          yield* Deferred.make<import("../Services/ProviderAdapter.ts").PiInputResult>();
        const submitting = yield* Effect.uninterruptible(
          staged.run.pipe(Effect.tap((value) => Deferred.succeed(result, value))),
        ).pipe(Effect.forkScoped);
        yield* Deferred.await(peer.requestedInput);
        yield* Fiber.interrupt(submitting);
        expect(yield* Deferred.await(result)).toEqual({ outcome: "unknown", reason: "cancelled" });
        expect(peer.inputWrites()).toBe(1);
        yield* staged.release;
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect("native stdin write failure is unknown and hides its raw error", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* makeHarness(true);
      yield* start(h);
      const peer = yield* Queue.take(h.peers);
      yield* peer.failInput;
      const staged = yield* stageNativeInput(h);
      const result = yield* staged.run;
      expect(result).toEqual({ outcome: "unknown", reason: "transport-lost" });
      expect(peer.inputWrites()).toBe(1);
      expect(encodeJson([result, h.nativeRecords, h.canonical])).not.toContain(
        "PRIVATE_NATIVE_WRITER",
      );
      yield* staged.release;
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect("known native acceptance survives removal of its owner before persistence", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* makeHarness(true);
      yield* start(h);
      const peer = yield* Queue.take(h.peers);
      const staged = yield* stageNativeInput(h);
      const submitting = yield* staged.run.pipe(Effect.forkScoped);
      yield* Deferred.await(peer.requestedInput);
      yield* Deferred.succeed(peer.releaseInput, undefined);
      const result = yield* Fiber.join(submitting);
      yield* h.mutator.reconcile({});
      expect(result).toEqual({ outcome: "queued" });
      yield* staged.release;
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

it.effect("unsupported captured native versions cannot reserve or start a replacement", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const h = yield* makeHarness(true, "0.99.0");
      yield* start(h);
      const peer = yield* Queue.take(h.peers);
      const capture = h.service.capturePiQueuedInput;
      const generation = (yield* current(h)).generation;
      if (!capture || generation === null) return yield* Effect.die("Missing live input route");
      expect(
        yield* capture({
          threadId: THREAD,
          expectedProviderInstanceId: PI,
          expectedGeneration: generation,
        }).pipe(Effect.flip),
      ).toMatchObject({ issue: "Native input is unavailable for this owner." });
      expect(peer.inputWrites()).toBe(0);
      expect(yield* Queue.size(h.peers)).toBe(0);
    }),
  ).pipe(Effect.provide(TEST_LAYER)),
);

for (const method of ["stat", "readFile"] as const)
  it.effect(`native owner retirement during image ${method} cannot write prepared content`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const id = createAttachmentId(THREAD);
        if (!id) return yield* Effect.die("Invalid image ID");
        const attachment: ChatAttachment = {
          type: "image",
          id,
          name: "capture.png",
          mimeType: "image/png",
          sizeBytes: 6,
        };
        const path = resolveAttachmentPath({ attachmentsDir: h.config.attachmentsDir, attachment });
        if (!path) return yield* Effect.die("Invalid image path");
        yield* h.fileSystem.makeDirectory(h.config.attachmentsDir, { recursive: true });
        yield* h.fileSystem.writeFileString(path, "pixels");
        const staged = yield* stageNativeInput(h, { attachments: [attachment] });
        const held = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const gate = Deferred.succeed(held, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
        );
        const stat = h.fileSystem.stat;
        const read = h.fileSystem.readFile;
        const spy =
          method === "stat"
            ? vi
                .spyOn(h.fileSystem, "stat")
                .mockImplementation((target) =>
                  target === path ? gate.pipe(Effect.andThen(stat(target))) : stat(target),
                )
            : vi
                .spyOn(h.fileSystem, "readFile")
                .mockImplementation((target) =>
                  target === path ? gate.pipe(Effect.andThen(read(target))) : read(target),
                );
        yield* Effect.addFinalizer(() => Effect.sync(() => spy.mockRestore()));
        const submitting = yield* staged.run.pipe(Effect.forkScoped);
        yield* Deferred.await(held);
        yield* h.mutator.reconcile({});
        yield* Deferred.succeed(release, undefined);
        expect(yield* Fiber.join(submitting)).toEqual({
          outcome: "not-submitted",
          reason: "owner-unavailable",
        });
        expect(peer.inputWrites()).toBe(0);
        yield* staged.release;
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
  );

for (const point of ["binding", "hasSession", "liveness"] as const)
  it.effect(`native original owner survives no ${point} pre-admission gap`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness(true);
        yield* start(h);
        const peer = yield* Queue.take(h.peers);
        const staged = yield* stageNativeInput(h);
        const held = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const gate = Deferred.succeed(held, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
        );
        if (point === "binding") {
          const lookup = h.directory.getBinding;
          const spy = vi
            .spyOn(h.directory, "getBinding")
            .mockImplementation((threadId) => gate.pipe(Effect.andThen(lookup(threadId))));
          yield* Effect.addFinalizer(() => Effect.sync(() => spy.mockRestore()));
        } else if (point === "hasSession") {
          const adapter = yield* h.registry.getByInstance(PI);
          const hasSession = adapter.hasSession;
          const spy = vi
            .spyOn(adapter, "hasSession")
            .mockImplementation((threadId) => gate.pipe(Effect.andThen(hasSession(threadId))));
          yield* Effect.addFinalizer(() => Effect.sync(() => spy.mockRestore()));
        } else yield* peer.holdNextLiveness;
        const submitting = yield* staged.run.pipe(Effect.forkScoped);
        yield* point === "liveness" ? Deferred.await(peer.requestedLiveness) : Deferred.await(held);
        yield* h.mutator.reconcile({});
        yield* point === "liveness"
          ? Deferred.succeed(peer.releaseLiveness, undefined)
          : Deferred.succeed(release, undefined);
        expect(yield* Fiber.join(submitting)).toEqual({
          outcome: "not-submitted",
          reason: "owner-unavailable",
        });
        expect(peer.inputWrites()).toBe(0);
        yield* staged.release;
      }),
    ).pipe(Effect.provide(TEST_LAYER)),
  );
