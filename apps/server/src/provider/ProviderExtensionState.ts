import {
  type ProviderExtensionStateSnapshot,
  type ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { emptyExtensionState, reduceExtensionState } from "./extensionState.ts";
import { ProviderValidationError } from "./Errors.ts";

export interface ExtensionPublisher {
  readonly instanceId: ProviderInstanceId;
  retired: boolean;
}
export interface ExtensionLease {
  readonly publisher: ExtensionPublisher;
  readonly threadId: ThreadId;
  readonly generation: string;
}
export interface ExtensionStartAdmission {
  readonly threadId: ThreadId;
}
export interface ExtensionReservation {
  readonly publisher: ExtensionPublisher;
  readonly start: ExtensionStartAdmission;
  revoked: boolean;
}
interface StartLane {
  readonly semaphore: Semaphore.Semaphore;
  readonly admissions: Set<ExtensionStartAdmission>;
}
interface Subscriber {
  readonly wake: Queue.Queue<"WAKE">;
}
interface Topic {
  snapshot: ProviderExtensionStateSnapshot;
  reservation: ExtensionReservation | undefined;
  lease: ExtensionLease | undefined;
  deleted: boolean;
  readonly subscribers: Set<Subscriber>;
}
export class ProviderExtensionState extends Context.Service<
  ProviderExtensionState,
  {
    readonly publisher: (
      instanceId: ProviderInstanceId,
    ) => Effect.Effect<ExtensionPublisher, never, Scope.Scope>;
    readonly associate: (adapter: object, publisher: ExtensionPublisher) => Effect.Effect<void>;
    readonly inherit: (adapter: object, source: object) => Effect.Effect<void>;
    readonly startAdmission: (
      threadId: ThreadId,
    ) => Effect.Effect<ExtensionStartAdmission, never, Scope.Scope>;
    readonly reserve: (
      start: ExtensionStartAdmission,
      adapter: object,
    ) => Effect.Effect<void, ProviderValidationError>;
    readonly failStart: (threadId: ThreadId, adapter: object) => Effect.Effect<void>;
    readonly admission: (
      threadId: ThreadId,
      publisher: ExtensionPublisher,
    ) => Effect.Effect<ExtensionReservation | undefined>;
    readonly open: (
      threadId: ThreadId,
      publisher: ExtensionPublisher,
      reservation: ExtensionReservation,
    ) => Effect.Effect<ExtensionLease | undefined>;
    readonly write: (lease: ExtensionLease, input: Record<string, unknown>) => Effect.Effect<void>;
    readonly close: (lease: ExtensionLease) => Effect.Effect<void>;
    readonly delete: (threadId: ThreadId) => Effect.Effect<void>;
    readonly retainedRecords: Effect.Effect<number>;
    readonly retainedStarts: Effect.Effect<{ readonly lanes: number; readonly admissions: number }>;
    readonly observe: <E, R>(
      threadId: ThreadId,
      verify: Effect.Effect<void, E, R>,
    ) => Stream.Stream<ProviderExtensionStateSnapshot, E, R>;
    readonly withStart: <A, E, R>(
      start: ExtensionStartAdmission,
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | ProviderValidationError, R>;
  }
>()("t3/provider/ProviderExtensionState") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const lock = yield* Semaphore.make(1);
      const topics = new Map<ThreadId, Topic>();
      const adapters = new WeakMap<object, ExtensionPublisher>();
      const lanes = new Map<ThreadId, StartLane>();
      const revokedStarts = new WeakSet<ExtensionStartAdmission>();
      const isCurrentStart = (start: ExtensionStartAdmission) =>
        lanes.get(start.threadId)?.admissions.has(start) === true && !revokedStarts.has(start);
      const validateStart = Effect.fnUntraced(function* (start: ExtensionStartAdmission) {
        const lane = lanes.get(start.threadId);
        if (!lane || !isCurrentStart(start))
          return yield* new ProviderValidationError({
            operation: "startSession",
            issue: "Provider startup admission was invalidated.",
          });
        return lane;
      });
      const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
      const topic = (threadId: ThreadId, updatedAt: string) => {
        let value = topics.get(threadId);
        if (!value) {
          value = {
            snapshot: emptyExtensionState(threadId, updatedAt),
            reservation: undefined,
            lease: undefined,
            deleted: false,
            subscribers: new Set(),
          };
          topics.set(threadId, value);
        }
        return value;
      };
      const collect = (threadId: ThreadId, value: Topic) => {
        if (
          !value.reservation &&
          !value.lease &&
          value.subscribers.size === 0 &&
          topics.get(threadId) === value
        )
          topics.delete(threadId);
      };
      const wake = (value: Topic) => {
        for (const subscriber of value.subscribers) Queue.offerUnsafe(subscriber.wake, "WAKE");
      };
      const end = (value: Topic, updatedAt: string) => {
        if (value.reservation) value.reservation.revoked = true;
        value.reservation = undefined;
        value.lease = undefined;
        value.snapshot = {
          ...emptyExtensionState(value.snapshot.threadId, updatedAt),
          providerInstanceId: value.snapshot.providerInstanceId,
          generation: value.snapshot.generation,
          revision: value.snapshot.revision + 1,
        };
        wake(value);
        collect(value.snapshot.threadId, value);
      };
      const mutate = (f: (updatedAt: string) => void) =>
        lock.withPermits(1)(
          now.pipe(Effect.flatMap((updatedAt) => Effect.sync(() => f(updatedAt)))),
        );
      const close = (lease: ExtensionLease) =>
        mutate((updatedAt) => {
          const value = topics.get(lease.threadId);
          if (value?.lease === lease) end(value, updatedAt);
        });
      return ProviderExtensionState.of({
        publisher: (instanceId) =>
          Effect.gen(function* () {
            const publisher: ExtensionPublisher = { instanceId, retired: false };
            yield* Effect.addFinalizer(() =>
              mutate((updatedAt) => {
                publisher.retired = true;
                for (const value of topics.values()) {
                  if (
                    value.reservation?.publisher === publisher ||
                    value.lease?.publisher === publisher
                  )
                    end(value, updatedAt);
                }
              }),
            );
            return publisher;
          }),
        associate: (adapter, publisher) =>
          Effect.sync(() => {
            adapters.set(adapter, publisher);
          }),
        inherit: (adapter, source) =>
          Effect.sync(() => {
            const publisher = adapters.get(source);
            if (publisher) adapters.set(adapter, publisher);
          }),
        startAdmission: (threadId) =>
          Effect.acquireRelease(
            lock.withPermits(1)(
              Effect.sync(() => {
                const start: ExtensionStartAdmission = { threadId };
                const lane = lanes.get(threadId) ?? {
                  semaphore: Semaphore.makeUnsafe(1),
                  admissions: new Set<ExtensionStartAdmission>(),
                };
                lane.admissions.add(start);
                lanes.set(threadId, lane);
                return { start, lane };
              }),
            ),
            ({ start, lane }) =>
              mutate((updatedAt) => {
                const value = topics.get(threadId);
                if (value?.reservation?.start === start && !value.lease) end(value, updatedAt);
                lane.admissions.delete(start);
                if (lane.admissions.size === 0) lanes.delete(threadId);
              }),
            { interruptible: true },
          ).pipe(Effect.map(({ start }) => start)),
        reserve: (start, adapter) =>
          lock.withPermits(1)(
            Effect.gen(function* () {
              yield* validateStart(start);
              const updatedAt = yield* now;
              yield* Effect.sync(() => {
                const previous = topics.get(start.threadId);
                if (previous) end(previous, updatedAt);
                const publisher = adapters.get(adapter);
                if (!publisher || publisher.retired) return;
                const value = topic(start.threadId, updatedAt);
                value.deleted = false;
                value.reservation = { publisher, start, revoked: false };
              });
            }),
          ),
        failStart: (threadId, adapter) =>
          mutate((updatedAt) => {
            const value = topics.get(threadId);
            const publisher = adapters.get(adapter);
            if (
              value &&
              publisher &&
              (value.reservation?.publisher === publisher || value.lease?.publisher === publisher)
            )
              end(value, updatedAt);
          }),
        admission: (threadId, publisher) =>
          lock.withPermits(1)(
            Effect.sync(() => {
              const reservation = topics.get(threadId)?.reservation;
              return reservation?.publisher === publisher &&
                !reservation.revoked &&
                isCurrentStart(reservation.start)
                ? reservation
                : undefined;
            }),
          ),
        open: (threadId, publisher, reservation) =>
          lock.withPermits(1)(
            now.pipe(
              Effect.map((updatedAt) => {
                const value = topics.get(threadId);
                if (
                  !value ||
                  value.deleted ||
                  publisher.retired ||
                  value.reservation !== reservation ||
                  reservation.publisher !== publisher ||
                  reservation.revoked ||
                  !isCurrentStart(reservation.start) ||
                  value.lease
                )
                  return undefined;
                const lease: ExtensionLease = {
                  publisher,
                  threadId,
                  generation: NodeCrypto.randomUUID(),
                };
                value.lease = lease;
                value.snapshot = {
                  ...emptyExtensionState(threadId, updatedAt),
                  active: true,
                  generation: lease.generation,
                  providerInstanceId: publisher.instanceId,
                };
                wake(value);
                return lease;
              }),
            ),
          ),
        write: (lease, input) =>
          mutate((updatedAt) => {
            const value = topics.get(lease.threadId);
            if (!value || value.deleted || lease.publisher.retired || value.lease !== lease) return;
            const next = reduceExtensionState(value.snapshot, input);
            if (next === value.snapshot) return;
            value.snapshot = { ...next, revision: value.snapshot.revision + 1, updatedAt };
            wake(value);
          }),
        close,
        retainedRecords: lock.withPermits(1)(Effect.sync(() => topics.size)),
        retainedStarts: lock.withPermits(1)(
          Effect.sync(() => ({
            lanes: lanes.size,
            admissions: Array.from(lanes.values()).reduce(
              (count, lane) => count + lane.admissions.size,
              0,
            ),
          })),
        ),
        delete: (threadId) =>
          mutate((updatedAt) => {
            const lane = lanes.get(threadId);
            if (lane) for (const start of lane.admissions) revokedStarts.add(start);
            const value = topics.get(threadId);
            if (!value) return;
            value.deleted = true;
            end(value, updatedAt);
            // Old subscribers retain this terminal topic, never a recreated thread.
            topics.delete(threadId);
          }),
        observe: (threadId, verify) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const subscriber: Subscriber = { wake: yield* Queue.dropping<"WAKE">(1) };
              const attached = yield* Effect.acquireRelease(
                lock.withPermits(1)(
                  Effect.gen(function* () {
                    yield* verify;
                    const updatedAt = yield* now;
                    return yield* Effect.sync(() => {
                      const value = topic(threadId, updatedAt);
                      value.subscribers.add(subscriber);
                      return { value, initial: value.snapshot };
                    });
                  }),
                ),
                (attached) =>
                  lock
                    .withPermits(1)(
                      Effect.sync(() => {
                        attached.value.subscribers.delete(subscriber);
                        collect(threadId, attached.value);
                      }),
                    )
                    .pipe(Effect.andThen(Queue.shutdown(subscriber.wake))),
                { interruptible: true },
              );
              const changes = Stream.fromQueue(subscriber.wake).pipe(
                Stream.mapEffect(() =>
                  lock.withPermits(1)(
                    Effect.sync(() => ({
                      snapshot: attached.value.snapshot,
                      deleted: attached.value.deleted,
                    })),
                  ),
                ),
                Stream.takeUntil(({ deleted }) => deleted),
                Stream.map(({ snapshot }) => snapshot),
              );
              return Stream.succeed(attached.initial).pipe(Stream.concat(changes));
            }),
          ),
        withStart: (start, effect) =>
          Effect.gen(function* () {
            const lane = yield* lock.withPermits(1)(validateStart(start));
            return yield* lane.semaphore.withPermits(1)(
              Effect.gen(function* () {
                yield* lock.withPermits(1)(validateStart(start));
                const result = yield* effect;
                // Adoption also awaits provider/directory work; deletion must fence its return.
                yield* lock.withPermits(1)(validateStart(start));
                return result;
              }),
            );
          }),
      });
    }),
  );
}
