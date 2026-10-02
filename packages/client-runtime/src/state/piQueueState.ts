import {
  type EnvironmentId,
  type OrchestrationThreadShell,
  type ProviderPiQueueState,
  type ProviderInstanceId,
  type ScopedThreadRef,
  type ServerConfig,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { request } from "../rpc/client.ts";
import type { RpcSession } from "../rpc/session.ts";
import { parseThreadKey, threadKey } from "./entities.ts";
import type { ThreadExtensionState } from "./providerExtensionState.ts";
import { followStreamInEnvironment, runInEnvironment } from "./runtime.ts";

export interface PiQueueState {
  readonly status: "unavailable" | "loading" | "current" | "stale" | "error";
  readonly snapshot: ProviderPiQueueState | null;
  readonly message: string | null;
  readonly canRefresh: boolean;
}

export function piQueueStateLines(state: ProviderPiQueueState): ReadonlyArray<string> {
  const mode = (value: ProviderPiQueueState["steeringMode"]) =>
    value === "all" ? "All" : "One at a time";
  return [
    `Native queued messages: ${state.pendingMessageCount.toLocaleString("en-US")} combined`,
    "Separate from local waiting drafts. Queue contents are unavailable.",
    `Steering delivery: ${mode(state.steeringMode)}`,
    `Follow-up delivery: ${mode(state.followUpMode)}`,
    "Delivery modes are read-only.",
    `Streaming: ${state.isStreaming ? "Yes" : "No"}`,
    `Compacting: ${state.isCompacting ? "Yes" : "No"}`,
    `Fetched ${state.fetchedAt}`,
  ];
}

/** One request per open/refresh/reconnect, fenced by environment, transport and native lease. */
export function createEnvironmentPiQueueStateAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
  options: {
    readonly threadShellAtom: (ref: ScopedThreadRef) => Atom.Atom<OrchestrationThreadShell | null>;
    readonly configValueAtom: (id: EnvironmentId) => Atom.Atom<ServerConfig | null>;
    readonly extensionStateAtom: (ref: ScopedThreadRef) => Atom.Atom<ThreadExtensionState>;
  },
) {
  const open = Atom.family((_key: string) => Atom.make(false));
  const refresh = Atom.family((_key: string) => Atom.make(0));
  const transport = Atom.family((id: EnvironmentId) =>
    runtime
      .atom(
        followStreamInEnvironment(
          id,
          Stream.unwrap(
            EnvironmentSupervisor.pipe(
              Effect.map((supervisor) => SubscriptionRef.changes(supervisor.session)),
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
      const supported = provider?.driver === "pi" && provider.capabilities?.queueState === true;
      const extension = supported ? get(options.extensionStateAtom(ref)) : null;
      const generation =
        extension?.status === "current" &&
        extension.snapshot.active &&
        extension.snapshot.providerInstanceId === owner
          ? extension.snapshot.generation
          : null;
      const session = Option.getOrNull(
        Option.flatMap(AsyncResult.value(get(transport(ref.environmentId))), (value) => value),
      );
      const live =
        thread?.session?.status !== "stopped" &&
        thread?.session?.status !== "error" &&
        !(extension?.status === "current" && !extension.snapshot.active);
      return { owner, supported, generation, session, live };
    }).pipe(
      Atom.withEquality<{
        owner: ProviderInstanceId | undefined;
        supported: boolean;
        generation: string | null;
        session: RpcSession | null;
        live: boolean;
      }>(
        (a, b) =>
          a.owner === b.owner &&
          a.supported === b.supported &&
          a.generation === b.generation &&
          a.session === b.session &&
          a.live === b.live,
      ),
    ),
  );
  const query = Atom.family((key: string) => {
    const ref = parseThreadKey(key);
    return runtime
      .atom((get) => {
        const isOpen = get(open(key));
        get(refresh(key));
        const captured = get(source(key));
        if (
          !isOpen ||
          !captured.supported ||
          !captured.live ||
          !captured.owner ||
          !captured.generation ||
          !captured.session
        )
          return Effect.never;
        const owner = captured.owner;
        const generation = captured.generation;
        const session = captured.session;
        return runInEnvironment(
          ref.environmentId,
          Effect.gen(function* () {
            const supervisor = yield* EnvironmentSupervisor;
            if (Option.getOrNull(yield* SubscriptionRef.get(supervisor.session)) !== session)
              return yield* Effect.interrupt;
            const queueState = yield* request(WS_METHODS.providerGetPiQueueState, {
              threadId: ref.threadId,
              expectedProviderInstanceId: owner,
              expectedGeneration: generation,
            });
            if (
              Option.getOrNull(yield* SubscriptionRef.get(supervisor.session)) !== session ||
              queueState.threadId !== ref.threadId ||
              queueState.providerInstanceId !== owner ||
              queueState.generation !== generation
            )
              return yield* Effect.interrupt;
            return { queueState, session } satisfies {
              queueState: ProviderPiQueueState;
              session: RpcSession;
            };
          }),
        );
      })
      .pipe(Atom.setIdleTTL(0));
  });
  const states = Atom.family((key: string) =>
    Atom.make((get): PiQueueState => {
      const current = get(source(key));
      if (!current.supported || !current.owner || !current.live)
        return {
          status: "unavailable",
          snapshot: null,
          message: "Native queue state is unavailable for this owner.",
          canRefresh: false,
        };
      const result = get(query(key));
      const previous = Option.getOrNull(AsyncResult.value(result));
      const snapshot =
        previous?.queueState.providerInstanceId === current.owner &&
        (current.generation === null || previous.queueState.generation === current.generation)
          ? previous.queueState
          : null;
      const connected = current.session !== null && current.generation !== null;
      if (!connected || (previous && previous.session !== current.session))
        return {
          status: "stale",
          snapshot,
          message: snapshot
            ? "Disconnected or reconnecting. Queue state is last known."
            : "Waiting for the live native process.",
          canRefresh: connected && !result.waiting,
        };
      if (AsyncResult.isFailure(result))
        return {
          status: "error",
          snapshot,
          message: snapshot
            ? "Could not refresh. Queue state is last known."
            : "Could not read native queue state. Refresh to try again.",
          canRefresh: true,
        };
      return {
        status: result.waiting ? "loading" : snapshot ? "current" : "loading",
        snapshot,
        message: result.waiting ? "Reading native queue state…" : null,
        canRefresh: !result.waiting,
      };
    }).pipe(Atom.setIdleTTL(0)),
  );
  return {
    openAtom: (ref: ScopedThreadRef) => open(threadKey(ref)),
    stateAtom: (ref: ScopedThreadRef) => states(threadKey(ref)),
    refresh: (registry: AtomRegistry.AtomRegistry, ref: ScopedThreadRef) => {
      const key = threadKey(ref);
      if (!registry.get(states(key)).canRefresh) return;
      registry.set(refresh(key), registry.get(refresh(key)) + 1);
    },
  };
}
