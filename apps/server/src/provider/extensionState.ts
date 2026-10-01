import {
  EXTENSION_STATE_LIMITS as limits,
  ExtensionStateKey,
  extensionTextBytes,
  type ProviderExtensionStateSnapshot,
  type ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as NodeUtil from "node:util";

export function emptyExtensionState(
  threadId: ThreadId,
  updatedAt: string,
): ProviderExtensionStateSnapshot {
  return {
    threadId,
    updatedAt,
    providerInstanceId: null,
    generation: null,
    revision: 0,
    active: false,
    statuses: [],
    widgets: [],
    subtitle: null,
    editorSuggestion: null,
    truncated: false,
    overflow: false,
  };
}
export function isExtensionStateSetter(input: Record<string, unknown>): boolean {
  return (
    input.type === "extension_ui_request" &&
    ["setStatus", "setWidget", "setTitle", "set_editor_text"].includes(String(input.method))
  );
}
const validKey = Schema.is(ExtensionStateKey);
const stringLines = Schema.is(Schema.Array(Schema.String));

function plainText(text: string): string {
  return Array.from(NodeUtil.stripVTControlCharacters(text).replace(/\r\n?/g, "\n"))
    .filter((point) => {
      const code = point.codePointAt(0) ?? 0;
      return (
        code === 9 ||
        code === 10 ||
        (code >= 32 && !(code >= 127 && code <= 159) && !(code >= 0xd800 && code <= 0xdfff))
      );
    })
    .join("");
}
function clip(text: string, bytes: number, points = Infinity, wire = false): string {
  let used = 0;
  let count = 0;
  let end = 0;
  while (end < text.length) {
    const code = text.codePointAt(end) ?? 0;
    let size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (wire) {
      // JSON's short escapes take two bytes; other controls and lone surrogates use \uXXXX.
      if (
        code === 34 ||
        code === 92 ||
        code === 8 ||
        code === 9 ||
        code === 10 ||
        code === 12 ||
        code === 13
      )
        size = 2;
      else if (code < 32 || (code >= 0xd800 && code <= 0xdfff)) size = 6;
    }
    if (used + size > bytes || count >= points) break;
    used += size;
    count++;
    end += code > 0xffff ? 2 : 1;
  }
  return text.slice(0, end);
}
const aggregate = (state: ProviderExtensionStateSnapshot) =>
  state.statuses.reduce((sum, entry) => sum + extensionTextBytes(entry.text), 0) +
  state.widgets.reduce(
    (sum, entry) => sum + entry.lines.reduce((total, line) => total + extensionTextBytes(line), 0),
    0,
  ) +
  extensionTextBytes(state.subtitle ?? "");

export function reduceExtensionState(
  state: ProviderExtensionStateSnapshot,
  input: Record<string, unknown>,
): ProviderExtensionStateSnapshot {
  let next = state;
  let truncated = state.truncated;
  let overflow = state.overflow;
  const text = (value: string, bytes: number, points = Infinity) => {
    const plain = plainText(value);
    const result = clip(plain, bytes, points);
    truncated ||= result !== plain;
    return result;
  };
  switch (input.method) {
    case "setStatus": {
      if (!validKey(input.statusKey)) {
        overflow = true;
        break;
      }
      const key = input.statusKey;
      if (input.statusText !== undefined && typeof input.statusText !== "string") return state;
      const entries = state.statuses.filter((entry) => entry.key !== key);
      if (input.statusText !== undefined && entries.length >= limits.statuses) {
        overflow = true;
        break;
      }
      const value =
        input.statusText === undefined
          ? undefined
          : text(
              input.statusText,
              Math.min(
                limits.statusBytes,
                limits.aggregateBytes - aggregate({ ...state, statuses: entries }),
              ),
            );
      const replacement = value === undefined ? [] : [{ key, text: value }];
      const index = state.statuses.findIndex((entry) => entry.key === key);
      const statuses = [...entries];
      statuses.splice(index < 0 ? statuses.length : index, 0, ...replacement);
      next = { ...state, statuses };
      break;
    }
    case "setWidget": {
      if (!validKey(input.widgetKey)) {
        overflow = true;
        break;
      }
      const key = input.widgetKey;
      if (input.widgetLines !== undefined && !stringLines(input.widgetLines)) return state;
      if (
        input.widgetPlacement !== undefined &&
        input.widgetPlacement !== "aboveEditor" &&
        input.widgetPlacement !== "belowEditor"
      )
        return state;
      const entries = state.widgets.filter((entry) => entry.key !== key);
      if (input.widgetLines !== undefined && entries.length >= limits.widgets) {
        overflow = true;
        break;
      }
      let budget = limits.aggregateBytes - aggregate({ ...state, widgets: entries });
      const lines = input.widgetLines?.slice(0, limits.widgetLines).map((line) => {
        const result = text(line, Math.min(limits.lineBytes, budget));
        budget -= extensionTextBytes(result);
        return result;
      });
      truncated ||=
        input.widgetLines !== undefined && input.widgetLines.length > limits.widgetLines;
      const placement = input.widgetPlacement === "belowEditor" ? "belowEditor" : "aboveEditor";
      const replacement = lines === undefined ? [] : [{ key, lines, placement } as const];
      const index = state.widgets.findIndex((entry) => entry.key === key);
      const widgets = [...entries];
      widgets.splice(index < 0 ? widgets.length : index, 0, ...replacement);
      next = { ...state, widgets };
      break;
    }
    case "setTitle":
      if (typeof input.title !== "string") return state;
      next = {
        ...state,
        subtitle: text(
          input.title,
          Math.min(
            limits.titleBytes,
            limits.aggregateBytes - aggregate({ ...state, subtitle: null }),
          ),
          limits.titlePoints,
        ),
      };
      break;
    case "set_editor_text": {
      if (typeof input.text !== "string") return state;
      let value = text(input.text, limits.editorBytes);
      // JSON escaping can double text bytes. Reserve the complete non-text DTO,
      // including the replacement ID, before budgeting serialized editor text.
      const id = `${state.generation ?? "inactive"}:${state.revision + 1}`;
      const base = {
        ...state,
        editorSuggestion: { id, text: "" },
        truncated: true,
        overflow: true,
      };
      const wireBudget = limits.wireBytes - extensionTextBytes(JSON.stringify(base)) - 64;
      const wireValue = clip(value, Math.max(0, wireBudget), Infinity, true);
      truncated ||= wireValue !== value;
      value = wireValue;
      if (value === state.editorSuggestion?.text) break;
      next = { ...state, editorSuggestion: { id, text: value } };
      break;
    }
    default:
      return state;
  }
  next = { ...next, truncated, overflow };
  if (next.editorSuggestion && extensionTextBytes(JSON.stringify(next)) > limits.wireBytes) {
    const base = {
      ...next,
      editorSuggestion: { ...next.editorSuggestion, text: "" },
      truncated: true,
    };
    const budget = limits.wireBytes - extensionTextBytes(JSON.stringify(base)) - 64;
    next = {
      ...base,
      editorSuggestion: {
        ...next.editorSuggestion,
        text: clip(next.editorSuggestion.text, Math.max(0, budget), Infinity, true),
      },
    };
  }
  return JSON.stringify(next) === JSON.stringify(state) ? state : next;
}
