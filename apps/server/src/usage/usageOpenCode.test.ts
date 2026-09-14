// @effect-diagnostics nodeBuiltinImport:off - the suite seeds real SQLite
// databases on disk, outside the service's Effect FileSystem.
import * as NodeSqlite from "node:sqlite";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";

import {
  listOpenCodeDatabases,
  parseOpenCodeUsageRow,
  readOpenCodeUsage,
  type OpenCodeUsageRow,
} from "./usageOpenCode.ts";

function row(overrides: Partial<OpenCodeUsageRow> = {}): OpenCodeUsageRow {
  return {
    id: "msg_1",
    sessionId: "ses_1",
    modelId: "glm-5.3",
    completedMs: 1789352490532,
    inputTokens: 1906,
    cachedReadTokens: 72192,
    cacheWriteTokens: 0,
    outputTokens: 160,
    reasoningTokens: 99,
    cost: 0,
    ...overrides,
  };
}

describe("parseOpenCodeUsageRow", () => {
  it("maps the measured OpenCode token semantics onto the shared contract", () => {
    const record = parseOpenCodeUsageRow(row());
    // 2026-09-12T21:41:30.532Z.
    expect(record).toEqual({
      provider: "opencode",
      timestampMs: 1789352490532,
      model: "glm-5.3",
      sessionId: "ses_1",
      totals: {
        uncachedInputTokens: 1906,
        cachedInputTokens: 72192,
        cacheCreationTokens: 0,
        outputTokens: 259,
        reasoningTokens: 99,
      },
      reportedCostUsd: null,
      dedupeKey: "opencode:msg_1",
    });
  });

  it("folds disjoint reasoning into output so no generated token is dropped", () => {
    const record = parseOpenCodeUsageRow(row({ outputTokens: 100, reasoningTokens: 250 }));
    expect(record?.totals.outputTokens).toBe(350);
    expect(record?.totals.reasoningTokens).toBe(250);
  });

  it("treats a reported cost of zero as unknown so the rate table prices the turn", () => {
    expect(parseOpenCodeUsageRow(row({ cost: 0 }))?.reportedCostUsd).toBeNull();
    expect(parseOpenCodeUsageRow(row({ cost: 0.0123 }))?.reportedCostUsd).toBe(0.0123);
    expect(parseOpenCodeUsageRow(row({ cost: -1 }))?.reportedCostUsd).toBeNull();
  });

  it("skips rows that carry no usage", () => {
    // Mid-stream snapshots have no completed time and zero tokens.
    expect(parseOpenCodeUsageRow(row({ completedMs: undefined }))).toBeNull();
    expect(
      parseOpenCodeUsageRow(
        row({ inputTokens: 0, cachedReadTokens: 0, outputTokens: 0, reasoningTokens: 0 }),
      ),
    ).toBeNull();
    expect(parseOpenCodeUsageRow(row({ modelId: "" }))).toBeNull();
    expect(parseOpenCodeUsageRow(row({ id: 42 }))).toBeNull();
  });
});

