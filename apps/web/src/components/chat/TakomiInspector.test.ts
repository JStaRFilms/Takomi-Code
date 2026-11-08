import { describe, expect, it } from "vite-plus/test";

import { ProviderDriverKind, ThreadId, TurnItemId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { isTakomiInspectorEntry, reconcileTakomiLivenessStatus } from "./TakomiInspector";

it.each([
  ["pi", "todo", true],
  ["pi", "board", true],
  ["pi", "vault_request", false],
  ["pi", "takomi_secret", false],
  ["codex", "todo", false],
  ["pi", "unknown", false],
] as const)("scopes inspection to non-secret Pi tools: %s %s", (driver, toolName, expected) => {
  const now = DateTime.makeUnsafe("2026-11-04T12:00:00Z");
  expect(
    isTakomiInspectorEntry({
      id: "entry",
      label: toolName,
      tone: "tool",
      createdAt: DateTime.formatIso(now),
      structuredPayload: {
        id: TurnItemId.make("item"),
        threadId: ThreadId.make("thread"),
        type: "dynamic_tool",
        toolName,
        input: {},
        runId: null,
        nodeId: null,
        providerThreadId: null,
        providerTurnId: null,
        nativeItemRef: {
          driver: ProviderDriverKind.make(driver),
          nativeId: "item",
          strength: "strong",
        },
        parentItemId: null,
        ordinal: 0,
        status: "completed",
        title: null,
        startedAt: now,
        completedAt: now,
        updatedAt: now,
      },
    }),
  ).toBe(expected);
});

describe("reconcileTakomiLivenessStatus", () => {
  it("interrupts stale active statuses after the Pi session disconnects", () => {
    expect(reconcileTakomiLivenessStatus("InProgress", false)).toBe("interrupted");
    expect(reconcileTakomiLivenessStatus("running", false)).toBe("interrupted");
  });

  it("preserves live and terminal statuses", () => {
    expect(reconcileTakomiLivenessStatus("running", true)).toBe("running");
    expect(reconcileTakomiLivenessStatus("completed", false)).toBe("completed");
    expect(reconcileTakomiLivenessStatus("failed", false)).toBe("failed");
  });
});
