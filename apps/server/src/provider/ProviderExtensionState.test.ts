import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { ProviderExtensionState, type ExtensionStartAdmission } from "./ProviderExtensionState.ts";

const THREAD = ThreadId.make("extension-state");
const admit = Effect.fnUntraced(function* (
  service: ProviderExtensionState["Service"],
  instance = "pi",
  threadId = THREAD,
  admission?: ExtensionStartAdmission,
) {
  const adapter = {};
  const publisher = yield* service.publisher(ProviderInstanceId.make(instance));
  yield* service.associate(adapter, publisher);
  const start = admission ?? (yield* service.startAdmission(threadId));
  yield* service.reserve(start, adapter);
  const reservation = yield* service.admission(threadId, publisher);
  if (!reservation) return yield* Effect.die("Missing reservation");
  const lease = yield* service.open(threadId, publisher, reservation);
  if (!lease) return yield* Effect.die("Missing lease");
  return { adapter, publisher, reservation, lease, start };
});
const widget = (text: string) => ({ method: "setWidget", widgetKey: "key", widgetLines: [text] });

it.layer(ProviderExtensionState.layer)("bounded ephemeral ownership", (it) => {
  it.effect(
    "captures immutable initial state, coalesces a slow consumer, and releases subscriber-only records",
    () =>
      Effect.gen(function* () {
        const service = yield* ProviderExtensionState;
        const owner = yield* admit(service);
        yield* service.write(owner.lease, widget("initial"));
        yield* Effect.scoped(
          Effect.gen(function* () {
            const pull = yield* Stream.toPull(service.observe(THREAD, Effect.void));
            const initial = (yield* pull)[0];
            for (let n = 0; n < 500; n++) yield* service.write(owner.lease, widget(String(n)));
            expect(initial?.widgets[0]?.lines).toEqual(["initial"]);
            const current = (yield* pull)[0];
            expect(current?.widgets[0]?.lines).toEqual(["499"]);
            expect(current?.revision).toBe(501);
            yield* service.write(owner.lease, widget("499"));
            expect(
              Option.getOrNull(yield* Stream.runHead(service.observe(THREAD, Effect.void)))
                ?.revision,
            ).toBe(501);
            yield* service.write(owner.lease, widget("after capture"));
            expect((yield* pull)[0]?.widgets[0]?.lines).toEqual(["after capture"]);
            yield* service.close(owner.lease);
            expect((yield* pull)[0]).toMatchObject({
              active: false,
              widgets: [],
              editorSuggestion: null,
            });
            expect(yield* service.retainedRecords).toBe(1);
          }),
        );
        expect(yield* service.retainedRecords).toBe(0);
        for (let n = 0; n < 100; n++)
          yield* Stream.runHead(service.observe(ThreadId.make(`visited-${n}`), Effect.void));
        expect(yield* service.retainedRecords).toBe(0);
      }),
  );
  it.effect(
    "attaches and captures the initial snapshot atomically against a waiting mutation",
    () =>
      Effect.gen(function* () {
        const service = yield* ProviderExtensionState;
        const owner = yield* admit(service);
        yield* service.write(owner.lease, widget("before"));
        const verifying = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const reading = yield* service
          .observe(
            THREAD,
            Deferred.succeed(verifying, undefined).pipe(Effect.andThen(Deferred.await(release))),
          )
          .pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped);
        yield* Deferred.await(verifying);
        const writing = yield* service
          .write(owner.lease, widget("after"))
          .pipe(Effect.forkScoped({ startImmediately: true }));
        yield* Deferred.succeed(release, undefined);
        const states = yield* Fiber.join(reading);
        yield* Fiber.join(writing);
        expect(states.map((state) => state.widgets[0]?.lines)).toEqual([["before"], ["after"]]);
        expect(states.map((state) => state.revision)).toEqual([1, 2]);
      }),
  );
  it.effect(
    "fences old open/write/end across same-instance reconstruction and non-Pi replacement",
    () =>
      Effect.gen(function* () {
        const service = yield* ProviderExtensionState;
        const old = yield* admit(service);
        yield* service.write(old.lease, widget("old"));
        const current = yield* admit(service);
        yield* service.write(current.lease, widget("current"));
        expect(yield* service.open(THREAD, old.publisher, old.reservation)).toBeUndefined();
        yield* service.write(old.lease, widget("late"));
        yield* service.close(old.lease);
        const snapshot = yield* Stream.runHead(service.observe(THREAD, Effect.void));
        expect(Option.getOrNull(snapshot)?.widgets[0]?.lines).toEqual(["current"]);
        expect(Option.getOrNull(snapshot)?.generation).toBe(current.lease.generation);
        yield* service.reserve(yield* service.startAdmission(THREAD), {});
        yield* service.write(current.lease, widget("resurrect"));
        expect(
          Option.getOrNull(yield* Stream.runHead(service.observe(THREAD, Effect.void))),
        ).toMatchObject({ active: false, widgets: [] });
      }),
  );
  it.effect("retains terminal deletion for old subscribers even if the thread is recreated", () =>
    Effect.gen(function* () {
      const service = yield* ProviderExtensionState;
      const owner = yield* admit(service);
      const pull = yield* Stream.toPull(service.observe(THREAD, Effect.void));
      yield* pull;
      yield* service.delete(THREAD);
      const replacement = yield* admit(service, "pi-other");
      yield* service.write(replacement.lease, widget("new thread"));
      yield* service.close(owner.lease);
      expect((yield* pull)[0]).toMatchObject({ active: false, widgets: [] });
      expect(Exit.isFailure(yield* Effect.exit(pull))).toBe(true);
      expect(yield* service.open(THREAD, owner.publisher, owner.reservation)).toBeUndefined();
      expect(
        Option.getOrNull(yield* Stream.runHead(service.observe(THREAD, Effect.void)))?.widgets[0]
          ?.lines,
      ).toEqual(["new thread"]);
    }),
  );
  it.effect(
    "retires scoped publishers and failed-start reservations without retaining content",
    () =>
      Effect.gen(function* () {
        const service = yield* ProviderExtensionState;
        const scope = yield* Scope.make();
        const owner = yield* admit(service).pipe(Scope.provide(scope));
        yield* service.write(owner.lease, widget("scoped"));
        yield* Scope.close(scope, Exit.void);
        expect(yield* service.open(THREAD, owner.publisher, owner.reservation)).toBeUndefined();
        yield* service.reserve(yield* service.startAdmission(THREAD), owner.adapter);
        expect(yield* service.retainedRecords).toBe(0);
        const pending = yield* service.publisher(ProviderInstanceId.make("pending"));
        const adapter = {};
        yield* service.associate(adapter, pending);
        yield* service.reserve(yield* service.startAdmission(THREAD), adapter);
        yield* service.failStart(THREAD, adapter);
        expect(yield* service.retainedRecords).toBe(0);
      }),
  );
  it.effect("serializes competing starts while deletion invalidates a blocked admission", () =>
    Effect.gen(function* () {
      const service = yield* ProviderExtensionState;
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const order: string[] = [];
      const firstStart = yield* service.startAdmission(THREAD);
      const first = yield* service
        .withStart(
          firstStart,
          Effect.gen(function* () {
            const owner = yield* admit(service, "pi", THREAD, firstStart);
            order.push("first");
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return yield* service.open(THREAD, owner.publisher, owner.reservation);
          }),
        )
        .pipe(Effect.exit, Effect.forkScoped);
      yield* Deferred.await(entered);
      const secondStart = yield* service.startAdmission(THREAD);
      const second = yield* service
        .withStart(
          secondStart,
          Effect.sync(() => {
            order.push("second");
          }),
        )
        .pipe(Effect.forkScoped);
      yield* service.delete(THREAD);
      yield* Deferred.succeed(release, undefined);
      expect(Exit.isFailure(yield* Fiber.join(first))).toBe(true);
      expect(Exit.isFailure(yield* Fiber.join(second).pipe(Effect.exit))).toBe(true);
      expect(order).toEqual(["first"]);
    }),
  );
  it.effect(
    "admissions cannot be substituted after deletion or scope release, while live leases outlast startup",
    () =>
      Effect.gen(function* () {
        const service = yield* ProviderExtensionState;
        const publisher = yield* service.publisher(ProviderInstanceId.make("pi"));
        const adapter = {};
        yield* service.associate(adapter, publisher);
        const oldScope = yield* Scope.make();
        const old = yield* service.startAdmission(THREAD).pipe(Scope.provide(oldScope));
        yield* service.reserve(old, adapter);
        const oldReservation = yield* service.admission(THREAD, publisher);
        if (!oldReservation) return yield* Effect.die("Missing old reservation");
        yield* service.delete(THREAD);
        const newScope = yield* Scope.make();
        const current = yield* service.startAdmission(THREAD).pipe(Scope.provide(newScope));
        yield* service.reserve(current, adapter);
        const reservation = yield* service.admission(THREAD, publisher);
        if (!reservation) return yield* Effect.die("Missing current reservation");
        expect(Exit.isFailure(yield* service.reserve(old, adapter).pipe(Effect.exit))).toBe(true);
        expect(yield* service.open(THREAD, publisher, oldReservation)).toBeUndefined();
        const lease = yield* service.open(THREAD, publisher, reservation);
        if (!lease) return yield* Effect.die("Missing live lease");
        yield* Scope.close(oldScope, Exit.void);
        yield* Scope.close(newScope, Exit.void);
        expect(yield* service.retainedStarts).toEqual({ lanes: 0, admissions: 0 });
        expect(Exit.isFailure(yield* service.reserve(current, adapter).pipe(Effect.exit))).toBe(
          true,
        );
        yield* service.write(lease, widget("still live"));
        expect(
          Option.getOrThrow(yield* Stream.runHead(service.observe(THREAD, Effect.void))).widgets[0]
            ?.lines,
        ).toEqual(["still live"]);
        yield* service.close(lease);
        const pendingScope = yield* Scope.make();
        const pending = yield* service.startAdmission(THREAD).pipe(Scope.provide(pendingScope));
        yield* service.reserve(pending, adapter);
        const unopened = yield* service.admission(THREAD, publisher);
        if (!unopened) return yield* Effect.die("Missing pending reservation");
        yield* Scope.close(pendingScope, Exit.void);
        expect(yield* service.open(THREAD, publisher, unopened)).toBeUndefined();
        expect(yield* service.retainedRecords).toBe(0);
        expect(yield* service.retainedStarts).toEqual({ lanes: 0, admissions: 0 });
      }),
  );
  it.effect(
    "canceled queued admissions release their lane membership and leave later starts usable",
    () =>
      Effect.gen(function* () {
        const service = yield* ProviderExtensionState;
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const queued = yield* Deferred.make<void>();
        const first = yield* Effect.scoped(
          Effect.gen(function* () {
            const start = yield* service.startAdmission(THREAD);
            return yield* service.withStart(
              start,
              Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))),
            );
          }),
        ).pipe(Effect.exit, Effect.forkScoped);
        yield* Deferred.await(entered);
        const second = yield* Effect.scoped(
          Effect.gen(function* () {
            const start = yield* service.startAdmission(THREAD);
            yield* Deferred.succeed(queued, undefined);
            return yield* service.withStart(start, Effect.die("Canceled queued work ran"));
          }),
        ).pipe(Effect.forkScoped({ startImmediately: true }));
        yield* Deferred.await(queued);
        expect(yield* service.retainedStarts).toEqual({ lanes: 1, admissions: 2 });
        yield* Fiber.interrupt(second);
        expect(yield* service.retainedStarts).toEqual({ lanes: 1, admissions: 1 });
        yield* service.delete(THREAD);
        yield* Deferred.succeed(release, undefined);
        expect(Exit.isFailure(yield* Fiber.join(first))).toBe(true);
        expect(yield* service.retainedStarts).toEqual({ lanes: 0, admissions: 0 });
        expect(
          yield* Effect.scoped(
            Effect.gen(function* () {
              const start = yield* service.startAdmission(THREAD);
              return yield* service.withStart(start, Effect.succeed("new"));
            }),
          ),
        ).toBe("new");
        expect(yield* service.retainedStarts).toEqual({ lanes: 0, admissions: 0 });
      }),
  );
  it.effect(
    "cancels a blocked projection read without retaining a subscriber or blocking later visits",
    () =>
      Effect.gen(function* () {
        const service = yield* ProviderExtensionState;
        const verifying = yield* Deferred.make<void>();
        const reading = yield* service
          .observe(
            THREAD,
            Deferred.succeed(verifying, undefined).pipe(Effect.andThen(Effect.never)),
          )
          .pipe(Stream.runDrain, Effect.forkScoped);
        yield* Deferred.await(verifying);
        yield* Fiber.interrupt(reading);
        expect(yield* service.retainedRecords).toBe(0);
        yield* Stream.runHead(service.observe(THREAD, Effect.void));
        expect(yield* service.retainedRecords).toBe(0);
      }),
  );
  it.effect(
    "does not attach or retain a record when projection verification denies the thread",
    () =>
      Effect.gen(function* () {
        const service = yield* ProviderExtensionState;
        const exit = yield* Effect.exit(
          Stream.runHead(service.observe(THREAD, Effect.fail("missing thread"))),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(yield* service.retainedRecords).toBe(0);
      }),
  );
});
