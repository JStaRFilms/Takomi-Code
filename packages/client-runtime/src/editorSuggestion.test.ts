import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type ProviderExtensionStateSnapshot,
} from "@t3tools/contracts";
import {
  currentEditorSuggestion,
  EditorSuggestionActions,
  EditorSuggestionDismissals,
  type EditorSuggestion,
  type EditorSuggestionDraft,
} from "./editorSuggestion.ts";
import type { ThreadExtensionState } from "./state/providerExtensionState.ts";
import type { SupervisorConnectionState } from "./connection/model.ts";
const connection: SupervisorConnectionState = {
  desired: true,
  phase: "connected",
  network: "online",
  stage: null,
  attempt: 1,
  generation: 1,
  lastFailure: null,
  retryAt: null,
};

const ref = { environmentId: EnvironmentId.make("one"), threadId: ThreadId.make("thread") };
const owner = { providerInstanceId: ProviderInstanceId.make("pi"), status: "ready" as const };
const snapshot: ProviderExtensionStateSnapshot = {
  threadId: ref.threadId,
  providerInstanceId: owner.providerInstanceId,
  generation: "generation",
  revision: 1,
  active: true,
  updatedAt: "2026-09-30T00:00:00.000Z",
  statuses: [],
  widgets: [],
  subtitle: null,
  editorSuggestion: { id: "suggestion", text: "<script>plain text</script>" },
  truncated: false,
  overflow: false,
};
function candidate(state: ThreadExtensionState = { status: "current", snapshot }) {
  return currentEditorSuggestion(ref, state, owner, connection);
}
function fixture() {
  let source = candidate();
  let draft: EditorSuggestionDraft = {
    revision: 0,
    text: "before selected after",
    selection: { start: 7, end: 15 },
    editorRevision: 1,
  };
  const writes: string[] = [];
  const dismissals = new EditorSuggestionDismissals();
  const actions = new EditorSuggestionActions(
    {
      readSource: () => source,
      readDraft: () => draft,
      writeText: (text) => {
        writes.push(text);
        draft = { ...draft, text, revision: draft.revision + 1 };
      },
    },
    dismissals,
  );
  return {
    actions,
    writes,
    dismissals,
    setSource(value: EditorSuggestion | null) {
      source = value;
      actions.observeSource();
    },
    edit(patch: Partial<EditorSuggestionDraft>) {
      draft = { ...draft, ...patch };
    },
    draft: () => draft,
  };
}
function requireIntent(value: ReturnType<EditorSuggestionActions["request"]>) {
  if (!value) throw new Error("Expected an intent");
  return value;
}

