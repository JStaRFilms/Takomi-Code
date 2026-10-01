// @vitest-environment jsdom
import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  ThreadId,
  ProviderInstanceId,
  ProjectId,
  type OrchestrationThreadShell,
  type ProviderExtensionStateSnapshot,
} from "@t3tools/contracts";
import type { ThreadExtensionState } from "@t3tools/client-runtime/state/providerExtensionState";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import type { SupervisorConnectionState } from "@t3tools/client-runtime/connection";
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useComposerDraftStore, useComposerThreadDraft } from "../../composerDraftStore";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { collapseExpandedComposerCursor } from "../../composer-logic";

const fixtures = vi.hoisted(() => ({
  source: null as Atom.Writable<ThreadExtensionState> | null,
  owner: null as Atom.Writable<OrchestrationThreadShell | null> | null,
  connection: null as Atom.Writable<AsyncResult.AsyncResult<SupervisorConnectionState>> | null,
}));
vi.mock("../../state/providerExtensionState", () => ({
  environmentExtensionState: {
    stateAtom: () => {
      if (!fixtures.source) throw new Error("Missing source");
      return fixtures.source;
    },
  },
}));
vi.mock("../../state/threads", () => ({
  environmentThreadShells: {
    threadShellAtom: () => {
      if (!fixtures.owner) throw new Error("Missing owner");
      return fixtures.owner;
    },
  },
}));
vi.mock("../../connection/catalog", () => ({
  environmentCatalog: {
    stateAtom: () => {
      if (!fixtures.connection) throw new Error("Missing connection");
      return fixtures.connection;
    },
  },
}));
import { ProviderEditorSuggestion } from "./ProviderEditorSuggestion";

