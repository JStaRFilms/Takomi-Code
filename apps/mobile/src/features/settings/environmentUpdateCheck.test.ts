import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { AtomRegistry } from "effect/reactivity";
import { vi } from "vite-plus/test";

import {
  environmentReleaseCheckAtom,
  outdatedServerUpdateTarget,
  releaseCheckError,
} from "./environmentUpdateCheck";

function stubHangingFetch() {
  const { promise: called, resolve } = Promise.withResolvers<AbortSignal>();
  vi.stubGlobal("fetch", (_url: string, init: { signal: AbortSignal }) => {
    resolve(init.signal);
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    });
  });
  return { called, [Symbol.dispose]: () => vi.unstubAllGlobals() };
}

function makeRegistry() {
  const tasks: Array<() => void> = [];
  const registry = AtomRegistry.make({
    scheduleTask: (task) => {
      tasks.push(task);
      return () => undefined;
    },
  });
  const flush = () => {
    for (let task = tasks.shift(); task !== undefined; task = tasks.shift()) task();
  };
  return { registry, flush };
}

describe("environmentReleaseCheckAtom", () => {
  it.effect.each([
    ["t3", "pingdotgg/t3code", null],
    ["takomi", "JStaRFilms/Takomi-Code", "0.0.46"],
  ] as const)(
    "finds the newer %s release and only offers an in-app install for Takomi",
    ([distribution, repository, expectedInstallTarget]) =>
      Effect.gen(function* () {
        const fetchRelease = vi.fn(async () => Response.json({ tag_name: "v0.0.46" }));
        vi.stubGlobal("fetch", fetchRelease);
        using _fetch = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
        const registry = AtomRegistry.make();
        using _registry = { [Symbol.dispose]: () => registry.dispose() };
        const atom = environmentReleaseCheckAtom(EnvironmentId.make(`env-${distribution}`));
        using _mount = { [Symbol.dispose]: registry.mount(atom) };

        registry.set(atom, async () => ({ serverVersion: "0.0.45", distribution }));
        const release = yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true });
        expect(fetchRelease).toHaveBeenCalledWith(
          `https://github.com/${repository}/releases/latest`,
          expect.anything(),
        );
        expect(release.targetVersion).toBe("0.0.46");
        expect(outdatedServerUpdateTarget(release)).toBe(expectedInstallTarget);
      }),
  );

  it("aborts the release lookup when the screen stops reading it", async () => {
    using fetchStub = stubHangingFetch();
    const { registry, flush } = makeRegistry();
    const atom = environmentReleaseCheckAtom(EnvironmentId.make("env-unmount"));
    const unmount = registry.mount(atom);

    registry.set(atom, async () => ({ serverVersion: "0.0.40", distribution: "takomi" }));
    const signal = await fetchStub.called;
    expect(signal.aborted).toBe(false);

    unmount();
    flush();
    expect(signal.aborted).toBe(true);
  });

  it("reports a timeout in words after 20 seconds", async () => {
    using fetchStub = stubHangingFetch();
    using _timers = { [Symbol.dispose]: () => vi.useRealTimers() };
    vi.useFakeTimers();
    const { registry, flush } = makeRegistry();
    const atom = environmentReleaseCheckAtom(EnvironmentId.make("env-timeout"));
    const unmount = registry.mount(atom);

    registry.set(atom, async () => ({ serverVersion: "0.0.40", distribution: "takomi" }));
    const signal = await fetchStub.called;

    await vi.advanceTimersByTimeAsync(20_000);
    expect(signal.aborted).toBe(true);
    expect(releaseCheckError(registry.get(atom))).toBe(
      "Checking for updates timed out. Try again.",
    );
    unmount();
    flush();
  });
});
