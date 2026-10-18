import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { DEFAULT_SERVER_SETTINGS, ProviderInstanceId } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";
import { openCodeUsageReader, readOpenCodeUsage } from "./usage.ts";

it.effect("prefers migrated rows, skips malformed records and reports unreadable databases", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "opencode-migration-test-" });
    const database = path.join(root, "history.sqlite");
    const sql = yield* Layer.build(NodeSqliteClient.layer({ filename: database })).pipe(
      Effect.map(Context.get(SqlClient.SqlClient)),
    );
    yield* sql.unsafe("CREATE TABLE message (id TEXT, session_id TEXT, data TEXT)");
    yield* sql.unsafe(
      "CREATE TABLE session_message (id TEXT, session_id TEXT, type TEXT, data TEXT)",
    );
    const message = {
      role: "assistant",
      model: { id: "model" },
      time: { completed: 1785638400000 },
      cost: { total: 0.25 },
      tokens: { input: 5, output: 10 },
    };
    yield* sql.unsafe("INSERT INTO message VALUES (?, ?, ?)", [
      "shared",
      "session",
      JSON.stringify(message),
    ]);
    yield* sql.unsafe("INSERT INTO session_message VALUES (?, ?, ?, ?)", [
      "shared",
      "session",
      "assistant",
      JSON.stringify({ ...message, tokens: { input: 5, output: 20 } }),
    ]);
    yield* sql.unsafe("INSERT INTO message VALUES (?, ?, ?)", ["bad", "session", "{invalid"]);
    const read = yield* readOpenCodeUsage(root, 0, { databasePath: database });
    const records = read.files.flatMap((file) => file.records);
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0]?.totals.outputTokens, 20);
    assert.strictEqual(records[0]?.reportedCostUsd, 0.25);
    const missing = yield* readOpenCodeUsage(root, 0, {
      databasePath: path.join(root, "missing.sqlite"),
    });
    assert.isTrue(missing.missing);
    const corrupt = path.join(root, "corrupt.sqlite");
    yield* fs.writeFileString(corrupt, "not SQLite");
    assert.isTrue((yield* readOpenCodeUsage(root, 0, { databasePath: corrupt })).error);
    const empty = path.join(root, "empty.sqlite");
    yield* Layer.build(NodeSqliteClient.layer({ filename: empty }));
    assert.isTrue((yield* readOpenCodeUsage(root, 0, { databasePath: empty })).error);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "discovers explicit and channel databases with configured environments and preserves token semantics",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "opencode-discovery-test-" });
      const data = path.join(home, "xdg", "opencode");
      yield* fs.makeDirectory(data, { recursive: true });
      const now = 1785638400000;
      for (const name of ["opencode.db", "opencode-preview.1.db", "custom.sqlite"]) {
        const sql = yield* Layer.build(
          NodeSqliteClient.layer({ filename: path.join(data, name) }),
        ).pipe(Effect.map(Context.get(SqlClient.SqlClient)));
        yield* sql.unsafe(
          "CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT)",
        );
        yield* sql.unsafe("INSERT INTO message VALUES (?, ?, ?, ?)", [
          name,
          "session",
          now,
          JSON.stringify({
            role: "assistant",
            modelID: "glm-5.3",
            cost: 0,
            time: { completed: now },
            tokens: { input: 1906, output: 160, reasoning: 999, cache: { read: 72192, write: 5 } },
          }),
        ]);
      }
      const scan = (environment: NodeJS.ProcessEnv, extra?: NodeJS.ProcessEnv) => {
        const instances =
          extra === undefined
            ? []
            : [
                {
                  instanceId: ProviderInstanceId.make("opencode-work"),
                  configured: true,
                  config: undefined,
                  environment: { HOME: home, XDG_DATA_HOME: path.join(home, "xdg"), ...extra },
                },
              ];
        return openCodeUsageReader
          .scan({
            instances,
            settings: DEFAULT_SERVER_SETTINGS,
            windowStartMs: now - 1,
            retentionCutoffMs: 0,
            awaitRefresh: true,
          })
          .pipe(
            Effect.provideService(HostProcess.Environment, {
              HOME: home,
              XDG_DATA_HOME: path.join(home, "xdg"),
              ...environment,
            }),
            Effect.provideService(HostProcess.HomeDirectory, home),
          );
      };
      const discovered = yield* scan({});
      assert.deepStrictEqual(
        discovered.flatMap((source) => source.files ?? []).map((file) => path.basename(file.path)),
        ["opencode.db", "opencode-preview.1.db"],
      );
      const record = discovered[0]?.files?.[0]?.records[0];
      assert.deepStrictEqual(record?.totals, {
        uncachedInputTokens: 1906,
        cachedInputTokens: 72192,
        cacheCreationTokens: 5,
        outputTokens: 1159,
        reasoningTokens: 999,
      });
      assert.strictEqual(record?.reportedCostUsd, null);
      for (const flag of ["1", "true", "TRUE"]) {
        const stable = yield* scan({ OPENCODE_DISABLE_CHANNEL_DB: flag });
        assert.deepStrictEqual(
          stable.flatMap((source) => source.files ?? []).map((file) => path.basename(file.path)),
          ["opencode.db"],
        );
      }
      for (const override of ["custom.sqlite", path.join(data, "custom.sqlite")]) {
        const explicit = yield* scan({ OPENCODE_DB: override });
        assert.deepStrictEqual(
          explicit.map((source) => source.dir),
          [path.join(data, "custom.sqlite")],
        );
        assert.strictEqual(explicit[0]?.files?.[0]?.records.length, 1);
      }
      assert.strictEqual(
        (yield* scan({ OPENCODE_DB: ":memory:" })).flatMap((source) => source.files ?? []).length,
        2,
      );
      const missing = yield* scan({ OPENCODE_DB: "missing.sqlite" });
      assert.isNull(missing[0]?.files);
      const withInstance = yield* scan({}, { OPENCODE_DB: "custom.sqlite" });
      assert.strictEqual(withInstance.flatMap((source) => source.files ?? []).length, 3);
      const deduplicated = yield* scan({}, { OPENCODE_DB: "opencode.db" });
      assert.strictEqual(deduplicated.flatMap((source) => source.files ?? []).length, 2);
    }).pipe(Effect.provide(NodeServices.layer)),
);