const ref = {
  environmentId: EnvironmentId.make("suggestion-ui"),
  threadId: ThreadId.make("thread"),
};
const pi = ProviderInstanceId.make("pi");
const date = "2026-09-30T00:00:00.000Z";
const shell: OrchestrationThreadShell = {
  id: ref.threadId,
  projectId: ProjectId.make("project"),
  title: "Manual title",
  modelSelection: { instanceId: ProviderInstanceId.make("future-provider"), model: "future" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: date,
  updatedAt: date,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  pullRequests: [],
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
  session: {
    threadId: ref.threadId,
    providerInstanceId: pi,
    providerName: "pi",
    status: "ready",
    runtimeMode: "full-access",
    activeTurnId: null,
    lastError: null,
    updatedAt: date,
  },
};
const snapshot: ProviderExtensionStateSnapshot = {
  threadId: ref.threadId,
  providerInstanceId: pi,
  generation: "first",
  revision: 1,
  active: true,
  updatedAt: date,
  statuses: [],
  widgets: [],
  subtitle: null,
  editorSuggestion: { id: "suggestion", text: "<b>literal</b>" },
  truncated: false,
  overflow: false,
};
let root: Root;
let container: HTMLDivElement;
let handle: ComposerPromptEditorHandle | null = null;
let generation = 0;
const sends = vi.fn();
function Composer() {
  const draft = useComposerThreadDraft(ref);
  const editorRef = useRef<ComposerPromptEditorHandle>(null);
  const [cursor, setCursor] = useState(3);
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
        onChange={(text, nextCursor) => {
          useComposerDraftStore.getState().setPrompt(ref, text);
          setCursor(nextCursor);
        }}
        onPaste={() => {}}
      />
      <ProviderEditorSuggestion
        threadRef={ref}
        canEdit
        editorRef={editorRef}
        moveCaret={(text, expandedCursor) => {
          const next = collapseExpandedComposerCursor(text, expandedCursor);
          flushSync(() => setCursor(next));
          editorRef.current?.focusAt(next);
        }}
      />
      <button
        onClick={() => {
          handle = editorRef.current;
        }}
      >
        Capture editor handle
      </button>
      <button onClick={sends}>Send</button>
    </>
  );
}
function button(text: string) {
  const result = Array.from(document.querySelectorAll("button")).find(
    (element) => element.textContent === text,
  );
  if (!result) throw new Error(`Missing ${text}`);
  return result;
}
async function click(text: string) {
  await act(() => button(text).click());
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
  sends.mockClear();
  handle = null;
  fixtures.source = Atom.make<ThreadExtensionState>({
    status: "current",
    snapshot: { ...snapshot, generation: `test-${generation++}` },
  }).pipe(Atom.keepAlive);
  fixtures.owner = Atom.make<OrchestrationThreadShell | null>(shell).pipe(Atom.keepAlive);
  fixtures.connection = Atom.make<AsyncResult.AsyncResult<SupervisorConnectionState>>(
    AsyncResult.success<SupervisorConnectionState>({
      desired: true,
      phase: "connected",
      network: "online",
      stage: null,
      attempt: 1,
      generation,
      lastFailure: null,
      retryAt: null,
    }),
  ).pipe(Atom.keepAlive);
  useComposerDraftStore.getState().setPrompt(ref, "abc def");
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

describe("web suggestion review with the real Tiptap editor", () => {
  it("inserts literal unsent text at the actual editor caret after explicit review", async () => {
    await click("Capture editor handle");
    if (!handle) throw new Error("Missing editor handle");
    await act(() => handle?.focusAt(3));
    expect(handle.readSelectionRange()).toEqual({ start: 3, end: 3 });
    await click("Insert");
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe("abc def");
    await click("Confirm insert");
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe(
      "abc<b>literal</b> def",
    );
    expect(handle.readSnapshot().value).toBe("abc<b>literal</b> def");
    expect(handle.readSelectionRange()).toEqual({ start: 17, end: 17 });
    expect(sends).not.toHaveBeenCalled();
    expect(container.querySelector("b")).toBeNull();
  });

  it("refreshes replacement review twice instead of overwriting newer drafts", async () => {
    await click("Replace");
    await act(() => useComposerDraftStore.getState().setPrompt(ref, "first competing edit"));
    await click("Confirm replace");
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe(
      "first competing edit",
    );
    expect(document.body.textContent).toContain("Nothing was replaced");
    await act(() => useComposerDraftStore.getState().setPrompt(ref, "second competing edit"));
    await click("Confirm replace");
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe(
      "second competing edit",
    );
    await act(() =>
      useComposerDraftStore.getState().addFiles(
        ref,
        [
          {
            type: "file",
            id: "competing-attachment",
            name: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 1,
            file: new File(["x"], "notes.txt"),
          },
        ],
        { appendReference: false },
      ),
    );
    await click("Confirm replace");
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe(
      "second competing edit",
    );
    const before = useComposerDraftStore.getState().getComposerDraft(ref);
    await click("Confirm replace");
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toEqual({
      ...before,
      prompt: "<b>literal</b>",
    });
    expect(sends).not.toHaveBeenCalled();
  });

  it("blocks a revoked connection before the extension snapshot changes", async () => {
    await click("Replace");
    const connection = fixtures.connection;
    if (!connection) throw new Error("Missing connection");
    const ready: SupervisorConnectionState = {
      desired: true,
      phase: "connected",
      network: "online",
      stage: null,
      attempt: 1,
      generation: 1,
      lastFailure: null,
      retryAt: null,
    };
    await act(() =>
      appAtomRegistry.set(connection, AsyncResult.success({ ...ready, phase: "blocked" })),
    );
    expect(document.body.textContent).not.toContain("Confirm replace");
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe("abc def");
    await act(() =>
      appAtomRegistry.set(connection, AsyncResult.success({ ...ready, generation: 2 })),
    );
    expect(document.body.textContent).not.toContain("Confirm replace");
    expect(container.textContent).toContain("Editor suggestion:");
    expect(sends).not.toHaveBeenCalled();
  });

  it("invalidates open review on disconnect and offers a new native process without mutating text", async () => {
    await click("Replace");
    if (!fixtures.source) throw new Error("Missing source");
    const source = fixtures.source;
    await act(() => appAtomRegistry.set(source, { status: "disconnected", snapshot }));
    expect(document.body.textContent).not.toContain("Confirm replace");
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt).toBe("abc def");
    await act(() =>
      appAtomRegistry.set(source, {
        status: "current",
        snapshot: {
          ...snapshot,
          generation: "second",
          editorSuggestion: { id: "new", text: "next" },
        },
      }),
    );
    await click("Dismiss");
    expect(container.textContent).not.toContain("Editor suggestion:");
    expect(sends).not.toHaveBeenCalled();
  });
});