describe("listOpenCodeDatabases", () => {
  /** Each test gets its own temp root so XDG resolution never escapes it. */
  async function makeRoot(): Promise<{ root: string; dataDirectory: string }> {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "opencode-discover-"));
    return { root, dataDirectory: NodePath.join(root, "share") };
  }

  it("resolves the XDG data directory and its channel databases", async () => {
    const { root, dataDirectory } = await makeRoot();
    try {
      await NodeFSP.mkdir(NodePath.join(dataDirectory, "opencode"), { recursive: true });
      await NodeFSP.writeFile(NodePath.join(dataDirectory, "opencode", "opencode.db"), "");
      await NodeFSP.writeFile(NodePath.join(dataDirectory, "opencode", "opencode-beta.db"), "");
      await NodeFSP.writeFile(NodePath.join(dataDirectory, "opencode", "notes.txt"), "");

      const databases = await listOpenCodeDatabases({
        environment: { XDG_DATA_HOME: dataDirectory },
        homeDirectory: root,
      });
      expect(databases).toEqual([
        NodePath.join(dataDirectory, "opencode", "opencode.db"),
        NodePath.join(dataDirectory, "opencode", "opencode-beta.db"),
      ]);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to ~/.local/share/opencode when XDG is unset", async () => {
    const { root } = await makeRoot();
    try {
      const databases = await listOpenCodeDatabases({ environment: {}, homeDirectory: root });
      expect(databases).toEqual([
        NodePath.join(root, ".local", "share", "opencode", "opencode.db"),
      ]);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("uses the provider environment home when XDG is unset", async () => {
    const { root } = await makeRoot();
    try {
      const providerHome = NodePath.join(root, "provider-home");
      const databases = await listOpenCodeDatabases({
        environment: { HOME: providerHome },
        homeDirectory: root,
      });
      expect(databases).toEqual([
        NodePath.join(providerHome, ".local", "share", "opencode", "opencode.db"),
      ]);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("replaces discovery with OPENCODE_DB, resolving relative paths against the data directory", async () => {
    const { root, dataDirectory } = await makeRoot();
    try {
      const elsewhere = NodePath.join(root, "elsewhere", "custom.db");
      const absolute = await listOpenCodeDatabases({
        environment: { XDG_DATA_HOME: dataDirectory, OPENCODE_DB: elsewhere },
        homeDirectory: root,
      });
      expect(absolute).toEqual([elsewhere]);

      const relative = await listOpenCodeDatabases({
        environment: { XDG_DATA_HOME: dataDirectory, OPENCODE_DB: "opencode-alt.db" },
        homeDirectory: root,
      });
      expect(relative).toEqual([NodePath.join(dataDirectory, "opencode", "opencode-alt.db")]);

      const memory = await listOpenCodeDatabases({
        environment: { XDG_DATA_HOME: dataDirectory, OPENCODE_DB: ":memory:" },
        homeDirectory: root,
      });
      // `:memory:` is not a durable usage source — falls through to the
      // default stable path, which reports missing when absent.
      expect(memory).toEqual([NodePath.join(dataDirectory, "opencode", "opencode.db")]);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("skips channel databases when OpenCode disables them", async () => {
    const { root, dataDirectory } = await makeRoot();
    try {
      const databases = await listOpenCodeDatabases({
        environment: { XDG_DATA_HOME: dataDirectory, OPENCODE_DISABLE_CHANNEL_DB: "1" },
        homeDirectory: root,
      });
      expect(databases).toEqual([NodePath.join(dataDirectory, "opencode", "opencode.db")]);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("reports the stable path even when the data directory does not exist", async () => {
    const { root } = await makeRoot();
    try {
      const databases = await listOpenCodeDatabases({
        environment: { XDG_DATA_HOME: NodePath.join(root, "missing") },
        homeDirectory: root,
      });
      expect(databases).toEqual([NodePath.join(root, "missing", "opencode", "opencode.db")]);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });
});

describe("readOpenCodeUsage", () => {
  const COMPLETED = 1789352490532;
  const OLD = 1789000000000;

  async function seedDatabase(): Promise<string> {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "opencode-usage-"));
    const databasePath = NodePath.join(directory, "opencode.db");
    const db = new NodeSqlite.DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
      CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, time_updated INTEGER, data TEXT);
    `);
    const insertMessage = db.prepare(
      "INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)",
    );
    const insertSessionMessage = db.prepare(
      "INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    // A completed assistant turn: cost 0 means subscription-priced.
    insertMessage.run(
      "msg_a",
      "ses_1",
      COMPLETED,
      COMPLETED,
      JSON.stringify({
        role: "assistant",
        modelID: "glm-5.3",
        cost: 0,
        tokens: {
          total: 74357,
          input: 1906,
          output: 160,
          reasoning: 99,
          cache: { read: 72192, write: 0 },
        },
        time: { created: 1789352486437, completed: COMPLETED },
      }),
    );
    // A turn that reports its own cost.
    insertMessage.run(
      "msg_b",
      "ses_1",
      COMPLETED + 1000,
      COMPLETED + 1000,
      JSON.stringify({
        role: "assistant",
        modelID: "claude-opus-5",
        cost: 0.42,
        tokens: { input: 500, output: 50, reasoning: 0, cache: { read: 0, write: 10 } },
        time: { created: COMPLETED, completed: COMPLETED + 1000 },
      }),
    );
    // A mid-stream snapshot: no completed time, no usage yet.
    insertMessage.run(
      "msg_c",
      "ses_1",
      COMPLETED + 2000,
      COMPLETED + 2000,
      JSON.stringify({
        role: "assistant",
        modelID: "glm-5.3",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: COMPLETED + 2000 },
      }),
    );
    // A user message and an out-of-window assistant row: neither counts.
    insertMessage.run(
      "msg_d",
      "ses_1",
      COMPLETED + 3000,
      COMPLETED + 3000,
      JSON.stringify({
        role: "user",
        modelID: "glm-5.3",
        tokens: { input: 10, output: 0 },
        time: { created: COMPLETED + 3000, completed: COMPLETED + 3000 },
      }),
    );
    insertMessage.run(
      "msg_e",
      "ses_0",
      OLD,
      OLD,
      JSON.stringify({
        role: "assistant",
        modelID: "glm-5.3",
        cost: 1,
        tokens: { input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: OLD, completed: OLD },
      }),
    );
    // A row that migrated to session_message: same id in both tables, the
    // current table's numbers must win.
    insertMessage.run(
      "msg_f",
      "ses_2",
      COMPLETED,
      COMPLETED,
      JSON.stringify({
        role: "assistant",
        modelID: "gpt-5.6-sol",
        cost: 0,
        tokens: { input: 111, output: 11, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: COMPLETED, completed: COMPLETED },
      }),
    );
    insertSessionMessage.run(
      "msg_f",
      "ses_2",
      "assistant",
      0,
      COMPLETED,
      COMPLETED,
      JSON.stringify({
        type: "assistant",
        model: { providerID: "openai", id: "gpt-5.6-sol" },
        cost: 0,
        tokens: { input: 222, output: 22, reasoning: 2, cache: { read: 0, write: 0 } },
        time: { created: COMPLETED, completed: COMPLETED },
      }),
    );
    // One in-window row with unparsable data.
    insertMessage.run("msg_g", "ses_3", COMPLETED, COMPLETED, "{not json");
    insertMessage.run(
      "msg_h",
      "ses_4",
      COMPLETED,
      COMPLETED,
      JSON.stringify({
        role: "assistant",
        tokens: { input: 10, output: 5 },
        time: { created: COMPLETED, completed: COMPLETED },
      }),
    );
    db.close();
    return databasePath;
  }

  it("reads both tables, prefers the current one, and reports malformed rows", async () => {
    const databasePath = await seedDatabase();
    try {
      const read = await readOpenCodeUsage(databasePath, COMPLETED - 1);
      expect(read).not.toBeNull();

      const byKey = new Map(read!.records.map((record) => [record.dedupeKey, record]));
      expect([...byKey.keys()].sort()).toEqual([
        "opencode:msg_a",
        "opencode:msg_b",
        "opencode:msg_f",
      ]);

      expect(byKey.get("opencode:msg_a")?.totals).toEqual({
        uncachedInputTokens: 1906,
        cachedInputTokens: 72192,
        cacheCreationTokens: 0,
        outputTokens: 259,
        reasoningTokens: 99,
      });
      expect(byKey.get("opencode:msg_a")?.reportedCostUsd).toBeNull();
      expect(byKey.get("opencode:msg_b")?.reportedCostUsd).toBe(0.42);
      // msg_f counts once, from session_message: 222/22/2, not 111/11/0.
      expect(byKey.get("opencode:msg_f")?.totals).toEqual({
        uncachedInputTokens: 222,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 24,
        reasoningTokens: 2,
      });
      expect(byKey.get("opencode:msg_f")?.model).toBe("gpt-5.6-sol");
      expect(byKey.get("opencode:msg_f")?.sessionId).toBe("ses_2");

      expect(read!.malformedRecords).toBe(2);
      expect([...read!.tables].sort()).toEqual(["message", "session_message"]);
    } finally {
      await NodeFSP.rm(NodePath.dirname(databasePath), { recursive: true, force: true });
    }
  });

  it("returns null for a missing or unreadable database", async () => {
    expect(await readOpenCodeUsage("Z:\\does\\not\\exist\\opencode.db", 0)).toBeNull();

    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "opencode-bad-"));
    const notADatabase = NodePath.join(directory, "opencode.db");
    await NodeFSP.writeFile(notADatabase, "this is not a database");
    try {
      expect(await readOpenCodeUsage(notADatabase, 0)).toBeNull();
    } finally {
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  });
});
