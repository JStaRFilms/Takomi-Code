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
import { ProviderExtensionText, ProviderExtensionSubtitle } from "./ProviderExtensionText";

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
function web(ref = REF) {
  return (
    <>
      <h2>Manual title</h2>
      <ProviderExtensionSubtitle threadRef={ref} />
      <ProviderExtensionText threadRef={ref} section="statuses" />
      <ProviderExtensionText threadRef={ref} section="aboveEditor" />
      <textarea aria-label="Draft" defaultValue="Unsent draft" />
      <ProviderExtensionText threadRef={ref} section="belowEditor" />
    </>
  );
}
describe("web and desktop extension presentation", () => {
  it("reads the full runtime subtitle in a popup without expanding the fixed-height header, and clears replaced detail", async () => {
    await mount(web());
    await update({
      status: "current",
      snapshot: { ...snapshot(), subtitle: "Runtime summary\nFinal bounded line" },
    });
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Read runtime subtitle"]',
    );
    if (!trigger) throw new Error("Missing subtitle trigger");
    expect(container.textContent).not.toContain("Final bounded line");
    await act(() => trigger.click());
    expect(document.querySelector('[data-slot="popover-popup"]')?.textContent).toContain(
      "Final bounded line",
    );
    await update({ status: "current", snapshot: { ...snapshot(), subtitle: "" } });
    expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Manual title");
  });
  it("binds exact-key replacement and placement while keeping text plain, subtitle separate, and drafts untouched", async () => {
    document.title = "T3 Code";
    await mount(web());
    expect(section("aboveEditor").textContent).toContain("full last line");
    expect(section("belowEditor").textContent).toContain("widget ");
    const draft = container.querySelector("textarea");
    if (!draft) throw new Error("Missing editor");
    expect(
      section("aboveEditor").compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      section("belowEditor").compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_PRECEDING,
    ).not.toBe(0);
    expect(container.querySelector("b, a")).toBeNull();
    expect(container.textContent).toContain("<b>not markup</b>");
    expect(container.textContent).not.toContain("Never write or send this");
    await update({
      status: "current",
      snapshot: {
        ...snapshot(),
        statuses: [{ key: "status", text: "Replaced" }],
        widgets: [],
        subtitle: "",
      },
    });
    expect(section("statuses").textContent).toContain("Replaced");
    expect(container.textContent).not.toContain("Ready");
    expect(container.querySelector('[aria-label="Runtime subtitle"]')).toBeNull();
    expect(container.querySelector('[aria-label="Extension aboveEditor"]')).toBeNull();
    expect(draft.value).toBe("Unsent draft");
    expect(container.querySelector("h2")?.textContent).toBe("Manual title");
    expect(document.title).toBe("T3 Code");
    await update({ status: "current", snapshot: { ...snapshot(), active: false } });
    expect(container.textContent).not.toContain("Runtime text");
    expect(container.textContent).not.toContain("Ready");
  });

  it("keeps disclosure for exact content through unrelated updates but resets on replacement, generation, or environment changes", async () => {
    await mount(web());
    const disclosure = section("aboveEditor").querySelector("details");
    if (!disclosure) throw new Error("Missing disclosure");
    disclosure.open = true;
    await update({
      status: "current",
      snapshot: { ...snapshot(), statuses: [{ key: "status", text: "Unrelated" }] },
    });
    expect(section("aboveEditor").querySelector("details")).toBe(disclosure);
    expect(disclosure.open).toBe(true);
    await update({
      status: "current",
      snapshot: {
        ...snapshot(),
        widgets: [{ key: "widget", placement: "aboveEditor", lines: ["New text"] }],
      },
    });
    expect(section("aboveEditor").querySelector("details")?.open).toBe(false);
    expect(container.textContent).not.toContain("full last line");
    await update({ status: "current", snapshot: snapshot("second") });
    expect(section("aboveEditor").querySelector("details")?.open).toBe(false);
    await mount(web(OTHER));
    expect(section("aboveEditor").querySelector("details")?.open).toBe(false);
  });

  it("labels stale and disconnected text and displays omission flags even while collapsed", async () => {
    await mount(web());
    await update({ status: "stale", snapshot: { ...snapshot(), truncated: true } });
    expect(section("statuses").textContent).toContain(
      "Reconnecting. Extension text is last known.",
    );
    expect(section("statuses").textContent).toContain("truncated or omitted");
    await update({ status: "disconnected", snapshot: snapshot() });
    expect(section("statuses").textContent).toContain(
      "Disconnected. Extension text is last known.",
    );
    await update({ status: "unsupported", support: "unknown", snapshot: null });
    expect(section("statuses").textContent).toContain("support is unknown");
    expect(container.textContent).not.toContain("Runtime text");
    await update({ status: "current", snapshot: snapshot("reconnected") });
    expect(container.textContent).not.toContain("last known");
    expect(container.textContent).toContain("Runtime text");
  });
});
