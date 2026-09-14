// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Bounded Pi history extraction for T3 hydration.
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

/** Hard bounds: hydration shows conversation, never the whole disk. */
export const PI_HISTORY_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
export const PI_HISTORY_MAX_MESSAGES = 1_000;
export const PI_HISTORY_MAX_TEXT_BYTES = 32 * 1024;
const MAX_PATH_BYTES = 32_768;

export interface PiHistoryMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
  /**
   * Position among the file's non-header lines (0-based). A fork with
   * maxRecords === recordIndex + 1 keeps everything through this message,
   * which is always a valid prefix because Pi appends children after parents.
   */
  readonly recordIndex: number;
}

export interface PiHistoryExtraction {
  readonly messages: ReadonlyArray<PiHistoryMessage>;
  /** True when the file held more conversation than the bounds carry. */
  readonly truncated: boolean;
}

interface IndexedRecord {
  readonly value: Record<string, unknown>;
  readonly recordIndex: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isoTimestamp(value: unknown): string | undefined {
  const timestamp = readString(value);
  return timestamp !== undefined &&
    Buffer.byteLength(timestamp) <= 64 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(timestamp)
    ? timestamp
    : undefined;
}

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error("Pi history extraction aborted.");
}

function activeBranchRecords(records: ReadonlyArray<IndexedRecord>): ReadonlyArray<IndexedRecord> {
  const entries = records.flatMap((record) => {
    const id = readString(record.value.id);
    const parentId = record.value.parentId;
    return id !== undefined && (typeof parentId === "string" || parentId === null)
      ? [{ ...record, id, parentId }]
      : [];
  });
  if (entries.length === 0 || entries.filter((entry) => entry.parentId === null).length !== 1) {
    return records;
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const branch: Array<(typeof entries)[number]> = [];
  const seen = new Set<string>();
  let current = entries.at(-1);
  while (current !== undefined) {
    if (seen.has(current.id)) return records;
    seen.add(current.id);
    branch.push(current);
    if (current.parentId === null) return branch.toReversed();
    current = byId.get(current.parentId);
  }
  return records;
}

/**
 * Assistant/user text, mirroring the catalog's fallback extraction. String
 * content verbatim; block content joins text blocks. Tool calls, tool
 * results, and extension payloads never become chat text.
 */
function extractEntryText(entry: Record<string, unknown>):
  | {
      readonly role: "user" | "assistant";
      readonly text: string;
    }
  | undefined {
  const message = entry.message;
  if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant")) {
    return undefined;
  }
  const content = message.content;
  if (typeof content === "string") {
    const text = readString(content);
    return text === undefined ? undefined : { role: message.role, text };
  }
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter(isRecord)
    .filter((block) => block.type === "text")
    .map((block) => readString(block.text) ?? "")
    .filter((part) => part.length > 0)
    .join(" ");
  return text.length > 0 ? { role: message.role, text } : undefined;
}

function truncateText(text: string, limit: number = PI_HISTORY_MAX_TEXT_BYTES): string {
  if (Buffer.byteLength(text) <= limit) return text;
  const retained: Array<string> = [];
  const contentLimit = limit - Buffer.byteLength("…");
  let retainedBytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character);
    if (retainedBytes + characterBytes > contentLimit) break;
    retained.push(character);
    retainedBytes += characterBytes;
  }
  return `${retained.join("").trimEnd()}…`;
}

/**
 * Conversation history for `thread.history.import`, in file order. Only
 * user/assistant text qualifies; everything else (tool traffic, compactions,
 * branches, metadata) stays model context without becoming visible history.
 */
