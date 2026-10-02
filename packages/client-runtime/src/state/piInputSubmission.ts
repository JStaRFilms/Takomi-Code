import {
  ORCHESTRATION_WS_METHODS,
  WS_METHODS,
  ProviderPiQueuedInputError,
  piInputSubmissionsHaveSameContent,
  type EnvironmentId,
  type OrchestrationThreadShell,
  type PiInputSubmission,
  type ProviderSubmitPiQueuedInputInput,
  type ProviderInstanceId,
  type ScopedThreadRef,
  type ServerConfig,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import type { RpcSession } from "../rpc/session.ts";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { parseThreadKey, threadKey } from "./entities.ts";
import type { ThreadExtensionState } from "./providerExtensionState.ts";
import { createRuntimeCommand, followStreamInEnvironment, runInEnvironment } from "./runtime.ts";

// Native acknowledgment has its own unchanged 30-second deadline. This only bounds local confirmation.
const PI_INPUT_CONFIRMATION_WINDOW = Duration.seconds(60);

export interface PiInputClientState {
  readonly recording: boolean;
  readonly pending: boolean;
  readonly submission: PiInputSubmission | null;
  readonly message: string | null;
}
export const piInputOutcomeText = (outcome: PiInputSubmission["outcome"]): string => {
  switch (outcome) {
    case "unconfirmed":
      return "Recorded. Native acceptance is unconfirmed. Do not retry automatically.";
    case "queued":
      return "Accepted by native Pi. This does not start idle work or prove current queue membership.";
    case "handled":
      return "Handled by a native input hook. This does not mean model work completed.";
    case "not-submitted":
      return "Not submitted. Authored content remains available.";
    case "rejected":
      return "Rejected by native Pi. Authored content remains available.";
    case "unknown":
      return "Acceptance is unknown. Submitting again may duplicate native work.";
  }
};

/** Mounted clients own one hot listener. It never resumes or replays a write. */
export function createEnvironmentPiInputSubmissionAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
  options: {
    readonly threadShellAtom: (ref: ScopedThreadRef) => Atom.Atom<OrchestrationThreadShell | null>;
    readonly configValueAtom: (id: EnvironmentId) => Atom.Atom<ServerConfig | null>;
    readonly extensionStateAtom: (ref: ScopedThreadRef) => Atom.Atom<ThreadExtensionState>;
  },
) {
  const transport = Atom.family((id: EnvironmentId) =>
    runtime
      .atom(
        followStreamInEnvironment(
          id,
          Stream.unwrap(
            EnvironmentSupervisor.pipe(
              Effect.map((s) =>
                SubscriptionRef.changes(s.session).pipe(
                  Stream.zipLatestWith(SubscriptionRef.changes(s.state), (session, state) => ({
                    session,
                    state,
                  })),
                ),
              ),
            ),
          ),
        ),
      )
      .pipe(Atom.setIdleTTL(0)),
  );
  const source = Atom.family((key: string) =>
    Atom.make((get) => {
      const ref = parseThreadKey(key);
      const thread = get(options.threadShellAtom(ref));
      const owner = thread?.session?.providerInstanceId;
      const provider = get(options.configValueAtom(ref.environmentId))?.providers.find(
        (p) => p.instanceId === owner,
      );
      const extension = get(options.extensionStateAtom(ref));
      const connection = Option.getOrNull(AsyncResult.value(get(transport(ref.environmentId))));
      const session = connection ? Option.getOrNull(connection.session) : null;
      if (
        !owner ||
        provider?.driver !== "pi" ||
        provider.capabilities?.queueState !== true ||
        thread?.session?.status === "stopped" ||
        thread?.session?.status === "error" ||
        thread?.session?.status === "interrupted" ||
        extension.status !== "current" ||
        !extension.snapshot.active ||
        !extension.snapshot.generation ||
        extension.snapshot.providerInstanceId !== owner ||
        !session ||
        connection?.state.phase !== "connected"
      )
        return null;
      return {
        owner,
        generation: extension.snapshot.generation,
        session,
        connectionGeneration: connection.state.generation,
      };
    }).pipe(
      Atom.withEquality<{
        owner: ProviderInstanceId;
        generation: string;
        session: RpcSession;
        connectionGeneration: number;
      } | null>(
        (a, b) =>
          a?.owner === b?.owner &&
          a?.generation === b?.generation &&
          a?.session === b?.session &&
          a?.connectionGeneration === b?.connectionGeneration,
      ),
    ),
  );
  const resource = Atom.family((key: string) =>
    runtime
      .atom((get) => {
        const ref = parseThreadKey(key);
        const captured = get(source(key));
        if (!captured) return Effect.succeed(null);
        return runInEnvironment(
          ref.environmentId,
          Effect.gen(function* () {
            const state = yield* SubscriptionRef.make<PiInputClientState>({
              recording: false,
              pending: false,
              submission: null,
              message: null,
            });
            const ready = yield* Deferred.make<void>();
            const scope = yield* Scope.Scope;
            type PendingInput = {
              input: ProviderSubmitPiQueuedInputInput;
              consume: (() => void) | null;
              timer: Fiber.Fiber<void> | null;
            };
            let active = true;
            let current: PendingInput | null = null;
            const release = Effect.fnUntraced(function* (operation: PendingInput) {
              if (current === operation) current = null;
              operation.consume = null;
              const timer = operation.timer;
              operation.timer = null;
              if (timer) yield* Fiber.interrupt(timer);
            });
            yield* Effect.addFinalizer(() =>
              Effect.gen(function* () {
                active = false;
                if (current) yield* release(current);
                yield* Deferred.succeed(ready, undefined);
              }),
            );
            // The first snapshot proves the server installed its hot subscription before admission.
            yield* captured.session.client[ORCHESTRATION_WS_METHODS.subscribeThread]({
              threadId: ref.threadId,
              turnLimit: 1,
            }).pipe(
              Stream.runForEach((item) =>
                Effect.gen(function* () {
                  yield* Deferred.succeed(ready, undefined);
                  if (
                    item.kind !== "event" ||
                    (item.event.type !== "thread.pi-input-recorded" &&
                      item.event.type !== "thread.pi-input-resolved")
                  )
                    return;
                  const submission = item.event.payload.submission;
                  if (
                    !active ||
                    submission.threadId !== ref.threadId ||
                    submission.providerInstanceId !== captured.owner ||
                    submission.generation !== captured.generation
                  )
                    return;
                  if (!current || submission.requestId !== current.input.requestId) {
                    if (submission.outcome !== "unconfirmed")
                      yield* SubscriptionRef.update(state, (previous) => {
                        if (
                          current ||
                          previous.submission?.requestId !== submission.requestId ||
                          previous.submission.outcome !== "unconfirmed" ||
                          !piInputSubmissionsHaveSameContent(previous.submission, submission)
                        )
                          return previous;
                        return {
                          ...previous,
                          submission,
                          message: piInputOutcomeText(submission.outcome),
                        };
                      });
                    return;
                  }
                  const operation = current;
                  const input = operation.input;
                  if (
                    !piInputSubmissionsHaveSameContent(submission, {
                      requestId: input.requestId,
                      threadId: input.threadId,
                      providerInstanceId: input.expectedProviderInstanceId,
                      generation: input.expectedGeneration,
                      intent: input.intent,
                      text: input.text,
                      attachments: input.attachments.map((attachment, index) => ({
                        ...attachment,
                        id: attachment.id ?? submission.attachments[index]?.id ?? "",
                      })),
                      ...(input.context ? { context: input.context } : {}),
                      createdAt: submission.createdAt,
                      updatedAt: submission.updatedAt,
                      fingerprint: submission.fingerprint,
                      outcome: submission.outcome,
                    })
                  )
                    return;
                  const consume = submission.outcome !== "unconfirmed" ? operation.consume : null;
                  if (submission.outcome !== "unconfirmed") yield* release(operation);
                  yield* SubscriptionRef.update(state, (previous) =>
                    current && current !== operation
                      ? previous
                      : {
                          ...previous,
                          pending: submission.outcome === "unconfirmed" && current === operation,
                          submission,
                          message:
                            submission.outcome === "unconfirmed" && current !== operation
                              ? previous.message
                              : piInputOutcomeText(submission.outcome),
                        },
                  );
                  if (
                    active &&
                    get(source(key)) === captured &&
                    (submission.outcome === "queued" || submission.outcome === "handled")
                  )
                    consume?.();
                }),
              ),
              Effect.catchCause(() =>
                SubscriptionRef.update(state, (previous) => ({
                  ...previous,
                  recording: false,
                  pending: false,
                  message:
                    "Disconnected. Acceptance remains unconfirmed; nothing will be replayed.",
                })),
              ),
              Effect.ensuring(
                Effect.gen(function* () {
                  active = false;
                  if (current) yield* release(current);
                  yield* SubscriptionRef.update(state, (previous) => ({
                    ...previous,
                    recording: false,
                    pending: false,
                    message:
                      previous.submission && previous.submission.outcome !== "unconfirmed"
                        ? previous.message
                        : "Native input listener ended. Acceptance is unconfirmed; nothing will be replayed.",
                  }));
                  yield* Deferred.succeed(ready, undefined);
                }),
              ),
              Effect.forkScoped,
            );
            return {
              state,
              submit: Effect.fnUntraced(function* (
                input: ProviderSubmitPiQueuedInputInput,
                consume: () => void,
              ) {
                yield* Deferred.await(ready);
                if (
                  !active ||
                  get(source(key)) !== captured ||
                  input.expectedProviderInstanceId !== captured.owner ||
                  input.expectedGeneration !== captured.generation
                )
                  return yield* new ProviderPiQueuedInputError({ reason: "owner-unavailable" });
                if (current) return yield* new ProviderPiQueuedInputError({ reason: "busy" });
                const operation: PendingInput = { input, consume, timer: null };
                current = operation;
                yield* SubscriptionRef.set(state, {
                  recording: true,
                  pending: true,
                  submission: null,
                  message: "Recording native input…",
                });
                return yield* captured.session.client[WS_METHODS.providerSubmitPiQueuedInput](
                  input,
                ).pipe(
                  Effect.tap(() =>
                    Effect.gen(function* () {
                      if (current === operation) {
                        operation.timer = yield* Effect.sleep(PI_INPUT_CONFIRMATION_WINDOW).pipe(
                          Effect.andThen(
                            Effect.gen(function* () {
                              if (!active || current !== operation || get(source(key)) !== captured)
                                return;
                              current = null;
                              operation.consume = null;
                              operation.timer = null;
                              yield* SubscriptionRef.update(state, (previous) =>
                                current ||
                                (previous.submission &&
                                  previous.submission.outcome !== "unconfirmed")
                                  ? previous
                                  : {
                                      ...previous,
                                      recording: false,
                                      pending: false,
                                      message:
                                        "Local confirmation wait ended. Native acceptance is unconfirmed. Your draft stays. Submitting again may duplicate native work.",
                                    },
                              );
                            }),
                          ),
                          Effect.forkIn(scope),
                        );
                        if (current !== operation) yield* release(operation);
                      }
                      yield* SubscriptionRef.update(state, (previous) =>
                        current !== operation && previous.submission?.requestId !== input.requestId
                          ? previous
                          : {
                              ...previous,
                              recording: false,
                              message: previous.submission
                                ? piInputOutcomeText(previous.submission.outcome)
                                : "Recorded. Native acceptance is unconfirmed.",
                            },
                      );
                    }),
                  ),
                  Effect.tapError(() =>
                    Effect.gen(function* () {
                      const ownsPending = current === operation;
                      if (ownsPending) yield* release(operation);
                      yield* SubscriptionRef.update(state, (previous) => {
                        if (!ownsPending && previous.submission?.requestId !== input.requestId)
                          return previous;
                        return {
                          ...previous,
                          recording: false,
                          pending: false,
                          message:
                            previous.submission && previous.submission.outcome !== "unconfirmed"
                              ? piInputOutcomeText(previous.submission.outcome)
                              : "Could not confirm recording. Your draft stays. Do not retry automatically.",
                        };
                      });
                    }),
                  ),
                );
              }),
            };
          }),
        );
      })
      .pipe(Atom.setIdleTTL(0)),
  );
  const state = Atom.family((key: string) =>
    runtime
      .atom((get) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const value = yield* get.result(resource(key));
            return value
              ? SubscriptionRef.changes(value.state)
              : Stream.succeed<PiInputClientState>({
                  recording: false,
                  pending: false,
                  submission: null,
                  message: null,
                });
          }),
        ),
      )
      .pipe(Atom.setIdleTTL(0)),
  );
  return {
    sourceAtom: (ref: ScopedThreadRef) => source(threadKey(ref)),
    stateAtom: (ref: ScopedThreadRef) => state(threadKey(ref)),
    submit: createRuntimeCommand(runtime, {
      label: "pi-input:submit",
      execute: (
        target: {
          ref: ScopedThreadRef;
          input: ProviderSubmitPiQueuedInputInput;
          consume: () => void;
        },
        registry,
      ) =>
        Effect.gen(function* () {
          const value = yield* AtomRegistry.getResult(registry, resource(threadKey(target.ref)));
          if (!value) return yield* new ProviderPiQueuedInputError({ reason: "owner-unavailable" });
          return yield* value.submit(target.input, target.consume);
        }),
    }),
  };
}
