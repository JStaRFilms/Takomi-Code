// @vitest-environment jsdom
import { RegistryContext } from "@effect/atom-react";
import type { PiSessionStatsState } from "@t3tools/client-runtime/state/piSessionStats";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type ProviderPiSessionStats,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const fixture = vi.hoisted(() => ({
  state: null as Atom.Writable<PiSessionStatsState> | null,
  open: null as Atom.Writable<boolean> | null,
  blur: null as (() => void) | null,
}));
vi.mock("../../state/piSessionStats", () => ({
  environmentPiSessionStats: {
    stateAtom: (_ref: ScopedThreadRef) => {
      if (!fixture.state) throw new Error("Missing state");
      return fixture.state;
    },
    openAtom: (_ref: ScopedThreadRef) => {
      if (!fixture.open) throw new Error("Missing open");
      return fixture.open;
    },
    refresh: (registry: AtomRegistry.AtomRegistry) => {
      if (!fixture.state) throw new Error("Missing state");
      registry.set(fixture.state, {
        ...registry.get(fixture.state),
        status: "loading",
        message: "Reading native session statistics…",
        canRefresh: false,
      });
    },
  },
}));
const navigation = {
  addListener: (_event: string, callback: () => void) => {
    fixture.blur = callback;
    return () => {
      fixture.blur = null;
    };
  },
};
vi.mock("@react-navigation/native", () => ({ useNavigation: () => navigation }));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    disabled,
  }: {
    children?: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
    disabled?: boolean;
  }) => (
    <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
  Modal: ({ children }: { children?: ReactNode }) => <div role="dialog">{children}</div>,
  Platform: { OS: "android" },
  useWindowDimensions: () => ({ height: 800, width: 400 }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 20 }),
}));
vi.mock("../../components/ContextSheetSize", () => ({ ContextSheetSize: () => null }));
vi.mock("../../components/AppText", () => ({
  AppText: ({
    children,
    accessibilityRole,
  }: {
    children?: ReactNode;
    accessibilityRole?: string;
  }) => <span role={accessibilityRole === "alert" ? "alert" : undefined}>{children}</span>,
}));
import { PiSessionStatsButton, PiSessionStatsDetails } from "./PiSessionStats";
const REF = { environmentId: EnvironmentId.make("one"), threadId: ThreadId.make("thread") };
const snapshot: ProviderPiSessionStats = {
  threadId: REF.threadId,
  providerInstanceId: ProviderInstanceId.make("pi"),
  generation: "first",
  fetchedAt: "2026-09-30T00:00:00.000Z",
  source: "pi-native",
  scope: "all-session-entries",
  messages: { user: 1, assistant: 1, toolCalls: 2, toolResults: 2, total: 4 },
  tokens: { input: 10000, output: 10000, cacheRead: 10000, cacheWrite: 10000, total: 40000 },
  cost: { amount: 0, currency: "USD", provenance: "native-reported" },
  contextUsage: {
    tokens: null,
    percent: null,
    contextWindow: 200000,
    provenance: "native-estimate",
  },
};

it("uses native detail controls with loading, stale, error and unavailable output, and closes on navigation blur", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const registry = AtomRegistry.make();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const state = Atom.make<PiSessionStatsState>({
    status: "current",
    snapshot,
    message: null,
    canRefresh: true,
  });
  const open = Atom.make(false);
  fixture.state = state;
  fixture.open = open;
  try {
    await act(async () =>
      root.render(
        <RegistryContext.Provider value={registry}>
          <PiSessionStatsButton threadRef={REF} />
          <PiSessionStatsDetails threadRef={REF} />
        </RegistryContext.Provider>,
      ),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Open session statistics"]')
        ?.click(),
    );
    expect(container.textContent).toContain("Cumulative tokens: 40,000");
    expect(container.textContent).toContain("unknown until the next response");
    expect(container.textContent).toContain("$0 USD");
    expect(container.textContent).toContain("abandoned branches");
    const refresh = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Refresh session statistics"]',
    );
    if (!refresh) throw new Error("Missing Refresh");
    await act(async () => refresh.click());
    expect(refresh.disabled).toBe(true);
    expect(container.textContent).toContain("Reading native session statistics");
    await act(async () =>
      registry.set(state, {
        status: "stale",
        snapshot,
        message: "Disconnected. Statistics are last known.",
        canRefresh: false,
      }),
    );
    expect(container.textContent).toContain("last known");
    await act(async () =>
      registry.set(state, {
        status: "error",
        snapshot: null,
        message: "Could not read native session statistics.",
        canRefresh: true,
      }),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not read");
    expect(container.textContent).not.toContain("40,000");
    await act(async () =>
      registry.set(state, {
        status: "unavailable",
        snapshot: null,
        message: "Native session statistics are unavailable for this owner.",
        canRefresh: false,
      }),
    );
    expect(refresh.disabled).toBe(true);
    expect(container.textContent).toContain("unavailable");
    await act(async () => fixture.blur?.());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(registry.get(open)).toBe(false);
  } finally {
    await act(async () => root.unmount());
    registry.dispose();
    container.remove();
    fixture.state = null;
    fixture.open = null;
    vi.unstubAllGlobals();
  }
});
