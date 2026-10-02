// @vitest-environment jsdom
import { RegistryContext } from "@effect/atom-react";
import type { PiQueueState } from "@t3tools/client-runtime/state/piQueueState";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type ProviderPiQueueState,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const fixture = vi.hoisted(() => ({
  state: null as Atom.Writable<PiQueueState> | null,
  open: null as Atom.Writable<boolean> | null,
  blur: null as (() => void) | null,
}));
vi.mock("../../state/piQueueState", () => ({
  environmentPiQueueState: {
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
        message: "Reading native queue state…",
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
import { PiQueueButton, PiQueueDetails } from "./PiQueueDetails";
const REF = { environmentId: EnvironmentId.make("one"), threadId: ThreadId.make("thread") };
const snapshot: ProviderPiQueueState = {
  threadId: REF.threadId,
  providerInstanceId: ProviderInstanceId.make("pi"),
  generation: "first",
  fetchedAt: "2026-09-30T00:00:00.000Z",
  source: "pi-native",
  pendingMessageCount: 4,
  steeringMode: "all",
  followUpMode: "one-at-a-time",
  isStreaming: true,
  isCompacting: false,
};

it("uses native detail controls with loading, stale, error and unavailable output, and closes on navigation blur", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const registry = AtomRegistry.make();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const state = Atom.make<PiQueueState>({
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
          <PiQueueButton threadRef={REF} />
          <PiQueueDetails threadRef={REF} />
        </RegistryContext.Provider>,
      ),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Open native queue state"]')
        ?.click(),
    );
    expect(container.textContent).toContain("Native queued messages: 4 combined");
    expect(container.textContent).toContain("Delivery modes are read-only");
    expect(container.textContent).toContain("Separate from local waiting drafts");
    expect(container.textContent).toContain("Queue contents are unavailable");
    const refresh = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Refresh native queue state"]',
    );
    if (!refresh) throw new Error("Missing Refresh");
    await act(async () => refresh.click());
    expect(refresh.disabled).toBe(true);
    expect(container.textContent).toContain("Reading native queue state");
    await act(async () =>
      registry.set(state, {
        status: "stale",
        snapshot,
        message: "Disconnected. Queue state is last known.",
        canRefresh: false,
      }),
    );
    expect(container.textContent).toContain("last known");
    await act(async () =>
      registry.set(state, {
        status: "error",
        snapshot: null,
        message: "Could not read native queue state.",
        canRefresh: true,
      }),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not read");
    expect(container.textContent).not.toContain("4 combined");
    await act(async () =>
      registry.set(state, {
        status: "unavailable",
        snapshot: null,
        message: "Native queue state is unavailable for this owner.",
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