export async function extractPiHistory(
  input: { readonly file: string },
  options: {
    readonly signal: AbortSignal;
    readonly maxMessages?: number;
    readonly maxTextBytes?: number;
    /** Only return messages after this original file record position. */
    readonly afterRecordIndex?: number;
    /**
     * "first" stops at the cap (cheap, for hydration); "last" scans the whole
     * file and keeps the tail (for point picking, where recent messages
     * matter). Defaults to "first".
     */
    readonly take?: "first" | "last";
  },
): Promise<PiHistoryExtraction> {
  const { signal } = options;
  abortIfRequested(signal);
  if (input.file.length === 0 || Buffer.byteLength(input.file) > MAX_PATH_BYTES) {
    throw new Error("Invalid Pi history extraction request.");
  }
  const file = NodePath.resolve(input.file);
  let before: NodeFS.Stats;
  try {
    before = await NodeFSP.lstat(file);
  } catch {
    throw new Error("Pi session file is no longer available.");
  }
  if (!before.isFile() || before.isSymbolicLink() || before.ino === 0) {
    throw new Error("Pi session file failed its safety check.");
  }
  if (before.size <= 0 || before.size > PI_HISTORY_MAX_SOURCE_BYTES) {
    throw new Error("Pi session file is outside the readable range.");
  }
  abortIfRequested(signal);
  const realFile = await NodeFSP.realpath(file).catch(() => undefined);
  if (realFile !== file) throw new Error("Pi session file failed its safety check.");
  const noFollow = "O_NOFOLLOW" in NodeFS.constants ? NodeFS.constants.O_NOFOLLOW : 0;
  const handle = await NodeFSP.open(file, NodeFS.constants.O_RDONLY | noFollow).catch(
    () => undefined,
  );
  if (handle === undefined) throw new Error("Pi session file is no longer available.");
  try {
    abortIfRequested(signal);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino === 0 || opened.ino !== before.ino) {
      throw new Error("Pi session file changed before extraction.");
    }
    const buffer = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < opened.size) {
      abortIfRequested(signal);
      const read = await handle.read(buffer, offset, opened.size - offset, offset);
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
    }
    abortIfRequested(signal);
    const after = await handle.stat();
    if (after.ino !== opened.ino || after.size !== opened.size) {
      throw new Error("Pi session file changed during extraction.");
    }
    const raw = buffer.subarray(0, offset).toString("utf8");
    const messages: Array<PiHistoryMessage> = [];
    let fallbackTimestamp: string | undefined;
    // Record positions count every non-empty line after the header line, so a
    // fork with maxRecords === recordIndex + 1 keeps exactly the file prefix
    // through that line. Children always append after parents, so any such
    // prefix is a valid session.
    let headerSeen = false;
    const messageLimit =
      options.maxMessages === undefined
        ? PI_HISTORY_MAX_MESSAGES
        : Math.max(0, Math.min(PI_HISTORY_MAX_MESSAGES, Math.floor(options.maxMessages)));
    const textLimit =
      options.maxTextBytes === undefined
        ? PI_HISTORY_MAX_TEXT_BYTES
        : Math.max(16, Math.min(PI_HISTORY_MAX_TEXT_BYTES, Math.floor(options.maxTextBytes)));
    const lines = raw.split("\n");
    let recordIndex = -1;
    const records: Array<IndexedRecord> = [];
    for (const line of lines) {
      abortIfRequested(signal);
      if (line.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Unparseable lines still occupy a record position so fork cuts align.
        recordIndex += 1;
        continue;
      }
      if (!isRecord(parsed)) {
        recordIndex += 1;
        continue;
      }
      if (!headerSeen) {
        headerSeen = true;
        if (parsed.type === "session") {
          fallbackTimestamp = isoTimestamp(parsed.timestamp) ?? fallbackTimestamp;
        }
        continue;
      }
      recordIndex += 1;
      records.push({ value: parsed, recordIndex });
    }
    let truncated = false;
    for (const { value: parsed, recordIndex: index } of activeBranchRecords(records)) {
      abortIfRequested(signal);
      if (parsed.type !== "message") continue;
      const text = extractEntryText(parsed);
      if (text === undefined) continue;
      const createdAt = isoTimestamp(parsed.timestamp) ?? fallbackTimestamp;
      if (createdAt === undefined) continue;
      fallbackTimestamp = createdAt;
      if (options.afterRecordIndex !== undefined && index <= options.afterRecordIndex) continue;
      if (options.take !== "last" && messages.length >= messageLimit) {
        truncated = true;
        break;
      }
      messages.push({
        role: text.role,
        text: truncateText(text.text, textLimit),
        createdAt,
        recordIndex: index,
      });
    }
    if (options.take === "last" && messages.length > messageLimit) {
      truncated = true;
      return { messages: messages.slice(messages.length - messageLimit), truncated };
    }
    return { messages, truncated };
  } finally {
    await handle.close();
  }
}
