// @vitest-environment jsdom
import { RegistryContext } from "@effect/atom-react";
import {
  extensionStatePresentation,
  type ThreadExtensionState,
} from "@t3tools/client-runtime/state/providerExtensionState";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type ProviderExtensionStateSnapshot,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const atoms = vi.hoisted(() => ({
  binding: null as null | {
    presentationAtom: (
      ref: ScopedThreadRef,
    ) => Atom.Atom<ReturnType<typeof extensionStatePresentation>>;
  },
}));
vi.mock("../../state/providerExtensionState", () => ({
  environmentExtensionState: {
    presentationAtom: (ref: ScopedThreadRef) => {
      if (!atoms.binding) throw new Error("Missing presentation fixture");
      return atoms.binding.presentationAtom(ref);
    },
  },
}));
vi.mock("react-native", () => ({
  View: ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => <div aria-label={accessibilityLabel}>{children}</div>,
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Modal: ({ children }: { children?: ReactNode }) => <div data-native-modal>{children}</div>,
  Platform: { OS: "android" },
  useWindowDimensions: () => ({ height: 800, width: 400 }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 20 }),
}));
vi.mock("../../components/AppText", () => ({
  AppText: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../components/ContextSheetSize", () => ({ ContextSheetSize: () => null }));

import { ProviderExtensionText as NativeExtensionText } from "./ProviderExtensionText";

const REF = { environmentId: EnvironmentId.make("one"), threadId: ThreadId.make("thread") };
const OTHER = { ...REF, environmentId: EnvironmentId.make("two") };
function snapshot(generation = "first"): ProviderExtensionStateSnapshot {
  return {
    threadId: REF.threadId,
    providerInstanceId: ProviderInstanceId.make("pi"),
    generation,
    revision: 1,
    active: true,
    updatedAt: "2026-09-30T00:00:00.000Z",
    statuses: [{ key: "status", text: "Ready" }],
    widgets: [
      {
        key: "widget",
        placement: "aboveEditor",
        lines: ["<b>not markup</b>", "https://example.test", "full last line"],
      },
      { key: "widget ", placement: "belowEditor", lines: ["below"] },
    ],
    subtitle: "Runtime text",
    editorSuggestion: { id: "unbound", text: "Never write or send this" },
    truncated: false,
    overflow: false,
  };
}
const sources = Atom.family((_key: string) =>
  Atom.make<ThreadExtensionState>({ status: "current", snapshot: snapshot() }).pipe(Atom.keepAlive),
);
const key = (ref: ScopedThreadRef) => `${ref.environmentId}:${ref.threadId}`;
const presentations = Atom.family((id: string) => {
  const ref = id === key(OTHER) ? OTHER : REF;
  return Atom.make((get) => extensionStatePresentation(ref, get(sources(id))));
});
let registry: AtomRegistry.AtomRegistry;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  registry = AtomRegistry.make();
  atoms.binding = { presentationAtom: (ref) => presentations(key(ref)) };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  registry.dispose();
  container.remove();
  vi.unstubAllGlobals();
});
async function mount(children: ReactNode) {
  await act(() =>
    root.render(<RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>),
  );
}
async function update(state: ThreadExtensionState, ref = REF) {
  await act(() => registry.set(sources(key(ref)), state));
}
function section(name: string) {
  const result = container.querySelector(`[aria-label="Extension ${name}"]`);
  if (!result) throw new Error(`Missing ${name}`);
  return result;
}
function native(ref = REF) {
  return (
    <>
      <NativeExtensionText threadRef={ref} section="statuses" />
      <NativeExtensionText threadRef={ref} section="aboveEditor" />
      <textarea aria-label="Draft" defaultValue="Unsent draft" />
      <NativeExtensionText threadRef={ref} section="belowEditor" />
    </>
  );
}
function press(label: string) {
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!button) throw new Error(`Missing button ${label}`);
  button.click();
}

describe("native extension text with host doubles", () => {
  it("opens full plaintext detail and retains it only for the exact content, owner environment, and generation", async () => {
    await mount(native());
    const editor = container.querySelector("textarea");
    if (!editor) throw new Error("Missing editor");
    expect(
      section("aboveEditor").compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      section("belowEditor").compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_PRECEDING,
    ).not.toBe(0);
    expect(section("belowEditor").textContent).toContain("widget ");
    expect(container.textContent).not.toContain("Never write or send this");
    await act(() => press("Open extension text widget"));
    const modal = () => container.querySelector("[data-native-modal]");
    expect(modal()?.textContent).toContain("full last line");
    expect(modal()?.querySelector("b, a")).toBeNull();
    await update({
      status: "stale",
      snapshot: { ...snapshot(), overflow: true, statuses: [{ key: "status", text: "Unrelated" }] },
    });
    expect(modal()?.textContent).toContain("last known");
    expect(modal()?.textContent).toContain("truncated or omitted");
    await update({
      status: "current",
      snapshot: {
        ...snapshot(),
        widgets: [{ key: "widget", placement: "aboveEditor", lines: ["Replacement"] }],
      },
    });
    expect(modal()).toBeNull();
    await act(() => press("Open extension text widget"));
    expect(modal()?.textContent).toContain("Replacement");
    await update({ status: "current", snapshot: snapshot("new-generation") });
    expect(modal()).toBeNull();
    await act(() => press("Open extension text widget"));
    await mount(native(OTHER));
    expect(modal()).toBeNull();
    expect(container.querySelector("textarea")?.value).toBe("Unsent draft");
  });

  it("removes cleared and inactive detail rather than resurrecting it on reconnect, with honest support markers", async () => {
    await mount(native());
    await act(() => press("Open extension text Runtime subtitle"));
    expect(container.querySelector("[data-native-modal]")?.textContent).toContain("Runtime text");
    await update({ status: "disconnected", snapshot: { ...snapshot(), truncated: true } });
    expect(container.querySelector("[data-native-modal]")?.textContent).toContain("Disconnected");
    expect(container.textContent).toContain("truncated or omitted");
    await update({ status: "current", snapshot: { ...snapshot(), subtitle: null } });
    expect(container.querySelector("[data-native-modal]")).toBeNull();
    await update({ status: "current", snapshot: snapshot("again") });
    expect(container.querySelector("[data-native-modal]")).toBeNull();
    await act(() => press("Open extension text widget "));
    await update({ status: "current", snapshot: { ...snapshot(), active: false } });
    expect(container.querySelector("[data-native-modal]")).toBeNull();
    expect(container.textContent).not.toContain("Ready");
    await update({ status: "unsupported", support: "unsupported", snapshot: null });
    expect(container.textContent).toContain("not supported");
  });
});
