// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Bounded, single-file Pi session fork.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

/** Mirror of Pi's native SessionManager.forkFrom storage footprint. */
export const PI_FORK_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_PATH_BYTES = 32_768;

export interface PiSessionForkRequest {
  /** Absolute path of the source session file. */
  readonly sourceFile: string;
  /** Absolute path of the session directory holding the source file. */
  readonly sessionDir: string;
  /** Workspace the forked session belongs to (written into the new header). */
  readonly targetCwd: string;
  /**
   * Keep only the first N records (non-empty lines after the header). Every
   * record position matches extraction's recordIndex, and children always
   * append after parents, so any prefix is a valid session. Omitted keeps all.
   */
  readonly maxRecords?: number;
}

export interface PiSessionForkResult {
  readonly file: string;
  readonly sessionId: string;
  readonly parentSessionFile: string;
  /** Non-header records carried over, verbatim. */
  readonly recordCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function contained(directory: string, file: string): boolean {
  const relative = NodePath.relative(directory, file);
  return relative !== "" && !relative.startsWith("..") && !NodePath.isAbsolute(relative);
}

function fail(message: string): never {
  throw new Error(message);
}

export async function forkPiSessionFile(
  input: PiSessionForkRequest,
  options: { readonly signal: AbortSignal },
): Promise<PiSessionForkResult> {
  const { signal } = options;
  if (signal.aborted) throw signal.reason ?? new Error("Pi session fork aborted.");
  for (const path of [input.sourceFile, input.sessionDir, input.targetCwd]) {
    if (path.length === 0 || Buffer.byteLength(path) > MAX_PATH_BYTES) {
      fail("Invalid Pi session fork request.");
    }
  }
  const sessionDir = NodePath.resolve(input.sessionDir);
  const sourceFile = NodePath.resolve(input.sourceFile);
  const targetCwd = NodePath.resolve(input.targetCwd);
  const directoryStat = await NodeFSP.lstat(sessionDir);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    fail("Pi session directory is unsafe for forking.");
  }
  const before = await NodeFSP.lstat(sourceFile);
  if (!before.isFile() || before.isSymbolicLink() || before.ino === 0) {
    fail("Pi source session is unsafe for forking.");
  }
  if (before.size <= 0 || before.size > PI_FORK_MAX_SOURCE_BYTES) {
    fail("Pi source session size is outside the forkable range.");
  }
  if (signal.aborted) throw signal.reason ?? new Error("Pi session fork aborted.");
  const realFile = await NodeFSP.realpath(sourceFile);
  if (realFile !== sourceFile || !contained(sessionDir, realFile)) {
    fail("Pi source session escaped its session directory.");
  }
  const noFollow = "O_NOFOLLOW" in NodeFS.constants ? NodeFS.constants.O_NOFOLLOW : 0;
  const handle = await NodeFSP.open(sourceFile, NodeFS.constants.O_RDONLY | noFollow);
  let raw: string;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino === 0 || opened.ino !== before.ino) {
      fail("Pi source session changed before forking.");
    }
    const buffer = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < opened.size) {
      const read = await handle.read(buffer, offset, opened.size - offset, offset);
      if (read.bytesRead === 0) fail("Pi source session ended during forking.");
      offset += read.bytesRead;
      if (signal.aborted) throw signal.reason ?? new Error("Pi session fork aborted.");
    }
    if (signal.aborted) throw signal.reason ?? new Error("Pi session fork aborted.");
    const after = await handle.stat();
    if (after.ino !== opened.ino || after.size !== opened.size) {
      fail("Pi source session changed during forking.");
    }
    raw = buffer.toString("utf8");
  } finally {
    await handle.close();
  }
  const lines = raw.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) fail("Pi source session file is empty.");
  const headerLine = lines[0];
  if (headerLine === undefined || headerLine.length === 0) {
    fail("Pi source session has no readable header.");
  }
  let header: unknown;
  try {
    header = JSON.parse(headerLine);
  } catch {
    fail("Pi source session has no readable header.");
  }
  if (!isRecord(header) || header.type !== "session") {
    fail("Pi source session has no readable header.");
  }
  const sourceId = readString(header.id);
  const version = header.version;
  if (sourceId === undefined || !Number.isSafeInteger(version)) {
    fail("Pi source session header is unsupported for forking.");
  }
  const maxRecords = input.maxRecords;
  if (
    maxRecords !== undefined &&
    (!Number.isSafeInteger(maxRecords) || (maxRecords as number) < 0)
  ) {
    fail("Invalid Pi session fork request.");
  }
  const sessionId = NodeCrypto.randomUUID();
  const timestamp = new Date().toISOString();
  const fileTimestamp = timestamp.replace(/[:.]/g, "-");
  const file = NodePath.join(sessionDir, `${fileTimestamp}_${sessionId}.jsonl`);
  if (!contained(sessionDir, file)) fail("Pi forked session escaped its session directory.");
  const forkedHeader = {
    type: "session",
    version,
    id: sessionId,
    timestamp,
    cwd: targetCwd,
    parentSession: realFile,
  };
  const out = [`${JSON.stringify(forkedHeader)}\n`];
  // No per-record cap: a fork carries records verbatim, mirroring Pi's
  // native fork. The total-size cap above bounds memory. Every non-empty
  // post-header line consumes one maxRecords unit (matching extraction's
  // recordIndex); stray session-type lines consume budget but are dropped,
  // exactly like the native fork.
  let recordCount = 0;
  for (const entry of lines.slice(1)) {
    if (entry.length === 0) continue;
    if (maxRecords !== undefined && recordCount >= maxRecords) break;
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry);
    } catch {
      fail("Pi source session holds an unreadable record.");
    }
    recordCount += 1;
    if (!isRecord(parsed) || parsed.type === "session") continue;
    out.push(`${entry}\n`);
  }
  if (signal.aborted) throw signal.reason ?? new Error("Pi session fork aborted.");
  await NodeFSP.writeFile(file, out.join(""), { flag: "wx", mode: 0o600 });
  return { file, sessionId, parentSessionFile: realFile, recordCount };
}
