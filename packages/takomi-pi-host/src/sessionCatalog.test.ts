// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Isolated filesystem fixtures.
import * as NodeAssert from "node:assert/strict";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";

import { PI_CATALOG_HARD_CEILING, scanPiSessionCatalog } from "./sessionCatalog.ts";

async function fixture() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "takomi-catalog-"));
  const workspace = NodePath.join(root, "workspace");
  const agentDir = NodePath.join(root, "agent");
  const packageRoot = NodePath.join(root, "pi");
  await Promise.all([
    NodeFSP.mkdir(workspace, { recursive: true }),
    NodeFSP.mkdir(NodePath.join(agentDir, "sessions"), { recursive: true }),
    NodeFSP.mkdir(packageRoot, { recursive: true }),
  ]);
  await NodeFSP.writeFile(
    NodePath.join(packageRoot, "package.json"),
    JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.84.4" }),
  );
  const encoded = `--${workspace.replace(/^[\\/]/, "").replaceAll(/[\\/:]/g, "-")}--`;
  const directory = NodePath.join(agentDir, "sessions", encoded);
  await NodeFSP.mkdir(directory);
  return { root, workspace, agentDir, packageRoot, directory };
}

async function writeSession(input: {
  readonly directory: string;
  readonly fileName: string;
  readonly cwd: string;
  readonly id?: string;
  readonly version?: unknown;
  readonly suffix?: string;
}): Promise<string> {
  const file = NodePath.join(input.directory, input.fileName);
  await NodeFSP.writeFile(
    file,
    `${JSON.stringify({
      type: "session",
      version: input.version ?? 3,
      id: input.id ?? input.fileName.slice(0, -6),
      timestamp: "2026-09-03T13:36:00.000Z",
      cwd: input.cwd,
    })}\n${JSON.stringify({
      type: "session_info",
      id: "info",
      parentId: null,
      timestamp: "2026-09-03T13:36:01.000Z",
      name: "Safe session",
    })}\n${input.suffix ?? ""}`,
  );
  return file;
}

function request(value: Awaited<ReturnType<typeof fixture>>, overrides = {}) {
  return {
    workspacePath: value.workspace,
    agentDir: value.agentDir,
    packageRoot: value.packageRoot,
    launchArgs: [],
    ...overrides,
  };
}

NodeTest.test("reads safe metadata without writing or claiming source ownership", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const file = await writeSession({
    directory: value.directory,
    fileName: "one.jsonl",
    cwd: value.workspace,
  });
  const before = await NodeFSP.readFile(file);
  const result = await scanPiSessionCatalog(request(value), {
    signal: new AbortController().signal,
  });
  NodeAssert.deepEqual(await NodeFSP.readFile(file), before);
  NodeAssert.equal(result.entries.length, 1);
  NodeAssert.equal(result.entries[0]!.activity, "unobservable");
  NodeAssert.equal(result.entries[0]!.ownership, "external-source");
});

NodeTest.test(
  "uses launch, environment, settings, then default session storage precedence",
  async (t) => {
    const value = await fixture();
    t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
    const launch = NodePath.join(value.root, "launch");
    const environment = NodePath.join(value.root, "environment");
    const settings = NodePath.join(value.root, "settings-session-dir");
    await Promise.all([launch, environment, settings].map((directory) => NodeFSP.mkdir(directory)));
    await Promise.all([
      writeSession({ directory: launch, fileName: "launch.jsonl", cwd: value.workspace }),
      writeSession({ directory: environment, fileName: "environment.jsonl", cwd: value.workspace }),
      writeSession({ directory: settings, fileName: "settings.jsonl", cwd: value.workspace }),
    ]);
    await NodeFSP.writeFile(
      NodePath.join(value.agentDir, "settings.json"),
      JSON.stringify({ sessionDir: settings }),
    );
    const scan = (overrides: Record<string, unknown>) =>
      scanPiSessionCatalog(request(value, overrides), { signal: new AbortController().signal });
    NodeAssert.equal(
      (
        await scan({
          launchArgs: ["--session-dir", launch, "--", "--session-dir", environment],
          environmentSessionDir: environment,
        })
      ).entries[0]!.nativeSessionId,
      "launch",
    );
    NodeAssert.equal(
      (await scan({ environmentSessionDir: environment })).entries[0]!.nativeSessionId,
      "environment",
    );
    NodeAssert.equal((await scan({})).entries[0]!.nativeSessionId, "settings");
  },
);