describe("native editor suggestion authorization", () => {
  it("requires a current active snapshot, supported current owner and generation", () => {
    expect(candidate()).not.toBeNull();
    expect(
      currentEditorSuggestion(ref, { status: "current", snapshot }, null, connection),
    ).toBeNull();
    expect(
      currentEditorSuggestion(
        ref,
        { status: "current", snapshot },
        { ...owner, providerInstanceId: ProviderInstanceId.make("other") },
        connection,
      ),
    ).toBeNull();
    for (const status of ["stopped", "error", "interrupted"] as const)
      expect(
        currentEditorSuggestion(
          ref,
          { status: "current", snapshot },
          { ...owner, status },
          connection,
        ),
      ).toBeNull();
    for (const status of ["stale", "disconnected"] as const)
      expect(candidate({ status, snapshot })).toBeNull();
    expect(candidate({ status: "unsupported", support: "unknown", snapshot: null })).toBeNull();
    for (const patch of [
      { active: false },
      { generation: null },
      { editorSuggestion: null },
      { threadId: ThreadId.make("other") },
    ])
      expect(candidate({ status: "current", snapshot: { ...snapshot, ...patch } })).toBeNull();
  });

  it.each(["replace", "insert", "append"] as const)(
    "only writes after explicit %s confirmation",
    (action) => {
      const f = fixture();
      const intent = requireIntent(f.actions.request(action));
      expect(f.writes).toEqual([]);
      expect(intent.text).toBe(
        action === "replace"
          ? snapshot.editorSuggestion?.text
          : action === "insert"
            ? `before ${snapshot.editorSuggestion?.text} after`
            : `before selected after${snapshot.editorSuggestion?.text}`,
      );
      expect(f.actions.apply(intent)).toEqual({ status: "applied" });
      expect(f.writes).toEqual([intent.text]);
      expect(f.actions.offer()).toBeNull();
      expect(f.actions.apply(intent)).toEqual({ status: "stale" });
    },
  );

  it.each([
    { revision: 1 },
    { text: "new edit" },
    { editorRevision: 2 },
    { selection: { start: 1, end: 2 } },
  ])("refreshes confirmation without writing on changed local draft %j", (patch) => {
    const f = fixture();
    const intent = requireIntent(f.actions.request("replace"));
    f.edit(patch);
    const first = f.actions.apply(intent);
    expect(first.status).toBe("refresh");
    if (first.status !== "refresh") throw new Error("Expected refresh");
    f.edit({ revision: 2, text: "another edit" });
    const second = f.actions.apply(first.intent);
    expect(second.status).toBe("refresh");
    expect(f.writes).toEqual([]);
    if (second.status !== "refresh") throw new Error("Expected refresh");
    expect(second.intent.draft.text).toBe("another edit");
    expect(f.actions.apply(second.intent)).toEqual({ status: "applied" });
  });

  it.each(["suggestion", "generation", "owner", "environment", "disconnect", "inactive"])(
    "rejects a captured intent after %s changes",
    (change) => {
      const f = fixture();
      const intent = requireIntent(f.actions.request("replace"));
      const current = candidate();
      if (!current) throw new Error("Expected source");
      f.setSource(
        change === "disconnect" || change === "inactive"
          ? null
          : { ...current, id: `${current.id}:${change}` },
      );
      expect(f.actions.apply(intent)).toEqual({ status: "stale" });
      expect(f.writes).toEqual([]);
    },
  );

  it("rejects disabled/offline/revoked connections and connection generations even before extension state changes", () => {
    for (const patch of [
      { desired: false },
      { phase: "blocked" as const },
      { network: "offline" as const },
    ])
      expect(
        currentEditorSuggestion(ref, { status: "current", snapshot }, owner, {
          ...connection,
          ...patch,
        }),
      ).toBeNull();
    expect(currentEditorSuggestion(ref, { status: "current", snapshot }, owner, null)).toBeNull();
    const f = fixture();
    const intent = requireIntent(f.actions.request("replace"));
    const next = currentEditorSuggestion(ref, { status: "current", snapshot }, owner, {
      ...connection,
      generation: 2,
    });
    f.setSource(next);
    expect(f.actions.apply(intent)).toEqual({ status: "stale" });
    expect(f.writes).toEqual([]);
  });

  it("fences disconnect/reconnect even when the exact candidate returns", () => {
    const f = fixture();
    const offer = f.actions.offer();
    const intent = requireIntent(f.actions.request("insert"));
    f.setSource(null);
    f.setSource(candidate());
    expect(f.actions.apply(intent)).toEqual({ status: "stale" });
    if (!offer) throw new Error("Expected offer");
    expect(f.actions.dismiss(offer)).toBe(false);
    expect(f.writes).toEqual([]);
  });

  it("dismisses only the exact device-local candidate and reoffers new generations", () => {
    const f = fixture();
    const offer = f.actions.offer();
    if (!offer) throw new Error("Expected offer");
    expect(f.actions.dismiss(offer)).toBe(true);
    f.setSource(candidate());
    expect(f.actions.offer()).toBeNull();
    const otherDevice = fixture();
    expect(otherDevice.actions.offer()).not.toBeNull();
    f.setSource({ ...offer, id: "new generation" });
    expect(f.actions.offer()).not.toBeNull();
    f.setSource(offer);
    expect(f.actions.offer()).not.toBeNull();
    const remote = currentEditorSuggestion(
      { ...ref, environmentId: EnvironmentId.make("two") },
      { status: "current", snapshot },
      owner,
      connection,
    );
    if (!remote) throw new Error("Expected remote candidate");
    expect(f.dismissals.isDismissed(remote)).toBe(false);
  });

  it("applies on one device without writing or consuming the peer device's draft", () => {
    const local = fixture();
    const peer = fixture();
    const peerDraft = peer.draft();
    expect(local.actions.apply(requireIntent(local.actions.request("replace")))).toEqual({
      status: "applied",
    });
    expect(peer.draft()).toBe(peerDraft);
    expect(peer.writes).toEqual([]);
    expect(peer.actions.offer()).not.toBeNull();
  });

  it("bounds current dismissal memory rather than accumulating historical IDs", () => {
    const store = new EditorSuggestionDismissals();
    const source = candidate();
    if (!source) throw new Error("Expected source");
    store.dismiss(source);
    for (let index = 0; index < 64; index++)
      store.dismiss({ ...source, scope: `thread-${index}`, id: `suggestion-${index}` });
    expect(store.isDismissed(source)).toBe(false);
  });

  it("treats empty text as an explicit clear and blocks received/result overflow without clipping", () => {
    const f = fixture();
    const source = candidate();
    if (!source) throw new Error("Expected source");
    f.setSource({ ...source, text: "" });
    const clear = requireIntent(f.actions.request("replace"));
    expect(clear.text).toBe("");
    expect(f.actions.apply(clear)).toEqual({ status: "applied" });
    const text = "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS + 1);
    const large = candidate({
      status: "current",
      snapshot: { ...snapshot, editorSuggestion: { id: "large", text } },
    });
    expect(large?.text).toBe(text);
    expect(large?.blocked).not.toBeNull();
    f.setSource(large);
    const blocked = requireIntent(f.actions.request("replace"));
    expect(f.actions.apply(blocked).status).toBe("refresh");
    expect(f.writes).toEqual([""]);
    f.setSource({ ...source, id: "small", text: "y" });
    f.edit({ text: "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS), selection: null });
    const append = requireIntent(f.actions.request("append"));
    expect(append.blocked).not.toBeNull();
    expect(f.actions.apply(append).status).toBe("refresh");
    for (const patch of [{ truncated: true }, { overflow: true }])
      expect(
        candidate({ status: "current", snapshot: { ...snapshot, ...patch } })?.blocked,
      ).not.toBeNull();
    expect(f.actions.request("insert")).toBeNull();
  });
});
