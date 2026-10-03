import { PiSessionCatalogError, ProviderDriverKind, type ThreadId } from "@t3tools/contracts";
import { extractPiHistory, type PiHistoryMessage } from "@t3tools/takomi-pi-host/sessionHistory";
import * as Effect from "effect/Effect";

import { toHistoryImportMessages } from "./PiSessionAttach.ts";
import { expandPiSkillReferences } from "./PiResources.ts";

const PI_DRIVER = ProviderDriverKind.make("pi");

function catalogError(
  reason: PiSessionCatalogError["reason"],
  message: string,
): PiSessionCatalogError {
  return new PiSessionCatalogError({ reason, message });
}

const fail = (reason: PiSessionCatalogError["reason"], message: string) =>
  Effect.fail(catalogError(reason, message));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readResumeSessionFile(cursor: unknown): string | undefined {
  if (!isRecord(cursor)) return undefined;
  if (cursor.schemaVersion !== 1) return undefined;
  const file = cursor.sessionFile;
  return typeof file === "string" && file.length > 0 ? file : undefined;
}

export interface PiSyncThreadSnapshot {
  readonly messages: ReadonlyArray<{
    readonly id: string;
    readonly role: string;
    readonly text: string;
    readonly createdAt: string;
    readonly attachments?: ReadonlyArray<{
      readonly type: string;
      readonly name: string;
      readonly isPastedText?: boolean;
    }>;
  }>;
}

export interface PiSyncDeps {
  /** Null when the thread does not exist. */
  readonly readThread: (
    threadId: ThreadId,
  ) => Effect.Effect<PiSyncThreadSnapshot | null, PiSessionCatalogError>;
  /** Null when the thread is not bound to a Pi session file. */
  readonly readSessionFile: (
    threadId: ThreadId,
  ) => Effect.Effect<string | null, PiSessionCatalogError>;
  readonly appendHistory: (
    threadId: ThreadId,
    messages: ReturnType<typeof toHistoryImportMessages>,
  ) => Effect.Effect<void, PiSessionCatalogError>;
}

export interface PiSyncCheckResult {
  readonly available: boolean;
  readonly newMessages: number;
  readonly updateKey?: string;
}

/**
 * Messages in the file the thread has not shown yet, by role + text.
 * Timestamps are deliberately ignored: a continued thread shares its session
 * file with the CLI, so a message sent from T3 lands in the file with the
 * file's own timestamp while the thread holds the same text with T3's
 * timestamp. Matching the full triple would mistake that echo for a new CLI
 * message (banner after your own send) and re-import it on sync (visible
 * duplicates). Counting duplicates preserves genuine repeats: two identical
 * file texts still need two visible copies to count as seen.
 *
 * Text is whitespace-normalized and user echoes also match by containment:
 * the CLI can reformat an outgoing T3 prompt (line breaks, wrappers) before
 * appending it to the session file, so the file copy is longer/shorter but
 * still contains the thread's text. Containment needs a 32-char minimum on
 * the shorter side so short repeats ("hehe") still count exactly.
 */
function normalizePiText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const PI_ECHO_CONTAINMENT_MIN_LENGTH = 32;

type VisiblePiMessage = Omit<PiSyncThreadSnapshot["messages"][number], "id">;

function stripPiAttachmentContext(
  text: string,
  attachments: VisiblePiMessage["attachments"],
): string {
  if (!attachments?.length) return text;
  let remaining = text;
  for (const attachment of attachments.toReversed()) {
    if (!remaining.endsWith("]")) return text;
    const prefix = attachment.isPastedText
      ? `[Pasted text "${attachment.name}" is saved at: `
      : `[Attached ${attachment.type} "${attachment.name}" is saved at: `;
    const start = remaining.lastIndexOf(prefix);
    if (start < 0 || (start > 0 && remaining[start - 1] !== " ")) return text;
    const path = remaining.slice(start + prefix.length, -1);
    if (path.trim().length === 0) return text;
    remaining = remaining.slice(0, start).trimEnd();
  }
  return remaining;
}