NodeTest.test("custom storage filters moved and missing cwd values", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const otherWorkspace = NodePath.join(value.root, "other-workspace");
  const custom = NodePath.join(value.root, "shared-sessions");
  await Promise.all([NodeFSP.mkdir(otherWorkspace), NodeFSP.mkdir(custom)]);
  await Promise.all([
    writeSession({ directory: custom, fileName: "selected.jsonl", cwd: value.workspace }),
    writeSession({ directory: custom, fileName: "other.jsonl", cwd: otherWorkspace }),
    writeSession({
      directory: custom,
      fileName: "missing.jsonl",
      cwd: NodePath.join(value.root, "missing-workspace"),
    }),
  ]);
  const result = await scanPiSessionCatalog(
    request(value, { launchArgs: ["--session-dir", custom] }),
    { signal: new AbortController().signal },
  );
  NodeAssert.deepEqual(
    result.entries.map((entry) => entry.nativeSessionId),
    ["selected"],
  );
});

NodeTest.test(
  "emits explicit truncated metadata for oversized files and malformed version metadata",
  async (t) => {
    const value = await fixture();
    t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
    await writeSession({
      directory: value.directory,
      fileName: "large.jsonl",
      cwd: value.workspace,
      suffix: "x".repeat(1024 * 1024 + 1),
    });
    await writeSession({
      directory: value.directory,
      fileName: "version.jsonl",
      cwd: value.workspace,
      version: -1,
    });
    await writeSession({
      directory: value.directory,
      fileName: "records.jsonl",
      cwd: value.workspace,
      suffix: Array.from({ length: 4_097 }, () => '{"type":"message"}').join("\n"),
    });
    const result = await scanPiSessionCatalog(request(value), {
      signal: new AbortController().signal,
    });
    const large = result.entries.find((entry) => entry.nativeSessionId === "large")!;
    const malformed = result.entries.find((entry) => entry.nativeSessionId === "version")!;
    const records = result.entries.find((entry) => entry.nativeSessionId === "records")!;
    NodeAssert.equal(large.compatibility, "truncated");
    NodeAssert.equal(large.fidelity, "metadata-truncated");
    NodeAssert.equal(large.entryCountExact, false);
    NodeAssert.equal(malformed.compatibility, "malformed");
    NodeAssert.equal(malformed.formatVersion, "unknown");
    NodeAssert.equal(records.compatibility, "truncated");
    NodeAssert.equal(records.entryCount, 4_096);
    NodeAssert.equal(records.entryCountExact, false);
  },
);

NodeTest.test("rejects a file replaced between lstat and descriptor open", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const file = await writeSession({
    directory: value.directory,
    fileName: "raced.jsonl",
    cwd: value.workspace,
  });
  const outside = await writeSession({
    directory: value.root,
    fileName: "replacement.jsonl",
    cwd: value.workspace,
  });
  await NodeAssert.rejects(() =>
    scanPiSessionCatalog(request(value), {
      signal: new AbortController().signal,
      beforeOpen: async () => {
        await NodeFSP.unlink(file);
        await NodeFSP.symlink(outside, file);
      },
    }),
  );
});

NodeTest.test("honors cancellation and rejects symlink entries", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const outside = await writeSession({
    directory: value.root,
    fileName: "outside.jsonl",
    cwd: value.workspace,
  });
  await NodeFSP.symlink(outside, NodePath.join(value.directory, "linked.jsonl"));
  const result = await scanPiSessionCatalog(request(value), {
    signal: new AbortController().signal,
  });
  NodeAssert.equal(result.entries.length, 0);
  const controller = new AbortController();
  controller.abort();
  await NodeAssert.rejects(() =>
    scanPiSessionCatalog(request(value), { signal: controller.signal }),
  );
});

NodeTest.test("rejects the documented convention for an unverified Pi version", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  await NodeFSP.writeFile(
    NodePath.join(value.packageRoot, "package.json"),
    JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.85.0" }),
  );
  await NodeAssert.rejects(() =>
    scanPiSessionCatalog(request(value), { signal: new AbortController().signal }),
  );
});

NodeTest.test("reports a distinct hard cap only after the explicit ceiling", async (t) => {
  const value = await fixture();
  t.after(() => NodeFSP.rm(value.root, { recursive: true, force: true }));
  const header = `${JSON.stringify({ type: "session", version: 3, id: "shared", timestamp: "2026-09-03T13:36:00.000Z", cwd: value.workspace })}\n`;
  for (let index = 0; index <= PI_CATALOG_HARD_CEILING; index += 1) {
    await NodeFSP.writeFile(
      NodePath.join(value.directory, `${String(index).padStart(4, "0")}.jsonl`),
      header,
    );
  }
  const result = await scanPiSessionCatalog(request(value), {
    signal: new AbortController().signal,
  });
  NodeAssert.equal(result.entries.length, PI_CATALOG_HARD_CEILING);
  NodeAssert.equal(result.hardCapped, true);
  NodeAssert.equal(result.hardCeiling, PI_CATALOG_HARD_CEILING);
});
