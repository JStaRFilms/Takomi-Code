// @effect-diagnostics nodeBuiltinImport:off - this suite seeds real Pi session files.
import { ProviderDriverKind, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  checkPiSessionUpdates,
  hasActivePiSessionFile,
  piSessionFileFromBinding,
  selectUnseenPiMessages,
  syncPiSessionUpdates,
  type PiSyncDeps,
} from "./PiSessionSync.ts";

const threadId = ThreadId.make("thread-sync");
const PI = ProviderDriverKind.make("pi");

function message(role: "user" | "assistant", text: string, recordIndex: number) {
  return { role, text, createdAt: "2026-09-13T19:00:01.000Z", recordIndex };
}

describe("selectUnseenPiMessages", () => {
  it("returns only content the thread has not shown, idempotent on retry", () => {
    const extracted = [
      message("user", "first", 0),
      message("assistant", "second", 1),
      message("user", "third", 2),
    ] as const;
    const visible = [
      {
        id: "import:pi:thread-sync:r0",
        role: "user",
        text: "first",
        createdAt: "2026-09-13T19:00:01.000Z",
      },
      {
        id: "live-turn-1",
        role: "user",
        text: "live question",
        createdAt: "2026-09-13T19:05:01.000Z",
      },
    ];
    const unseen = selectUnseenPiMessages(visible, [...extracted]);
    expect(unseen.map((entry) => entry.text)).toEqual(["second", "third"]);
    // Retrying after those land yields nothing new.
    const visibleAfter = [
      ...visible,
      {
        id: "import:pi:thread-sync:r1",
        role: "assistant",
        text: "second",
        createdAt: "2026-09-13T19:00:01.000Z",
      },
      {
        id: "import:pi:thread-sync:r2",
        role: "user",
        text: "third",
        createdAt: "2026-09-13T19:00:01.000Z",
      },
    ];
    expect(selectUnseenPiMessages(visibleAfter, [...extracted])).toEqual([]);
  });

  it("counts duplicate messages instead of dropping every matching copy", () => {
    const extracted = [message("user", "same", 0), message("user", "same", 1)];
    const visible = [
      {
        id: "import:pi:thread-sync:r0",
        role: "user",
        text: "same",
        createdAt: "2026-09-13T19:00:01.000Z",
      },
    ];
    expect(selectUnseenPiMessages(visible, extracted).map((entry) => entry.recordIndex)).toEqual([
      1,
    ]);
  });

  it("treats T3-sent turns echoed into the shared session file as seen", () => {
    const extracted = [
      { ...message("user", "wink", 2), createdAt: "2026-09-13T19:06:02.000Z" },
      { ...message("assistant", "wink right back.", 3), createdAt: "2026-09-13T19:06:03.000Z" },
    ];
    const visible = [
      {
        id: "import:pi:thread-sync:r0",
        role: "user",
        text: "first",
        createdAt: "2026-09-13T19:00:01.000Z",
      },
      {
        id: "live-turn-1",
        role: "user",
        text: "wink",
        createdAt: "2026-09-13T19:06:00.000Z",
      },
      {
        id: "live-turn-2",
        role: "assistant",
        text: "wink right back.",
        createdAt: "2026-09-13T19:06:01.000Z",
      },
    ];
    expect(selectUnseenPiMessages(visible, [...extracted])).toEqual([]);
  });
});

describe("piSessionFileFromBinding", () => {
  it("accepts only Pi bindings with a session-file cursor", () => {
    expect(
      piSessionFileFromBinding({
        provider: PI,
        resumeCursor: { schemaVersion: 1, sessionFile: "/sessions/a.jsonl" },
      }),
    ).toBe("/sessions/a.jsonl");
    expect(piSessionFileFromBinding(null)).toBeNull();
    expect(
      piSessionFileFromBinding({ provider: ProviderDriverKind.make("codex"), resumeCursor: {} }),
    ).toBeNull();
    expect(piSessionFileFromBinding({ provider: PI, resumeCursor: { threadId: "x" } })).toBeNull();
  });

  it("finds another active thread holding the same Pi session file", () => {
    const bindings = [
      {
        threadId: ThreadId.make("other-thread"),
        provider: PI,
        status: "ready" as const,
        resumeCursor: { schemaVersion: 1, sessionFile: "/sessions/a.jsonl" },
      },
      {
        threadId: ThreadId.make("stopped-thread"),
        provider: PI,
        status: "stopped" as const,
        resumeCursor: { schemaVersion: 1, sessionFile: "/sessions/b.jsonl" },
      },
    ];
    expect(hasActivePiSessionFile(bindings, threadId, "/sessions/a.jsonl")).toBe(true);
    expect(hasActivePiSessionFile(bindings, threadId, "/sessions/b.jsonl")).toBe(false);
    expect(
      hasActivePiSessionFile(bindings, ThreadId.make("other-thread"), "/sessions/a.jsonl"),
    ).toBe(false);
    expect(
      hasActivePiSessionFile(
        [
          {
            threadId: ThreadId.make("windows-thread"),
            provider: PI,
            status: "running",
            resumeCursor: {
              schemaVersion: 1,
              sessionFile: "C:\\Sessions\\A.jsonl",
            },
          },
        ],
        threadId,
        "c:\\sessions\\a.jsonl",
      ),
    ).toBe(true);
  });
});

