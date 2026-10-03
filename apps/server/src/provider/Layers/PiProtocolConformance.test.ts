// @effect-diagnostics nodeBuiltinImport:off - This protocol harness launches only its synthetic stdio peer.
// @effect-diagnostics globalTimers:off - Peer deadlines are cleared on response, exit, and disposal.
import assert from "node:assert/strict";
import * as ChildProcess from "node:child_process";
import * as Crypto from "node:crypto";
import * as FileSystem from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  activePiSessionBranch,
  assertPiRpcOperations,
  encodePiJsonlRecord,
  parsePiSessionV3,
  PiJsonlDecoder,
  probePiProtocol,
  resolvePiPackageFromBinary,
  type PiJsonlFrame,
  type PiRpcRecord,
  validatePiRpcConformanceFixture,
} from "./PiProtocolConformance.ts";
import rpcFixture from "../testFixtures/pi-v0.84.4-rpc.json" with { type: "json" };
import { PI_ADVERTISED_RPC_OPERATIONS } from "./PiProvider.ts";

const fixtures = Path.join(import.meta.dirname, "../testFixtures");
const rpcPeer = Path.join(fixtures, "piMockPeer.mjs");
const sessionManagerProbe = Path.join(fixtures, "piSessionManagerConformance.mjs");
const sessionFixture = Path.join(fixtures, "pi-v0.84.4-session.v3.jsonl");

function records(frames: ReadonlyArray<PiJsonlFrame>): ReadonlyArray<PiRpcRecord> {
  return frames.flatMap((frame) => (frame.type === "record" ? [frame.record] : []));
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Reflect.get(value, key)
    : undefined;
}

interface PeerOptions {
  readonly malformed?: boolean;
  readonly oversized?: boolean;
  readonly unterminated?: boolean;
  readonly earlyExit?: boolean;
}

async function openPeer(options: PeerOptions = {}) {
  const directory = await FileSystem.mkdtemp(Path.join(Os.tmpdir(), "t3-pi-conformance-"));
  const transcript = Path.join(directory, "transcript.jsonl");
  const child = ChildProcess.spawn(process.execPath, [rpcPeer], {
    env: {
      ...process.env,
      T3_PI_CONFORMANCE_TRANSCRIPT: transcript,
      T3_PI_CONFORMANCE_OUT_OF_ORDER: "1",
      ...(options.malformed ? { T3_PI_CONFORMANCE_MALFORMED: "1" } : {}),
      ...(options.oversized ? { T3_PI_CONFORMANCE_OVERSIZED: "1" } : {}),
      ...(options.unterminated ? { T3_PI_CONFORMANCE_UNTERMINATED: "1" } : {}),
      ...(options.earlyExit ? { T3_PI_CONFORMANCE_EARLY_EXIT: "1" } : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert.notEqual(child.stdin, null);
  assert.notEqual(child.stdout, null);
  assert.notEqual(child.stderr, null);
  let stderrText = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderrText += chunk.toString("utf8");
  });
  const decoder = new PiJsonlDecoder();
  const frames: PiJsonlFrame[] = [];
  const waiters = new Set<{
    readonly predicate: (record: PiRpcRecord) => boolean;
    readonly resolve: (record: PiRpcRecord) => void;
    readonly reject: (error: Error) => void;
    readonly timer: NodeJS.Timeout;
  }>();
  let transportError: Error | undefined;
  let exitCode: number | null | undefined;
  const rejectWaiters = (error: Error) => {
    transportError = error;
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    waiters.clear();
  };
  const notify = () => {
    for (const waiter of waiters) {
      const match = records(frames).find(waiter.predicate);
      if (match !== undefined) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve(match);
      }
    }
  };
  child.stdout.on("data", (chunk: Buffer) => {
    frames.push(...decoder.push(chunk));
    notify();
  });
  const exited = new Promise<number | null>((resolve) => {
    child.once("error", (error) => {
      rejectWaiters(error);
      resolve(null);
    });
    child.once("close", (code) => {
      exitCode = code;
      frames.push(...decoder.finish());
      notify();
      rejectWaiters(
        new Error(
          `Synthetic Pi peer exited with code ${String(code)}${stderrText ? `: ${stderrText.trim()}` : "."}`,
        ),
      );
      resolve(code);
    });
  });
  const send = (record: PiRpcRecord) => {
    if (transportError !== undefined || child.stdin!.destroyed)
      throw transportError ?? new Error("Synthetic Pi peer stdin is closed.");
    child.stdin!.write(encodePiJsonlRecord(record));
  };
  const waitFor = (
    predicate: (record: PiRpcRecord) => boolean,
    timeoutMs = 2_000,
  ): Promise<PiRpcRecord> => {
    const match = records(frames).find(predicate);
    if (match !== undefined) return Promise.resolve(match);
    if (transportError !== undefined) return Promise.reject(transportError);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`Timed out after ${timeoutMs}ms waiting for synthetic Pi RPC output.`));
        }, timeoutMs),
      };
      waiters.add(waiter);
    });
  };
  const exitsWithin = (timeoutMs: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      void exited.then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  const ensureExited = async () => {
    if (exitCode !== undefined) return exitCode;
    if (await exitsWithin(2_000)) return exitCode ?? null;
    child.kill();
    if (await exitsWithin(2_000)) return exitCode ?? null;
    throw new Error(
      `Synthetic Pi peer did not terminate after kill${stderrText ? `: ${stderrText.trim()}` : "."}`,
    );
  };
  const close = async () => {
    if (!child.stdin!.destroyed) child.stdin!.end();
    const code = await ensureExited();
    return {
      exitCode: code,
      frames: [...frames],
      transcript: await FileSystem.readFile(transcript, "utf8").catch(() => ""),
      stderr: stderrText,
    };
  };
  const dispose = async () => {
    if (!child.stdin!.destroyed) child.stdin!.end();
    if (exitCode === undefined) child.kill();
    await ensureExited();
    await FileSystem.rm(directory, { recursive: true, force: true });
  };
  return { frames, send, waitFor, close, dispose, child };
}

