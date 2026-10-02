// @vitest-environment jsdom
import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId, ThreadId, ProviderInstanceId } from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import { act, useLayoutEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useComposerDraftStore, useComposerThreadDraft } from "../../composerDraftStore";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import type { PiInputClientState } from "@t3tools/client-runtime/state/piInputSubmission";

const fixtures = vi.hoisted(() => ({
  source: null as Atom.Writable<{
    owner: ProviderInstanceId;
    generation: string;
    session: object;
  } | null> | null,
  state: null as Atom.Writable<AsyncResult.AsyncResult<PiInputClientState>> | null,
  submit: vi.fn(),
  consume: null as (() => void) | null,
}));
vi.mock("../../state/piInputSubmission", () => ({
  environmentPiInputSubmission: {
    sourceAtom: () => {
      if (!fixtures.source) throw new Error("Missing source");
      return fixtures.source;
    },
    stateAtom: () => {
      if (!fixtures.state) throw new Error("Missing state");
      return fixtures.state;
    },
    submit: { run: fixtures.submit },
  },
}));
import { PiInputActions } from "./PiInputActions";
const ref = { environmentId: EnvironmentId.make("native-ui"), threadId: ThreadId.make("thread") };
let root: Root;
let container: HTMLDivElement;
let preparation: Promise<void> = Promise.resolve();
let editorHandle: ComposerPromptEditorHandle | null = null;
const sends = vi.fn();
function Composer() {
  const draft = useComposerThreadDraft(ref);
  const editorRef = useRef<ComposerPromptEditorHandle>(null);
  const [cursor, setCursor] = useState(0);
  useLayoutEffect(() => {
    editorHandle = editorRef.current;
  });
  return (
    <>
      <ComposerPromptEditor
        value={draft.prompt}
        cursor={cursor}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder="Draft"
        editorRef={editorRef}
        richTextEnabled={false}
        onChange={(text, next) => {
          useComposerDraftStore.getState().setPrompt(ref, text);
          setCursor(next);
        }}
        onPaste={() => {}}
      />
      <PiInputActions
        threadRef={ref}
        canSubmit={true}
        editorRef={editorRef}
        clear={() => setCursor(0)}
        prepare={async () => {
          const text = useComposerDraftStore.getState().getComposerDraft(ref)?.prompt ?? "";
          await preparation;
          return { text, attachments: [] };
        }}
      />
      <button
        type="button"
        onClick={() => {
          sends();
          useComposerDraftStore.getState().clearComposerContent(ref);
        }}
      >
        Send
      </button>
    </>
  );
}
function button(label: string) {
  const found = [...container.querySelectorAll("button")].find(
    (value) => value.textContent === label,
  );
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => document.createElement("div").getClientRects(),
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => document.createElement("div").getBoundingClientRect(),
  });
  fixtures.source = Atom.make<{
    owner: ProviderInstanceId;
    generation: string;
    session: object;
  } | null>({ owner: ProviderInstanceId.make("pi"), generation: "first", session: {} }).pipe(
    Atom.keepAlive,
  );
  fixtures.state = Atom.make<AsyncResult.AsyncResult<PiInputClientState>>(
    AsyncResult.success({ recording: false, pending: false, submission: null, message: null }),
  ).pipe(Atom.keepAlive);
  editorHandle = null;
  fixtures.consume = null;
  fixtures.submit.mockReset();
  sends.mockReset();
  preparation = Promise.resolve();
  fixtures.submit.mockImplementation(
    async (registry: object, request: { consume: () => void; input: { requestId: string } }) => {
      expect(registry).toBe(appAtomRegistry);
      fixtures.consume = request.consume;
      return AsyncResult.success({ requestId: request.input.requestId, sequence: 3 });
    },
  );
  useComposerDraftStore.getState().setPrompt(ref, "authored");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() =>
    root.render(
      <RegistryContext.Provider value={appAtomRegistry}>
        <Composer />
      </RegistryContext.Provider>,
    ),
  );
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  useComposerDraftStore.setState({ draftsByThreadKey: {} });
  Reflect.deleteProperty(Range.prototype, "getClientRects");
  Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  vi.unstubAllGlobals();
});

describe("native input controls with the actual Tiptap draft", () => {
  it("keeps recorded/unconfirmed text, consumes explicit acceptance and leaves ordinary Send independent", async () => {
    await act(() => button("Steer native Pi").click());
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe("authored");
    expect(sends).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Submitting again may duplicate work");
    await act(() => fixtures.consume?.());
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt ?? "").toBe("");
    await act(() => useComposerDraftStore.getState().setPrompt(ref, "ordinary draft"));
    await act(() => button("Send").click());
    expect(sends).toHaveBeenCalledOnce();
    expect(fixtures.submit).toHaveBeenCalledOnce();
  });
  it("does not let late acceptance erase a newer draft after ordinary Send", async () => {
    await act(() => button("Native follow-up").click());
    await act(() => button("Send").click());
    await act(() => useComposerDraftStore.getState().setPrompt(ref, "authored"));
    await act(() => fixtures.consume?.());
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe("authored");
  });
  it("does not submit after an edit-and-undo during attachment preparation", async () => {
    let release: () => void = () => {};
    preparation = new Promise((resolve) => {
      release = resolve;
    });
    await act(() => button("Steer native Pi").click());
    await act(() => {
      const store = useComposerDraftStore.getState();
      store.setPrompt(ref, "edit");
      store.setPrompt(ref, "authored");
    });
    await act(async () => {
      release();
      await preparation;
    });
    expect(fixtures.submit).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe("authored");
  });
  it("tracks actual Tiptap document edit-and-undo revisions before consuming", async () => {
    await act(() => button("Steer native Pi").click());
    const initialRevision = editorHandle?.readRevision?.() ?? 0;
    const editor = container.querySelector("[contenteditable=true]");
    if (!editor) throw new Error("Missing editor");
    await act(() => {
      editor.innerHTML = "<p>changed</p>";
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: "changed" }),
      );
    });
    expect(editorHandle?.readSnapshot().value).toBe("changed");
    await act(() => {
      editor.innerHTML = "<p>authored</p>";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "historyUndo" }));
    });
    expect(editorHandle?.readSnapshot().value).toBe("authored");
    expect(editorHandle?.readRevision?.()).toBeGreaterThan(initialRevision);
    await act(() => fixtures.consume?.());
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe("authored");
  });
  it("invalidates an origin callback after disconnect-and-back, without retrying", async () => {
    await act(() => button("Native follow-up").click());
    const source = fixtures.source;
    if (!source) throw new Error("Missing source");
    const original = appAtomRegistry.get(source);
    await act(() => appAtomRegistry.set(source, null));
    await act(() => appAtomRegistry.set(source, original));
    await act(() => fixtures.consume?.());
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe("authored");
    expect(fixtures.submit).toHaveBeenCalledOnce();
  });
});
