import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { PiSessionLifecycle, type PiLifecycleBinding } from "../PiSessionLifecycle.ts";
import {
  continuePiSessionInThread,
  previewPiSessionMessages,
  toHistoryImportMessages,
  type PiSessionContinueRequestContext,
} from "./PiSessionAttach.ts";

const scopeBinding = (workspace: string): PiLifecycleBinding => ({
  environmentId: "environment-a",
  providerInstanceId: ProviderInstanceId.make("pi"),
  projectId: ProjectId.make("project-a"),
  workspaceCanonicalPath: workspace,
  serverGeneration: "server-a:connection-a",
  expiresAt: Date.now() + 60_000,
});

interface Fixture {
  readonly root: string;
  readonly workspace: string;
  readonly directory: string;
  readonly sourceFile: string;
  readonly identity: { device: string; inode: string; size: number; modifiedMs: number };
}

async function makeFixture(): Promise<Fixture> {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "takomi-attach-"));
  const workspaceDir = NodePath.join(root, "workspace");
  const directory = NodePath.join(root, "sessions");
  await NodeFSP.mkdir(workspaceDir, { recursive: true });
  await NodeFSP.mkdir(directory, { recursive: true });
  const workspace = await NodeFSP.realpath(workspaceDir);
  const sourceFile = NodePath.join(directory, "2026-09-04T23-11-42-233Z_source.jsonl");
  await NodeFSP.writeFile(
    sourceFile,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id: "source-session",
      timestamp: "2026-09-04T23:11:42.233Z",
      cwd: workspace,
    })}\n${JSON.stringify({ type: "message", id: "m1", parentId: null })}\n`,
  );
  const stat = await NodeFSP.stat(sourceFile);
  return {
    root,
    workspace,
    directory,
    sourceFile,
    identity: {
      device: String(stat.dev),
      inode: String(stat.ino),
      size: stat.size,
      modifiedMs: stat.mtimeMs,
    },
  };
}

function withFixture<A, E, R>(
  run: (value: Fixture) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const acquire: Effect.Effect<Fixture, never, never> = Effect.tryPromise(() => makeFixture()).pipe(
    Effect.orDie,
  );
  return acquire.pipe(
    Effect.flatMap((value) =>
      run(value).pipe(
        Effect.ensuring(
          Effect.tryPromise(() => NodeFSP.rm(value.root, { recursive: true, force: true })).pipe(
            Effect.ignore,
          ),
        ),
      ),
    ),
  );
}

function scan(value: Fixture) {
  return {
    entries: [
      {
        nativeSessionId: "source-session",
        nativeFile: value.sourceFile,
        fileIdentity: value.identity,
        name: "CLI session",
        createdAt: "2026-09-04T23:11:42.233Z",
        modifiedAt: "2026-09-04T23:11:42.233Z",
        entryCount: 1,
        entryCountExact: true,
        parentSession: false,
        formatVersion: 3 as const,
        compatibility: "compatible" as const,
        fidelity: "metadata-only" as const,
        activity: "unobservable" as const,
        ownership: "external-source" as const,
      },
    ],
    hardCapped: false,
    hardCeiling: 2_000 as const,
    source: "pi-documented-session-storage" as const,
  };
}

function context(
  value: Fixture,
  lifecycle: PiSessionLifecycle,
  scope: PiLifecycleBinding,
  handle: string,
  overrides: Partial<PiSessionContinueRequestContext> = {},
): PiSessionContinueRequestContext {
  return {
    handle,
    threadId: ThreadId.make("thread-attach"),
    mode: "attach",
    serverSettings: DEFAULT_SERVER_SETTINGS,
    providerInstanceId: ProviderInstanceId.make("pi"),
    projectId: ProjectId.make("project-a"),
    threadProjectId: ProjectId.make("project-a"),
    threadHasSession: false,
    threadHasTurns: false,
    hasPersistedBinding: false,
    workspaceCanonicalPath: value.workspace,
    environmentId: scope.environmentId,
    serverGeneration: scope.serverGeneration,
    expiresAt: scope.expiresAt,
    lifecycle,
    ...overrides,
  };
}

const withLiveHandle = <A, E, R>(
  run: (input: {
    readonly value: Fixture;
    readonly lifecycle: PiSessionLifecycle;
    readonly scope: PiLifecycleBinding;
    readonly handle: string;
  }) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  withFixture((value) => {
    const scope = scopeBinding(value.workspace);
    const lifecycle = new PiSessionLifecycle();
    const page = lifecycle.createCatalogPage(scan(value), scope, 10, Date.now());
    return run({ value, lifecycle, scope, handle: page.entries[0]!.id });
  });

describe("Pi session attach/fork continuation", () => {
  it.effect("attaches the live CLI session file to a fresh thread", () =>
    withLiveHandle(({ value, lifecycle, scope, handle }) =>
      Effect.gen(function* () {
        const resolution = yield* continuePiSessionInThread(
          context(value, lifecycle, scope, handle),
        );
        expect(resolution.sessionFile).toBe(value.sourceFile);
        expect(resolution.display.name).toBe("CLI session");
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("tolerates CLI-appended records after listing (the refetch case)", () =>
    withLiveHandle(({ value, lifecycle, scope, handle }) =>
      Effect.gen(function* () {
        yield* Effect.tryPromise(() =>
          NodeFSP.appendFile(
            value.sourceFile,
            `${JSON.stringify({ type: "message", id: "m2", parentId: "m1" })}\n`,
          ),
        );
        const resolution = yield* continuePiSessionInThread(
          context(value, lifecycle, scope, handle),
        );
        expect(resolution.sessionFile).toBe(value.sourceFile);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("forks into a child file that points at the source as parent", () =>
    withLiveHandle(({ value, lifecycle, scope, handle }) =>
      Effect.gen(function* () {
        const before = yield* Effect.tryPromise(() => NodeFSP.readFile(value.sourceFile, "utf8"));
        const resolution = yield* continuePiSessionInThread(
          context(value, lifecycle, scope, handle, { mode: "fork" }),
        );
        expect(resolution.sessionFile).not.toBe(value.sourceFile);
        expect(NodePath.dirname(resolution.sessionFile)).toBe(value.directory);
        const lines = (yield* Effect.tryPromise(() =>
          NodeFSP.readFile(resolution.sessionFile, "utf8"),
        ))
          .split("\n")
          .filter((line) => line !== "");
        expect(lines).toHaveLength(2);
        const header = JSON.parse(lines[0]!);
        expect(header.parentSession).toBe(value.sourceFile);
        expect(header.id).not.toBe("source-session");
        expect(yield* Effect.tryPromise(() => NodeFSP.readFile(value.sourceFile, "utf8"))).toBe(
          before,
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects project mismatch, busy threads, stale handles, and replaced files", () =>
    withLiveHandle(({ value, lifecycle, scope, handle }) =>
      Effect.gen(function* () {
        const reason = (input: PiSessionContinueRequestContext) =>
          continuePiSessionInThread(input).pipe(
            Effect.flip,
            Effect.map((error) => error.reason),
          );
        expect(
          yield* reason(
            context(value, lifecycle, scope, handle, {
              threadProjectId: ProjectId.make("project-b"),
            }),
          ),
        ).toBe("security_rejected");
        expect(
          yield* reason(context(value, lifecycle, scope, handle, { threadHasTurns: true })),
        ).toBe("unavailable");
        expect(
          yield* reason(context(value, lifecycle, scope, handle, { threadHasSession: true })),
        ).toBe("unavailable");
        expect(
          yield* reason(context(value, lifecycle, scope, handle, { hasPersistedBinding: true })),
        ).toBe("unavailable");
        expect(yield* reason(context(value, lifecycle, scope, "tampered-handle"))).toBe(
          "invalid_cursor",
        );
        yield* Effect.tryPromise(() => NodeFSP.rm(value.sourceFile));
        yield* Effect.tryPromise(() =>
          NodeFSP.writeFile(
            value.sourceFile,
            `${JSON.stringify({
              type: "session",
              version: 3,
              id: "replacement-session",
              timestamp: "2026-09-05T00:00:00.000Z",
              cwd: value.workspace,
            })}\n`,
          ),
        );
        expect(yield* reason(context(value, lifecycle, scope, handle))).toBe("invalid_cursor");
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
describe("toHistoryImportMessages", () => {
  it("maps CLI history to reserved-namespace import messages in order", () => {
    const threadId = ThreadId.make("thread-hydration");
    expect(
      toHistoryImportMessages(threadId, [
        { role: "user", text: "first", createdAt: "2026-09-13T19:00:01.000Z", recordIndex: 0 },
        {
          role: "assistant",
          text: "second",
          createdAt: "2026-09-13T19:00:02.000Z",
          recordIndex: 1,
        },
      ]),
    ).toEqual([
      {
        messageId: "import:pi:thread-hydration:r0",
        role: "user",
        text: "first",
        createdAt: "2026-09-13T19:00:01.000Z",
      },
      {
        messageId: "import:pi:thread-hydration:r1",
        role: "assistant",
        text: "second",
        createdAt: "2026-09-13T19:00:02.000Z",
      },
    ]);
  });
});

describe("Pi point-split forks and message preview", () => {
  it.effect("cuts the fork at maxRecords", () =>
    withLiveHandle(({ value, lifecycle, scope, handle }) =>
      Effect.gen(function* () {
        const resolution = yield* continuePiSessionInThread(
          context(value, lifecycle, scope, handle, { mode: "fork", maxRecords: 1 }),
        );
        expect(resolution.sessionFile).not.toBe(value.sourceFile);
        const lines = (yield* Effect.tryPromise(() =>
          NodeFSP.readFile(resolution.sessionFile, "utf8"),
        ))
          .split("\n")
          .filter((line) => line !== "");
        // Header plus the single source record.
        expect(lines).toHaveLength(2);
        expect(JSON.parse(lines[0]!).parentSession).toBe(value.sourceFile);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a record limit on attach", () =>
    withLiveHandle(({ value, lifecycle, scope, handle }) =>
      Effect.gen(function* () {
        const reason = yield* continuePiSessionInThread(
          context(value, lifecycle, scope, handle, { mode: "attach", maxRecords: 1 }),
        ).pipe(
          Effect.flip,
          Effect.map((error) => error.reason),
        );
        expect(reason).toBe("unavailable");
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("previews messages with record positions for point picking", () =>
    withLiveHandle(({ value, lifecycle, scope, handle }) =>
      Effect.gen(function* () {
        yield* Effect.tryPromise(() =>
          NodeFSP.appendFile(
            value.sourceFile,
            [
              {
                type: "message",
                id: "u1",
                parentId: null,
                timestamp: "2026-09-13T19:00:01.000Z",
                message: { role: "user", content: "preview me" },
              },
              {
                type: "message",
                id: "a1",
                parentId: "u1",
                timestamp: "2026-09-13T19:00:02.000Z",
                message: { role: "assistant", content: [{ type: "text", text: "preview answer" }] },
              },
            ]
              .map((entry) => `${JSON.stringify(entry)}\n`)
              .join(""),
          ),
        );
        const preview = yield* previewPiSessionMessages({
          handle,
          serverSettings: DEFAULT_SERVER_SETTINGS,
          providerInstanceId: ProviderInstanceId.make("pi"),
          projectId: ProjectId.make("project-a"),
          workspaceCanonicalPath: value.workspace,
          environmentId: scope.environmentId,
          serverGeneration: scope.serverGeneration,
          expiresAt: scope.expiresAt,
          lifecycle,
          limit: 100,
        });
        expect(preview.truncated).toBe(false);
        expect(preview.messages).toEqual([
          {
            recordIndex: 1,
            role: "user",
            text: "preview me",
            createdAt: "2026-09-13T19:00:01.000Z",
          },
          {
            recordIndex: 2,
            role: "assistant",
            text: "preview answer",
            createdAt: "2026-09-13T19:00:02.000Z",
          },
        ]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