describe("Pi 0.84.4 protocol conformance", () => {
  it("preserves strict JSONL framing across split UTF-8, CRLF, multiple records, and abrupt EOF", () => {
    const encoder = new TextEncoder();
    const decoder = new PiJsonlDecoder();
    const first = encoder.encode('{"type":"message_update","delta":"€\\u2028\\u2029"}\r\n');
    const second = encoder.encode('{"type":"agent_settled","future":{"kept":true}}\n');
    const joined = new Uint8Array(first.length + second.length);
    joined.set(first);
    joined.set(second, first.length);
    const euro = joined.indexOf(0xe2);
    const cr = joined.indexOf(0x0d);
    const frames = [
      ...decoder.push(joined.subarray(0, euro + 1)),
      ...decoder.push(joined.subarray(euro + 1, euro + 2)),
      ...decoder.push(joined.subarray(euro + 2, cr + 1)),
      ...decoder.push(joined.subarray(cr + 1)),
      ...decoder.finish(),
    ];

    expect(records(frames)).toEqual([
      { type: "message_update", delta: "€\u2028\u2029" },
      { type: "agent_settled", future: { kept: true } },
    ]);

    const eof = new PiJsonlDecoder();
    expect(
      records([...eof.push(encoder.encode('{"type":"response","id":"eof"}')), ...eof.finish()]),
    ).toEqual([{ type: "response", id: "eof" }]);
  });

  it("rejects malformed and oversized records without losing the following frame", () => {
    const decoder = new PiJsonlDecoder();
    const oversized = new Uint8Array(1024 * 1024 + 1).fill(0x78);
    const valid = new TextEncoder().encode('{"type":"agent_settled"}\n');
    const chunk = new Uint8Array(oversized.length + 1 + valid.length);
    chunk.set(oversized);
    chunk[oversized.length] = 0x0a;
    chunk.set(valid, oversized.length + 1);
    expect(decoder.push(chunk)).toEqual([
      { type: "invalid", reason: "oversized" },
      { type: "record", record: { type: "agent_settled" } },
    ]);

    const malformed = new PiJsonlDecoder();
    expect(malformed.push(new TextEncoder().encode('{not-json}\n{"type":"ok"}\n'))).toEqual([
      { type: "invalid", reason: "invalid-json" },
      { type: "record", record: { type: "ok" } },
    ]);

    const unterminated = new PiJsonlDecoder();
    expect(unterminated.push(oversized)).toEqual([]);
    expect(unterminated.finish()).toEqual([{ type: "invalid", reason: "oversized" }]);
  });

  it("replays the synthetic peer's exact command framing, out-of-order responses, and complete event vocabulary", async () => {
    const peer = await openPeer();
    try {
      peer.send({ type: "get_state", id: "state-1" });
      peer.send({ type: "get_commands", id: "commands-1" });
      await peer.waitFor((record) => record.id === "state-1");
      const commands = await peer.waitFor((record) => record.id === "commands-1");
      peer.send({ type: "get_entries", id: "entries-1" });
      peer.send({ type: "get_tree", id: "tree-1" });
      const entries = await peer.waitFor((record) => record.id === "entries-1");
      const tree = await peer.waitFor((record) => record.id === "tree-1");
      expect(field(entries.data, "leafId")).toBe("active-label");
      expect(field(entries.data, "entries")).toHaveLength(11);
      expect(commands.data).toEqual({ commands: rpcFixture.slashCommands });
      expect(
        rpcFixture.slashCommands.filter((command) => rpcFixture.rpcMethods.includes(command.name)),
      ).toEqual([]);
      expect(field(tree.data, "tree")).toHaveLength(1);
      peer.send({ type: "prompt", id: "prompt-1", message: "Synthetic only" });
      await peer.waitFor((record) => record.type === "agent_settled");
      peer.send({ type: "extension_ui_response", id: "confirm-1", confirmed: true });
      peer.send({ type: "abort", id: "abort-1" });
      await peer.waitFor(
        (record) => record.type === "tool_execution_update" && record.toolCallId === "tool-late",
      );
      const result = await peer.close();
      expect(result.exitCode).toBe(0);
      const received = records(result.frames);
      const responseIds = received
        .filter((record) => record.type === "response")
        .map((record) => record.id);
      expect(responseIds.slice(0, 4)).toEqual(["commands-1", "state-1", "entries-1", "tree-1"]);
      expect(responseIds).toContain("prompt-1");
      expect(
        received
          .filter((record) => record.type === "message_update")
          .map((record) => field(record.assistantMessageEvent, "type")),
      ).toEqual(
        expect.arrayContaining([
          "text_start",
          "text_delta",
          "text_end",
          "thinking_start",
          "thinking_delta",
          "thinking_end",
          "toolcall_start",
          "toolcall_delta",
          "toolcall_end",
        ]),
      );
      expect(
        received
          .filter((record) => record.type === "extension_ui_request")
          .map((record) => record.method),
      ).toEqual(
        expect.arrayContaining([
          "confirm",
          "select",
          "input",
          "editor",
          "notify",
          "setStatus",
          "setWidget",
          "setTitle",
          "set_editor_text",
        ]),
      );
      for (const type of [
        "message_update",
        "tool_execution_start",
        "tool_execution_update",
        "tool_execution_end",
        "queue_update",
        "extension_ui_request",
        "compaction_start",
        "compaction_end",
        "auto_retry_start",
        "auto_retry_end",
        "summarization_retry_scheduled",
        "summarization_retry_attempt_start",
        "summarization_retry_finished",
        "agent_settled",
      ]) {
        expect(received.some((record) => record.type === type)).toBe(true);
      }
      expect(result.transcript).toBe(
        '{"type":"get_state","id":"state-1"}\n' +
          '{"type":"get_commands","id":"commands-1"}\n' +
          '{"type":"get_entries","id":"entries-1"}\n' +
          '{"type":"get_tree","id":"tree-1"}\n' +
          '{"type":"prompt","id":"prompt-1","message":"Synthetic only"}\n' +
          '{"type":"extension_ui_response","id":"confirm-1","confirmed":true}\n' +
          '{"type":"abort","id":"abort-1"}\n',
      );
    } finally {
      await peer.dispose();
    }
  });

  it("rejects bounded waiters on peer early exit and reaps the captured child", async () => {
    const peer = await openPeer({ earlyExit: true });
    try {
      peer.send({ type: "get_state", id: "state-early-exit" });
      await expect(peer.waitFor((record) => record.id === "state-early-exit")).rejects.toThrow(
        "exited with code 17: synthetic early exit",
      );
    } finally {
      await peer.dispose();
    }
    expect(peer.child.exitCode).toBe(17);
  });

  it("reports an invalid unterminated frame when the peer exits", async () => {
    const peer = await openPeer({ unterminated: true });
    try {
      peer.send({ type: "prompt", id: "prompt-unterminated", message: "Synthetic only" });
      await expect(peer.waitFor(() => false)).rejects.toThrow("exited with code 18");
      expect(peer.frames).toContainEqual({ type: "invalid", reason: "invalid-json" });
    } finally {
      await peer.dispose();
    }
    expect(peer.child.exitCode).toBe(18);
  });

  it("keeps malformed and oversized peer output visible as bounded protocol failures", async () => {
    const peer = await openPeer({ malformed: true, oversized: true });
    try {
      peer.send({ type: "get_state", id: "state-1" });
      peer.send({ type: "get_commands", id: "commands-1" });
      await peer.waitFor((record) => record.id === "state-1");
      peer.send({ type: "prompt", id: "prompt-1", message: "Synthetic only" });
      await peer.waitFor((record) => record.type === "agent_settled");
      const result = await peer.close();
      expect(result.frames).toContainEqual({ type: "invalid", reason: "invalid-json" });
      expect(result.frames).toContainEqual({ type: "invalid", reason: "oversized" });
    } finally {
      await peer.dispose();
    }
  });

  it("binds compatibility to the resolved Pi package declarations, not slash-command discovery", async () => {
    const packagePath = await resolvePiPackageFromBinary("pi", process.env);
    const probe = await probePiProtocol(packagePath);
    expect(probe.version).toBe("0.84.4");
    expect(probe.packagePath).toBe(packagePath);
    expect(probe.packageJsonSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(probe.rpcDeclarationsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(probe.rpcCommands).toEqual(rpcFixture.rpcMethods);
    assertPiRpcOperations(probe, PI_ADVERTISED_RPC_OPERATIONS);
    expect(() =>
      assertPiRpcOperations(
        { ...probe, rpcCommands: probe.rpcCommands.filter((command) => command !== "set_model") },
        PI_ADVERTISED_RPC_OPERATIONS,
      ),
    ).toThrow("does not declare advertised RPC operation(s): set_model");
    validatePiRpcConformanceFixture(rpcFixture, probe);
    const forwardFrames = new PiJsonlDecoder().push(
      encodePiJsonlRecord(rpcFixture.forwardCompatibleRecord),
    );
    expect(records(forwardFrames)).toEqual([rpcFixture.forwardCompatibleRecord]);

    const conflated = structuredClone(rpcFixture);
    conflated.slashCommands[0]!.name = "get_state";
    expect(() => validatePiRpcConformanceFixture(conflated, probe)).toThrow(
      "conflated with RPC method discriminants",
    );
    // `get_commands` describes slash commands; it is never used to infer T3 capabilities.
  });

  it("continues a copied fixture through Pi's public SessionManager and preserves its branch state", async () => {
    const packagePath = await resolvePiPackageFromBinary("pi", process.env);
    const source = await FileSystem.readFile(sessionFixture);
    const sourceChecksum = Crypto.createHash("sha256").update(source).digest("hex");
    const fixture = parsePiSessionV3(source);
    expect(fixture.highWaterId).toBe("active-label");
    expect(activePiSessionBranch(fixture.entries, fixture.highWaterId).at(-1)?.id).toBe(
      fixture.highWaterId,
    );

    const directory = await FileSystem.mkdtemp(Path.join(Os.tmpdir(), "t3-pi-session-"));
    const copiedFixture = Path.join(directory, "pi-v0.84.4-session.v3.jsonl");
    try {
      await FileSystem.copyFile(sessionFixture, copiedFixture);
      expect(
        Crypto.createHash("sha256")
          .update(await FileSystem.readFile(copiedFixture))
          .digest("hex"),
      ).toBe(sourceChecksum);
      const result = await new Promise<string>((resolve, reject) => {
        ChildProcess.execFile(
          process.execPath,
          [sessionManagerProbe, packagePath, directory, copiedFixture],
          { timeout: 15_000 },
          (error, stdout, stderr) => {
            if (error === null) resolve(stdout);
            else reject(new Error(stderr || error.message));
          },
        );
      });
      const evidence = JSON.parse(result);
      expect(evidence.source).toEqual({
        headerVersion: 3,
        entryCount: 11,
        highWaterId: "active-label",
        leafId: "active-label",
        branchLeafId: "active-label",
        customEntryId: "extension-state",
        customData: { restored: true, revision: 1 },
        treeRoots: 1,
        treeEntryIds: [
          "root-user",
          "model-change",
          "thinking-change",
          "assistant-tool-call",
          "tool-result",
          "extension-state",
          "compaction",
          "original-leaf",
          "branch-summary",
          "alternate-user",
          "active-label",
        ],
      });
      expect(evidence.appended.content).toBe("Synthetic fixture continuation.");
      expect(evidence.appended.promptParentId).toBe(evidence.source.leafId);
      expect(evidence.reopened).toEqual({
        entryCount: 12,
        highWaterId: evidence.appended.promptEntryId,
        leafId: evidence.appended.promptEntryId,
        branchLeafId: evidence.appended.promptEntryId,
        customEntryId: evidence.source.customEntryId,
        customData: evidence.source.customData,
        treeRoots: 1,
        treeEntryIds: [...evidence.source.treeEntryIds, evidence.appended.promptEntryId],
      });
      expect(
        Crypto.createHash("sha256")
          .update(await FileSystem.readFile(copiedFixture))
          .digest("hex"),
      ).not.toBe(sourceChecksum);
    } finally {
      await FileSystem.rm(directory, { recursive: true, force: true });
    }
    expect(
      Crypto.createHash("sha256")
        .update(await FileSystem.readFile(sessionFixture))
        .digest("hex"),
    ).toBe(sourceChecksum);
  });
});
