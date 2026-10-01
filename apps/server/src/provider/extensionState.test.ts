import { describe, expect, it } from "vite-plus/test";
import {
  EXTENSION_STATE_LIMITS as limits,
  extensionTextBytes,
  ProviderExtensionStateSnapshot,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { emptyExtensionState, reduceExtensionState } from "./extensionState.ts";

const validSnapshot = Schema.is(ProviderExtensionStateSnapshot);
const empty = () => emptyExtensionState(ThreadId.make("test"), "2026-09-30T00:00:00.000Z");
const update = (state: ProviderExtensionStateSnapshot, input: Record<string, unknown>) =>
  reduceExtensionState(state, input);

describe("ephemeral Pi extension state", () => {
  it("preserves exact keys, empty values, placement and omitted clears", () => {
    let state = update(empty(), { method: "setStatus", statusKey: " x ", statusText: "" });
    state = update(state, { method: "setStatus", statusKey: "x", statusText: "other" });
    expect(state.statuses).toEqual([
      { key: " x ", text: "" },
      { key: "x", text: "other" },
    ]);
    state = update(state, {
      method: "setWidget",
      widgetKey: "w",
      widgetLines: [],
      widgetPlacement: "belowEditor",
    });
    expect(state.widgets).toEqual([{ key: "w", lines: [], placement: "belowEditor" }]);
    state = update(state, { method: "setStatus", statusKey: "x" });
    state = update(state, { method: "setWidget", widgetKey: "w" });
    expect(state.statuses).toEqual([{ key: " x ", text: "" }]);
    expect(state.widgets).toEqual([]);
  });
  it("bounds capacity without blocking replacement or clear; rejects key collisions", () => {
    let state = empty();
    for (let n = 0; n < limits.statuses; n++)
      state = update(state, { method: "setStatus", statusKey: String(n), statusText: "old" });
    state = update(state, { method: "setStatus", statusKey: "extra", statusText: "no" });
    expect(state.overflow).toBe(true);
    expect(state.statuses).toHaveLength(limits.statuses);
    state = update(state, { method: "setStatus", statusKey: "0", statusText: "new" });
    expect(state.statuses[0]?.text).toBe("new");
    state = update(state, { method: "setStatus", statusKey: "0" });
    expect(state.statuses).toHaveLength(limits.statuses - 1);
    expect(
      update(state, { method: "setStatus", statusKey: "a".repeat(257), statusText: "bad" })
        .statuses,
    ).toEqual(state.statuses);
  });
  it("strips escapes, bounds UTF-8, aggregate and JSON wire bytes without splitting Unicode", () => {
    let state = update(empty(), {
      method: "setStatus",
      statusKey: "s",
      statusText: "\u001b[31mred\u001b[0m\u001b]8;;https://invalid\u0007\n😀\u0000",
    });
    expect(state.statuses[0]?.text).toBe("red\n😀");
    for (let n = 0; n < 16; n++)
      state = update(state, {
        method: "setWidget",
        widgetKey: String(n),
        widgetLines: Array.from({ length: 120 }, () => "😀".repeat(1000)),
      });
    state = update(state, { method: "setTitle", title: "😀".repeat(5000) });
    state = update(state, { method: "set_editor_text", text: '\n"\\'.repeat(300000) });
    expect(state.truncated).toBe(true);
    expect(extensionTextBytes(JSON.stringify(state))).toBeLessThanOrEqual(limits.wireBytes);
    expect(validSnapshot(state)).toBe(true);
    expect(
      state.widgets.flatMap((widget) => widget.lines).some((line) => /[\ud800-\udfff]/u.test(line)),
    ).toBe(false);
  });
  it("bounds widget capacity and exact Unicode keys while keeping empty replacement and clear available", () => {
    let state = empty();
    for (let n = 0; n < limits.widgets; n++)
      state = update(state, { method: "setWidget", widgetKey: String(n), widgetLines: ["old"] });
    state = update(state, { method: "setWidget", widgetKey: "overflow", widgetLines: [] });
    expect(state.overflow).toBe(true);
    expect(state.widgets).toHaveLength(limits.widgets);
    state = update(state, { method: "setWidget", widgetKey: "0", widgetLines: [] });
    expect(state.widgets[0]).toEqual({ key: "0", lines: [], placement: "aboveEditor" });
    state = update(state, { method: "setWidget", widgetKey: "0" });
    expect(state.widgets).toHaveLength(limits.widgets - 1);
    for (const key of ["", "😀".repeat(129), String.fromCharCode(0), String.fromCharCode(0xd800)]) {
      expect(
        update(state, { method: "setWidget", widgetKey: key, widgetLines: ["invalid"] }).widgets,
      ).toEqual(state.widgets);
    }
    state = update(state, { method: "setStatus", statusKey: "__proto__", statusText: "exact" });
    expect(state.statuses).toEqual([{ key: "__proto__", text: "exact" }]);
  });
  it("keeps the serialized budget after editor-first updates and rejects duplicate wire keys", () => {
    let state = update(empty(), {
      method: "set_editor_text",
      text: String.fromCharCode(10).repeat(limits.editorBytes),
    });
    for (let n = 0; n < limits.statuses; n++)
      state = update(state, {
        method: "setStatus",
        statusKey: String(n),
        statusText: String.fromCharCode(10).repeat(limits.statusBytes),
      });
    expect(validSnapshot(state)).toBe(true);
    expect(extensionTextBytes(JSON.stringify(state))).toBeLessThanOrEqual(limits.wireBytes);
    expect(state.truncated).toBe(true);
    expect(
      validSnapshot({
        ...state,
        statuses: [
          { key: "same", text: "one" },
          { key: "same", text: "two" },
        ],
      }),
    ).toBe(false);
    const titled = update(empty(), {
      method: "setTitle",
      title: "a".repeat(limits.titlePoints + 1),
    });
    expect(titled.subtitle?.length).toBe(limits.titlePoints);
  });
  it("clips exact UTF-8 scalar boundaries and counts supplementary title points once", () => {
    for (const point of ["a", "¢", "€", "😀", "\u2028", "\u2029"]) {
      const bytes = extensionTextBytes(point);
      for (const remaining of [bytes - 1, bytes]) {
        const prefix = "a".repeat(limits.lineBytes - remaining);
        const state = update(empty(), {
          method: "setWidget",
          widgetKey: "scalar",
          widgetLines: [prefix + point + "tail"],
        });
        expect(state.widgets[0]?.lines).toEqual([remaining === bytes ? prefix + point : prefix]);
      }
    }
    const titled = update(empty(), { method: "setTitle", title: "a😀".repeat(limits.titlePoints) });
    expect(titled.subtitle).toBe("a😀".repeat(limits.titlePoints / 2));
    const sanitized = update(empty(), {
      method: "setStatus",
      statusKey: "s",
      statusText: "\ud800A\udfff\b\f\r\t😀",
    });
    expect(sanitized.statuses[0]?.text).toBe("A\n\t😀");
  });
  it("matches JSON-escaped editor boundaries for ASCII escapes and multibyte scalars", () => {
    const initial = empty();
    const base = {
      ...initial,
      editorSuggestion: { id: "inactive:1", text: "" },
      truncated: true,
      overflow: true,
    };
    const budget = limits.wireBytes - extensionTextBytes(JSON.stringify(base)) - 64;
    for (const point of ["a", '"', "\\", "/", "\t", "\n", "¢", "€", "😀", "\u2028", "\u2029"]) {
      const bytes = extensionTextBytes(JSON.stringify(point).slice(1, -1));
      for (const remaining of [bytes - 1, bytes]) {
        const used = budget - remaining;
        const prefix = "\n".repeat(Math.floor(used / 2)) + "a".repeat(used % 2);
        const text =
          prefix + point + "\n".repeat(limits.editorBytes - extensionTextBytes(prefix + point));
        const state = update(initial, { method: "set_editor_text", text });
        expect(state.editorSuggestion?.text).toBe(remaining === bytes ? prefix + point : prefix);
        expect(extensionTextBytes(JSON.stringify(state))).toBeLessThanOrEqual(limits.wireBytes);
        expect(state.truncated).toBe(true);
        expect(update(state, { method: "set_editor_text", text })).toBe(state);
      }
    }
    expect(initial.editorSuggestion).toBeNull();
    expect(initial.truncated).toBe(false);
  });
  it("ignores factories and suppresses normalized duplicate setters", () => {
    const state = update(empty(), { method: "setWidget", widgetKey: "w", widgetLines: ["text"] });
    expect(
      update(state, { method: "setWidget", widgetKey: "w", widgetLines: { factory: true } }),
    ).toBe(state);
    expect(
      update(state, { method: "setWidget", widgetKey: "w", widgetLines: ["\u001b[0mtext"] }),
    ).toBe(state);
  });
});