describe("check and sync with stub deps", () => {
  const depsFor = (overrides: Partial<PiSyncDeps> = {}): PiSyncDeps => ({
    readThread: () =>
      Effect.succeed({
        messages: [
          {
            id: "import:pi:thread-sync:r0",
            role: "user",
            text: "first",
            createdAt: "2026-09-13T19:00:01.000Z",
          },
        ],
      }),
    readSessionFile: () => Effect.succeed("/sessions/a.jsonl"),
    appendHistory: () => Effect.void,
    ...overrides,
  });

  it.effect("check never fails and reports newcomers", () =>
    Effect.gen(function* () {
      // Stub extraction by pointing at a real temp file through readSessionFile.
      const root = yield* Effect.tryPromise(() =>
        NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "takomi-sync-")),
      );
      yield* Effect.gen(function* () {
        const file = NodePath.join(root, "session.jsonl");
        yield* Effect.tryPromise(() =>
          NodeFSP.writeFile(
            file,
            [
              {
                type: "session",
                version: 3,
                id: "sync-source",
                timestamp: "2026-09-13T19:00:00.000Z",
                cwd: root,
              },
              {
                type: "message",
                id: "m1",
                parentId: null,
                timestamp: "2026-09-13T19:00:01.000Z",
                message: { role: "user", content: "first" },
              },
              {
                type: "message",
                id: "m2",
                parentId: "m1",
                timestamp: "2026-09-13T19:00:02.000Z",
                message: { role: "assistant", content: [{ type: "text", text: "second" }] },
              },
            ]
              .map((entry) => `${JSON.stringify(entry)}\n`)
              .join(""),
          ),
        );
        const deps = depsFor({ readSessionFile: () => Effect.succeed(file) });
        const checked = yield* checkPiSessionUpdates(threadId, deps);
        expect(checked.available).toBe(true);
        expect(checked.newMessages).toBe(1);
        expect(checked.updateKey).toContain("1:");
        const synced = yield* syncPiSessionUpdates(threadId, deps);
        expect(synced.added).toBe(1);
      }).pipe(
        Effect.ensuring(
          Effect.tryPromise(() => NodeFSP.rm(root, { recursive: true, force: true })).pipe(
            Effect.ignore,
          ),
        ),
      );
    }),
  );

  it.effect("syncs messages after the first bounded hydration page", () =>
    Effect.gen(function* () {
      const root = yield* Effect.tryPromise(() =>
        NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "takomi-sync-page-")),
      );
      yield* Effect.gen(function* () {
        const file = NodePath.join(root, "session.jsonl");
        const entries: Array<Record<string, unknown>> = [
          {
            type: "session",
            version: 3,
            id: "sync-source",
            timestamp: "2026-09-13T19:00:00.000Z",
            cwd: root,
          },
        ];
        for (let index = 0; index < 1_002; index += 1) {
          entries.push({
            type: "message",
            id: `m${index}`,
            parentId: index === 0 ? null : `m${index - 1}`,
            timestamp: "2026-09-13T19:00:01.000Z",
            message: { role: "user", content: `message ${index}` },
          });
        }
        yield* Effect.tryPromise(() =>
          NodeFSP.writeFile(file, entries.map((entry) => `${JSON.stringify(entry)}\n`).join("")),
        );
        const appendedIds: Array<string> = [];
        const deps = depsFor({
          readThread: () =>
            Effect.succeed({
              messages: Array.from({ length: 1_000 }, (_, index) => ({
                id: `import:pi:thread-sync:r${index}`,
                role: "user",
                text: `message ${index}`,
                createdAt: "2026-09-13T19:00:01.000Z",
              })),
            }),
          readSessionFile: () => Effect.succeed(file),
          appendHistory: (_threadId, messages) =>
            Effect.sync(() => {
              appendedIds.push(...messages.map((entry) => entry.messageId));
            }),
        });
        const checked = yield* checkPiSessionUpdates(threadId, deps);
        expect(checked.newMessages).toBe(2);
        const synced = yield* syncPiSessionUpdates(threadId, deps);
        expect(synced.added).toBe(2);
        expect(appendedIds).toEqual(["import:pi:thread-sync:r1000", "import:pi:thread-sync:r1001"]);
      }).pipe(
        Effect.ensuring(
          Effect.tryPromise(() => NodeFSP.rm(root, { recursive: true, force: true })).pipe(
            Effect.ignore,
          ),
        ),
      );
    }),
  );

  it.effect("check reports unavailable for non-Pi threads and missing files", () =>
    Effect.gen(function* () {
      const noBinding = yield* checkPiSessionUpdates(
        threadId,
        depsFor({ readSessionFile: () => Effect.succeed(null) }),
      );
      expect(noBinding).toEqual({ available: false, newMessages: 0 });
      const gone = yield* checkPiSessionUpdates(
        threadId,
        depsFor({ readSessionFile: () => Effect.succeed("/sessions/missing.jsonl") }),
      );
      expect(gone).toEqual({ available: false, newMessages: 0 });
    }),
  );

  it.effect("sync is strict about missing threads and sessions", () =>
    Effect.gen(function* () {
      const noThread = yield* syncPiSessionUpdates(
        threadId,
        depsFor({
          readThread: () => Effect.succeed(null),
        }),
      ).pipe(
        Effect.flip,
        Effect.map((error) => error.reason),
      );
      expect(noThread).toBe("unavailable");
      const noSession = yield* syncPiSessionUpdates(
        threadId,
        depsFor({ readSessionFile: () => Effect.succeed(null) }),
      ).pipe(
        Effect.flip,
        Effect.map((error) => error.reason),
      );
      expect(noSession).toBe("unavailable");
    }),
  );
});