function matchesPiUserEcho(visible: VisiblePiMessage, extracted: PiHistoryMessage): boolean {
  const text = normalizePiText(visible.text);
  const echo = stripPiAttachmentContext(normalizePiText(extracted.text), visible.attachments);
  if (text === echo) return true;
  let expanded = text;
  if (visible.text.includes("$") && echo.includes("/skill:")) {
    const skillNames = new Set(
      [...echo.matchAll(/(?:^|\s)\/skill:([^\s]+)/g)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      ),
    );
    expanded = normalizePiText(expandPiSkillReferences(visible.text, skillNames));
    if (expanded === echo) return true;
  }
  return (
    Math.min(expanded.length, echo.length) >= PI_ECHO_CONTAINMENT_MIN_LENGTH &&
    (expanded.includes(echo) || echo.includes(expanded))
  );
}

export function selectUnseenPiMessages(
  visible: ReadonlyArray<VisiblePiMessage>,
  extracted: ReadonlyArray<PiHistoryMessage>,
): ReadonlyArray<PiHistoryMessage> {
  const seen = new Map<string, number>();
  const visibleUserMessages: Array<VisiblePiMessage> = [];
  for (const message of visible) {
    const key = `${message.role}\n${normalizePiText(message.text)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (message.role === "user") visibleUserMessages.push(message);
  }
  const remaining: Array<PiHistoryMessage> = [];
  const userLeftovers: Array<PiHistoryMessage> = [];
  for (const message of extracted) {
    const key = `${message.role}\n${normalizePiText(message.text)}`;
    const count = seen.get(key) ?? 0;
    if (count > 0) {
      seen.set(key, count - 1);
      if (message.role === "user") {
        const index = visibleUserMessages.findIndex(
          (candidate) => normalizePiText(candidate.text) === normalizePiText(message.text),
        );
        if (index !== -1) visibleUserMessages.splice(index, 1);
      }
      continue;
    }
    if (message.role === "user") {
      userLeftovers.push(message);
    } else {
      remaining.push(message);
    }
  }
  for (const message of userLeftovers) {
    const index = visibleUserMessages.findIndex((candidate) =>
      matchesPiUserEcho(candidate, message),
    );
    if (index === -1) {
      remaining.push(message);
    } else {
      visibleUserMessages.splice(index, 1);
    }
  }
  return extracted.filter((message) => remaining.includes(message));
}

function lastImportedPiRecordIndex(
  threadId: ThreadId,
  snapshot: PiSyncThreadSnapshot,
): number | undefined {
  const prefix = `import:pi:${threadId}:r`;
  let latest: number | undefined;
  for (const message of snapshot.messages) {
    if (!message.id.startsWith(prefix)) continue;
    const recordIndex = Number(message.id.slice(prefix.length));
    if (Number.isSafeInteger(recordIndex) && recordIndex >= 0) {
      latest = latest === undefined ? recordIndex : Math.max(latest, recordIndex);
    }
  }
  return latest;
}

/** Best-effort update check for polling: never fails, just reports unavailable. */
export const checkPiSessionUpdates = Effect.fn("PiSessionSync.checkPiSessionUpdates")(function* (
  threadId: ThreadId,
  deps: PiSyncDeps,
): Effect.fn.Return<PiSyncCheckResult, never, never> {
  const check = Effect.gen(function* () {
    const [snapshot, sessionFile] = yield* Effect.all([
      deps.readThread(threadId),
      deps.readSessionFile(threadId),
    ]);
    if (snapshot === null || sessionFile === null) {
      return { available: false, newMessages: 0 } as const;
    }
    const afterRecordIndex = lastImportedPiRecordIndex(threadId, snapshot);
    const extraction = yield* Effect.scoped(
      Effect.gen(function* () {
        const signal = yield* Effect.abortSignal;
        return yield* Effect.tryPromise({
          try: () =>
            extractPiHistory(
              { file: sessionFile },
              {
                signal,
                ...(afterRecordIndex === undefined ? {} : { afterRecordIndex }),
              },
            ),
          catch: () => catalogError("unavailable", "Checking the Pi session file failed."),
        });
      }),
    );
    const unseen = selectUnseenPiMessages(snapshot.messages, extraction.messages);
    if (unseen.length === 0) return { available: false, newMessages: 0 } as const;
    const last = unseen[unseen.length - 1]!;
    return {
      available: true,
      newMessages: unseen.length,
      updateKey: `${unseen.length}:${last.recordIndex}:${last.createdAt}`,
    } as const;
  });
  return yield* check.pipe(
    Effect.catch(() => Effect.succeed({ available: false, newMessages: 0 } as const)),
  );
});

export interface PiSyncSyncResult {
  readonly added: number;
}

/** Explicit sync: strict errors, because the user asked for it. */
export const syncPiSessionUpdates = Effect.fn("PiSessionSync.syncPiSessionUpdates")(function* (
  threadId: ThreadId,
  deps: PiSyncDeps,
): Effect.fn.Return<PiSyncSyncResult, PiSessionCatalogError, never> {
  const [snapshot, sessionFile] = yield* Effect.all([
    deps.readThread(threadId),
    deps.readSessionFile(threadId),
  ]);
  if (snapshot === null) {
    return yield* fail("unavailable", "The thread is unavailable.");
  }
  if (sessionFile === null) {
    return yield* fail("unavailable", "This thread is not continuing a CLI session.");
  }
  const afterRecordIndex = lastImportedPiRecordIndex(threadId, snapshot);
  const extraction = yield* Effect.scoped(
    Effect.gen(function* () {
      const signal = yield* Effect.abortSignal;
      return yield* Effect.tryPromise({
        try: () =>
          extractPiHistory(
            { file: sessionFile },
            {
              signal,
              ...(afterRecordIndex === undefined ? {} : { afterRecordIndex }),
            },
          ),
        catch: () => catalogError("invalid_cursor", "The Pi session file is no longer available."),
      });
    }),
  );
  const unseen = selectUnseenPiMessages(snapshot.messages, extraction.messages);
  if (unseen.length === 0) return { added: 0 };
  yield* deps.appendHistory(threadId, toHistoryImportMessages(threadId, unseen));
  return { added: unseen.length };
});

export { readResumeSessionFile };

/**
 * The bound Pi session file for a thread, or null when the thread is not
 * continuing a CLI session. Pure over the directory binding so handlers and
 * tests share it.
 */
export function piSessionFileFromBinding(
  binding:
    | {
        readonly provider?: unknown;
        readonly resumeCursor?: unknown;
      }
    | null
    | undefined,
): string | null {
  if (binding === null || binding === undefined) return null;
  if (binding.provider !== PI_DRIVER) return null;
  return readResumeSessionFile(binding.resumeCursor) ?? null;
}

export function hasActivePiSessionFile(
  bindings: ReadonlyArray<{
    readonly threadId: ThreadId;
    readonly provider?: unknown;
    readonly status?: string;
    readonly resumeCursor?: unknown;
  }>,
  threadId: ThreadId,
  sessionFile: string,
): boolean {
  const normalized = sessionFile.replaceAll("\\", "/");
  const key = /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
  return bindings.some((binding) => {
    const boundFile = piSessionFileFromBinding(binding);
    if (boundFile === null) return false;
    const normalizedBoundFile = boundFile.replaceAll("\\", "/");
    const boundKey = /^[A-Za-z]:\//.test(normalizedBoundFile)
      ? normalizedBoundFile.toLowerCase()
      : normalizedBoundFile;
    return binding.threadId !== threadId && binding.status !== "stopped" && boundKey === key;
  });
}
