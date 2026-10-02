import {
  type EnvironmentId,
  type OrchestrationThreadShell,
  type ProviderPiSessionStats,
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

export interface PiSessionStatsState {
  readonly status: "unavailable" | "loading" | "current" | "stale" | "error";
  readonly snapshot: ProviderPiSessionStats | null;
  readonly message: string | null;
  readonly canRefresh: boolean;
}

export function piSessionStatsLines(stats: ProviderPiSessionStats): ReadonlyArray<string> {
  const count = (n: number) => n.toLocaleString("en-US");
  const context = stats.contextUsage;
  return [
    "All session entries, including abandoned branches and compaction.",
    `Messages: ${count(stats.messages.total)} total, ${count(stats.messages.user)} user, ${count(stats.messages.assistant)} assistant`,
    `Tools: ${count(stats.messages.toolCalls)} calls, ${count(stats.messages.toolResults)} results`,
    `Cumulative tokens: ${count(stats.tokens.total)}`,
    `Input ${count(stats.tokens.input)}, output ${count(stats.tokens.output)}, cache read ${count(stats.tokens.cacheRead)}, cache write ${count(stats.tokens.cacheWrite)}`,
    `Native-reported cost: $${stats.cost.amount.toLocaleString("en-US", { maximumSignificantDigits: 15 })} USD. Not an invoice or account quota.`,
    context === null
      ? "Current context estimate: unavailable"
      : context.tokens === null
        ? `Current context estimate: unknown until the next response. Window ${count(context.contextWindow)} tokens.`
        : `Current context estimate: ${count(context.tokens)} / ${count(context.contextWindow)} tokens${context.percent === null ? "" : `, ${context.percent.toFixed(1)}%`}`,
    `Fetched ${stats.fetchedAt}`,
  ];
}

/** One request per open/refresh/reconnect, fenced by environment, transport and native lease. */
export function createEnvironmentPiSessionStatsAtoms<R, E>(
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
      const supported =
        provider?.driver === "pi" && provider.capabilities?.sessions?.stats === true;
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
            const stats = yield* request(WS_METHODS.providerGetPiSessionStats, {
              threadId: ref.threadId,
              expectedProviderInstanceId: owner,
            });
            if (
              Option.getOrNull(yield* SubscriptionRef.get(supervisor.session)) !== session ||
              stats.threadId !== ref.threadId ||
              stats.providerInstanceId !== owner ||
              stats.generation !== generation
            )
              return yield* Effect.interrupt;
            return { stats, session } satisfies {
              stats: ProviderPiSessionStats;
              session: RpcSession;
            };
          }),
        );
      })
      .pipe(Atom.setIdleTTL(0));
  });
  const states = Atom.family((key: string) =>
    Atom.make((get): PiSessionStatsState => {
      const current = get(source(key));
      if (!current.supported || !current.owner || !current.live)
        return {
          status: "unavailable",
          snapshot: null,
          message: "Native session statistics are unavailable for this owner.",
          canRefresh: false,
        };
      const result = get(query(key));
      const previous = Option.getOrNull(AsyncResult.value(result));
      const snapshot =
        previous?.stats.providerInstanceId === current.owner &&
        (current.generation === null || previous.stats.generation === current.generation)
          ? previous.stats
          : null;
      const connected = current.session !== null && current.generation !== null;
      if (!connected || (previous && previous.session !== current.session))
        return {
          status: "stale",
          snapshot,
          message: snapshot
            ? "Disconnected or reconnecting. Statistics are last known."
            : "Waiting for the live native process.",
          canRefresh: connected && !result.waiting,
        };
      if (AsyncResult.isFailure(result))
        return {
          status: "error",
          snapshot,
          message: snapshot
            ? "Could not refresh. Statistics are last known."
            : "Could not read native session statistics. Refresh to try again.",
          canRefresh: true,
        };
      return {
        status: result.waiting ? "loading" : snapshot ? "current" : "loading",
        snapshot,
        message: result.waiting ? "Reading native session statistics…" : null,
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
