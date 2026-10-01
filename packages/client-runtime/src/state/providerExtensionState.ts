import {
  type EnvironmentId,
  type OrchestrationThreadShell,
  type ProviderExtensionStateSnapshot,
  type ScopedThreadRef,
  type ServerConfig,
  type ServerProvider,
  type ThreadId,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { subscribeDynamicWithSession } from "../rpc/client.ts";
import type { RpcSession } from "../rpc/session.ts";
import { parseThreadKey, threadKey } from "./entities.ts";
import { followStreamInEnvironment } from "./runtime.ts";

export type ExtensionStateSupport = "supported" | "unsupported" | "unknown";
export function extensionStateSupport(
  provider: Pick<ServerProvider, "driver" | "capabilities"> | undefined,
): ExtensionStateSupport {
  if (provider?.capabilities?.extensionState === "text-v1") return "supported";
  return provider && provider.driver !== "pi" ? "unsupported" : "unknown";
}
export type ThreadExtensionState =
  | {
      readonly status: "unsupported";
      readonly support: Exclude<ExtensionStateSupport, "supported">;
      readonly snapshot: null;
    }
  | { readonly status: "current"; readonly snapshot: ProviderExtensionStateSnapshot }
  | {
      readonly status: "stale" | "disconnected";
      readonly snapshot: ProviderExtensionStateSnapshot | null;
    };

export function threadExtensionStateChanges(threadId: ThreadId) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const supervisor = yield* EnvironmentSupervisor;
      const wake = yield* Queue.dropping<"WAKE">(1);
      yield* Effect.addFinalizer(() => Queue.shutdown(wake));
      let snapshot: ProviderExtensionStateSnapshot | null = null;
      let snapshotSession: RpcSession | null = null;
      const failed = new WeakSet<RpcSession>();
      const notify = Effect.sync(() => {
        Queue.offerUnsafe(wake, "WAKE");
      });
      const capture = Effect.gen(function* () {
        const session = Option.getOrNull(yield* SubscriptionRef.get(supervisor.session));
        const state: ThreadExtensionState =
          session === null || failed.has(session)
            ? { status: "disconnected", snapshot }
            : snapshot !== null && snapshotSession === session
              ? { status: "current", snapshot }
              : { status: "stale", snapshot };
        return state;
      });
      yield* SubscriptionRef.changes(supervisor.session).pipe(
        Stream.runForEach(() => notify),
        Effect.forkScoped,
      );
      yield* subscribeDynamicWithSession(
        WS_METHODS.providerExtensionStateSubscribe,
        () => Effect.succeed({ threadId }),
        {
          onTransportFailure: (session) =>
            Effect.sync(() => {
              failed.add(session);
              Queue.offerUnsafe(wake, "WAKE");
            }),
          onExpectedFailure: (_cause, session) =>
            Effect.sync(() => {
              failed.add(session);
              Queue.offerUnsafe(wake, "WAKE");
            }),
        },
      ).pipe(
        Stream.runForEach(([session, value]) =>
          Effect.gen(function* () {
            const current = Option.getOrNull(yield* SubscriptionRef.get(supervisor.session));
            if (current !== session || value.threadId !== threadId) return;
            snapshot = value;
            snapshotSession = session;
            failed.delete(session);
            yield* notify;
          }),
        ),
        Effect.catchCause(() =>
          Effect.sync(() => {
            if (snapshotSession) failed.add(snapshotSession);
            Queue.offerUnsafe(wake, "WAKE");
          }),
        ),
        Effect.forkScoped,
      );
      return Stream.fromEffect(capture).pipe(
        Stream.concat(Stream.fromQueue(wake).pipe(Stream.mapEffect(() => capture))),
      );
    }),
  );
}

export function createEnvironmentExtensionStateAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
  options: {
    readonly threadShellAtom: (ref: ScopedThreadRef) => Atom.Atom<OrchestrationThreadShell | null>;
    readonly configValueAtom: (environmentId: EnvironmentId) => Atom.Atom<ServerConfig | null>;
  },
) {
  const raw = Atom.family((key: string) => {
    const ref = parseThreadKey(key);
    return runtime
      .atom(followStreamInEnvironment(ref.environmentId, threadExtensionStateChanges(ref.threadId)))
      .pipe(Atom.setIdleTTL(0));
  });
  const family = Atom.family((key: string) => {
    const ref = parseThreadKey(key);
    return Atom.make((get): ThreadExtensionState => {
      const thread = get(options.threadShellAtom(ref));
      const config = get(options.configValueAtom(ref.environmentId));
      const provider = config?.providers.find(
        (provider) => provider.instanceId === thread?.modelSelection.instanceId,
      );
      const support = extensionStateSupport(provider);
      if (support !== "supported") return { status: "unsupported", support, snapshot: null };
      const value = get(raw(key));
      return AsyncResult.isSuccess(value)
        ? value.value
        : { status: "disconnected", snapshot: null };
    }).pipe(Atom.setIdleTTL(0), Atom.withLabel(`environment-data:extension-state:${key}`));
  });
  return { stateAtom: (ref: ScopedThreadRef) => family(threadKey(ref)) };
}
