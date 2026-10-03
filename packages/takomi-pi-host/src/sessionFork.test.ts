// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Isolated filesystem fixtures.
import * as NodeAssert from "node:assert/strict";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";

import { forkPiSessionFile } from "./sessionFork.ts";

async function fixture() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "takomi-fork-"));
  const workspace = NodePath.join(root, "workspace");
  const directory = NodePath.join(root, "sessions");
  await Promise.all([NodeFSP.mkdir(workspace, { recursive: true }), NodeFSP.mkdir(directory)]);
  const sourceFile = NodePath.join(directory, "2026-09-04T23-11-42-233Z_source-id.jsonl");
  const records = [
    {
      type: "session",
      version: 3,
      id: "source-id",
      timestamp: "2026-09-04T23:11:42.233Z",
      cwd: workspace,
    },
    { type: "model_change", id: "m1", parentId: null, timestamp: "2026-09-04T23:11:43Z" },
    { type: "message", id: "msg1", parentId: null, timestamp: "2026-09-04T23:11:44Z" },
  ];
  await NodeFSP.writeFile(
    sourceFile,
    records.map((entry) => `${JSON.stringify(entry)}\n`).join(""),
  );
  return { root, workspace, directory, sourceFile };
}

function signal() {
  return new AbortController().signal;
}

NodeTest.test("forks with a fresh id, parent pointer, and verbatim records", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const before = await NodeFSP.readFile(value.sourceFile, "utf8");
  const result = await forkPiSessionFile(
    { sourceFile: value.sourceFile, sessionDir: value.directory, targetCwd: value.workspace },
    { signal: signal() },
  );
  NodeAssert.notEqual(result.sessionId, "source-id");
  NodeAssert.equal(result.parentSessionFile, value.sourceFile);
  NodeAssert.equal(result.recordCount, 2);
  NodeAssert.match(NodePath.basename(result.file), /^[0-9TZ-]+_[0-9a-f-]+\.jsonl$/);
  const lines = (await NodeFSP.readFile(result.file, "utf8"))
    .split("\n")
    .filter((line) => line !== "");
  NodeAssert.equal(lines.length, 3);
  const header = JSON.parse(lines[0]!);
  NodeAssert.deepEqual(header, {
    type: "session",
    version: 3,
    id: result.sessionId,
    timestamp: header.timestamp,
    cwd: value.workspace,
    parentSession: value.sourceFile,
  });
  NodeAssert.equal(
    lines[1],
    JSON.stringify({
      type: "model_change",
      id: "m1",
      parentId: null,
      timestamp: "2026-09-04T23:11:43Z",
    }),
  );
  NodeAssert.equal(
    lines[2],
    JSON.stringify({
      type: "message",
      id: "msg1",
      parentId: null,
      timestamp: "2026-09-04T23:11:44Z",
    }),
  );
  NodeAssert.equal(await NodeFSP.readFile(value.sourceFile, "utf8"), before);
});

NodeTest.test("refuses a source outside the session directory", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const elsewhere = NodePath.join(value.root, "elsewhere.jsonl");
  await NodeFSP.copyFile(value.sourceFile, elsewhere);
  await NodeAssert.rejects(
    forkPiSessionFile(
      { sourceFile: elsewhere, sessionDir: value.directory, targetCwd: value.workspace },
      { signal: signal() },
    ),
    /escaped its session directory/,
  );
});

NodeTest.test("refuses a headerless source", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const bad = NodePath.join(value.directory, "bad.jsonl");
  await NodeFSP.writeFile(bad, '{"type":"message","id":"x"}\n');
  await NodeAssert.rejects(
    forkPiSessionFile(
      { sourceFile: bad, sessionDir: value.directory, targetCwd: value.workspace },
      { signal: signal() },
    ),
    /no readable header/,
  );
});

NodeTest.test("cuts the file at maxRecords for point-split forks", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const source = NodePath.join(value.directory, "long.jsonl");
  const records = [
    { type: "model_change", id: "c1", parentId: null, timestamp: "2026-09-04T23:11:43Z" },
    { type: "message", id: "m1", parentId: null, timestamp: "2026-09-04T23:11:44Z" },
    { type: "message", id: "m2", parentId: "m1", timestamp: "2026-09-04T23:11:45Z" },
    { type: "message", id: "m3", parentId: "m2", timestamp: "2026-09-04T23:11:46Z" },
  ];
  await NodeFSP.writeFile(
    source,
    `${JSON.stringify({ type: "session", version: 3, id: "long-source", timestamp: "2026-09-04T23:11:42.233Z", cwd: value.workspace })}\n${records.map((entry) => `${JSON.stringify(entry)}\n`).join("")}`,
  );
  const result = await forkPiSessionFile(
    { sourceFile: source, sessionDir: value.directory, targetCwd: value.workspace, maxRecords: 2 },
    { signal: signal() },
  );
  const lines = (await NodeFSP.readFile(result.file, "utf8"))
    .split("\n")
    .filter((line) => line !== "");
  NodeAssert.equal(lines.length, 3);
  NodeAssert.equal(JSON.parse(lines[1]!).id, "c1");
  NodeAssert.equal(JSON.parse(lines[2]!).id, "m1");
  NodeAssert.equal(result.recordCount, 2);
  const header = JSON.parse(lines[0]!);
  NodeAssert.equal(header.parentSession, source);
});

NodeTest.test("rejects a negative maxRecords", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  await NodeAssert.rejects(
    forkPiSessionFile(
      {
        sourceFile: value.sourceFile,
        sessionDir: value.directory,
        targetCwd: value.workspace,
        maxRecords: -1,
      },
      { signal: signal() },
    ),
    /Invalid Pi session fork request/,
  );
});

NodeTest.test("carries oversized records verbatim like the native fork", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const big = NodePath.join(value.directory, "big.jsonl");
  const payload = "x".repeat(128 * 1024);
  await NodeFSP.writeFile(
    big,
    `${JSON.stringify({ type: "session", version: 3, id: "big-source", timestamp: "2026-09-04T23:11:42.233Z", cwd: value.workspace })}\n${JSON.stringify({ type: "message", id: "big1", parentId: null, text: payload })}\n`,
  );
  const result = await forkPiSessionFile(
    { sourceFile: big, sessionDir: value.directory, targetCwd: value.workspace },
    { signal: signal() },
  );
  const lines = (await NodeFSP.readFile(result.file, "utf8"))
    .split("\n")
    .filter((line) => line !== "");
  NodeAssert.equal(lines.length, 2);
  NodeAssert.equal(JSON.parse(lines[1]!).text, payload);
});
