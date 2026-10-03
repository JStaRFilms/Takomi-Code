// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Isolated filesystem fixtures.
import * as NodeAssert from "node:assert/strict";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";

import {
  extractPiHistory,
  PI_HISTORY_MAX_MESSAGES,
  PI_HISTORY_MAX_TEXT_BYTES,
} from "./sessionHistory.ts";

async function fixture(lines: ReadonlyArray<unknown>): Promise<{ root: string; file: string }> {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "takomi-history-"));
  const file = NodePath.join(root, "session.jsonl");
  await NodeFSP.writeFile(file, lines.map((entry) => `${JSON.stringify(entry)}\n`).join(""));
  return { root, file };
}

function signal() {
  return new AbortController().signal;
}

const header = {
  type: "session",
  version: 3,
  id: "history-source",
  timestamp: "2026-09-13T19:00:00.000Z",
  cwd: "/workspace",
};

const user = (id: string, content: unknown, timestamp: string) => ({
  type: "message",
  id,
  parentId: null,
  timestamp,
  message: { role: "user", content },
});

const assistant = (id: string, content: unknown, timestamp: string) => ({
  type: "message",
  id,
  parentId: null,
  timestamp,
  message: { role: "assistant", content },
});

NodeTest.test("extracts user and assistant text in file order", async (t) => {
  const value = await fixture([
    header,
    user("m1", "first question", "2026-09-13T19:00:01.000Z"),
    assistant("m2", [{ type: "text", text: "answer one" }], "2026-09-13T19:00:02.000Z"),
    user("m3", "follow up", "2026-09-13T19:00:03.000Z"),
  ]);
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const result = await extractPiHistory({ file: value.file }, { signal: signal() });
  NodeAssert.deepEqual(result.messages, [
    { role: "user", text: "first question", createdAt: "2026-09-13T19:00:01.000Z", recordIndex: 0 },
    {
      role: "assistant",
      text: "answer one",
      createdAt: "2026-09-13T19:00:02.000Z",
      recordIndex: 1,
    },
    { role: "user", text: "follow up", createdAt: "2026-09-13T19:00:03.000Z", recordIndex: 2 },
  ]);
  NodeAssert.equal(result.truncated, false);
});

NodeTest.test("extracts only the active branch ending at the last record", async (t) => {
  const value = await fixture([
    header,
    {
      ...user("m1", "root", "2026-09-13T19:00:01.000Z"),
      parentId: null,
    },
    {
      ...assistant("abandoned", "old answer", "2026-09-13T19:00:02.000Z"),
      parentId: "m1",
    },
    {
      ...assistant("active", "new answer", "2026-09-13T19:00:03.000Z"),
      parentId: "m1",
    },
  ]);
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const result = await extractPiHistory({ file: value.file }, { signal: signal() });
  NodeAssert.deepEqual(
    result.messages.map((message) => message.text),
    ["root", "new answer"],
  );
  NodeAssert.deepEqual(
    result.messages.map((message) => message.recordIndex),
    [0, 2],
  );
});

NodeTest.test("skips tool traffic, metadata, and empty texts", async (t) => {
  const value = await fixture([
    header,
    { type: "model_change", id: "c1", parentId: null, timestamp: "2026-09-13T19:00:01.000Z" },
    assistant(
      "m1",
      [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }],
      "2026-09-13T19:00:02.000Z",
    ),
    {
      type: "message",
      id: "m2",
      parentId: null,
      timestamp: "2026-09-13T19:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [],
        isError: false,
      },
    },
    assistant("m3", [{ type: "text", text: "after tools" }], "2026-09-13T19:00:04.000Z"),
    user("m4", "   ", "2026-09-13T19:00:05.000Z"),
    {
      type: "session_info",
      id: "s1",
      parentId: null,
      timestamp: "2026-09-13T19:00:06.000Z",
      name: "x",
    },
  ]);
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const result = await extractPiHistory({ file: value.file }, { signal: signal() });
  NodeAssert.deepEqual(result.messages, [
    {
      role: "assistant",
      text: "after tools",
      createdAt: "2026-09-13T19:00:04.000Z",
      recordIndex: 3,
    },
  ]);
});

NodeTest.test("falls back to the header timestamp and bounds long texts", async (t) => {
  const value = await fixture([
    header,
    {
      type: "message",
      id: "m1",
      parentId: null,
      message: { role: "user", content: "no timestamp" },
    },
    user("m2", "y".repeat(PI_HISTORY_MAX_TEXT_BYTES + 100), "2026-09-13T19:00:02.000Z"),
  ]);
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const result = await extractPiHistory({ file: value.file }, { signal: signal() });
  NodeAssert.equal(result.messages.length, 2);
  NodeAssert.equal(result.messages[0]!.createdAt, "2026-09-13T19:00:00.000Z");
  NodeAssert.ok(Buffer.byteLength(result.messages[1]!.text) <= PI_HISTORY_MAX_TEXT_BYTES);
  NodeAssert.ok(result.messages[1]!.text.endsWith("…"));
});

NodeTest.test("caps the message count and reports truncation", async (t) => {
  const lines: Array<unknown> = [header];
  for (let index = 0; index < PI_HISTORY_MAX_MESSAGES + 50; index += 1) {
    lines.push(user(`m${index}`, `question ${index}`, "2026-09-13T19:00:01.000Z"));
  }
  const value = await fixture(lines);
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const result = await extractPiHistory({ file: value.file }, { signal: signal() });
  NodeAssert.equal(result.messages.length, PI_HISTORY_MAX_MESSAGES);
  NodeAssert.equal(result.truncated, true);
});

NodeTest.test("joins text blocks and ignores non-text blocks", async (t) => {
  const value = await fixture([
    header,
    assistant(
      "m1",
      [
        { type: "text", text: "part one" },
        { type: "image", data: "x", mimeType: "image/png" },
        { type: "text", text: "part two" },
      ],
      "2026-09-13T19:00:01.000Z",
    ),
  ]);
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const result = await extractPiHistory({ file: value.file }, { signal: signal() });
  NodeAssert.deepEqual(result.messages, [
    {
      role: "assistant",
      text: "part one part two",
      createdAt: "2026-09-13T19:00:01.000Z",
      recordIndex: 0,
    },
  ]);
});

NodeTest.test("take last keeps the tail with original positions", async (t) => {
  const lines: Array<unknown> = [header];
  for (let index = 0; index < 10; index += 1) {
    lines.push(user(`m${index}`, `question ${index}`, "2026-09-13T19:00:01.000Z"));
  }
  const value = await fixture(lines);
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const result = await extractPiHistory(
    { file: value.file },
    { signal: signal(), maxMessages: 4, take: "last" },
  );
  NodeAssert.equal(result.truncated, true);
  NodeAssert.deepEqual(
    result.messages.map((message) => message.text),
    ["question 6", "question 7", "question 8", "question 9"],
  );
  NodeAssert.deepEqual(
    result.messages.map((message) => message.recordIndex),
    [6, 7, 8, 9],
  );
});

NodeTest.test("continues extraction after a record cursor", async (t) => {
  const lines: Array<unknown> = [header];
  for (let index = 0; index < 10; index += 1) {
    lines.push(user(`m${index}`, `question ${index}`, "2026-09-13T19:00:01.000Z"));
  }
  const value = await fixture(lines);
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const result = await extractPiHistory(
    { file: value.file },
    { signal: signal(), afterRecordIndex: 6 },
  );
  NodeAssert.deepEqual(
    result.messages.map((message) => message.recordIndex),
    [7, 8, 9],
  );
  NodeAssert.equal(result.truncated, false);
});
