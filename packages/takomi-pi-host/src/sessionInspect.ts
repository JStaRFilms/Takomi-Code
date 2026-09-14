// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Bounded, read-only Pi session verification.
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

const MAX_PATH_BYTES = 32_768;
const MAX_PREFIX_BYTES = 1024 * 1024;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;

export type PiSessionSourceReason = "missing" | "workspace" | "format" | "unsafe";

export class PiSessionSourceError extends Error {
  readonly reason: PiSessionSourceReason;
  constructor(reason: PiSessionSourceReason, message: string) {
    super(message);
    this.name = "PiSessionSourceError";
    this.reason = reason;
  }
}

export interface PiSessionInspection {
  readonly device: string;
  readonly inode: string;
  readonly size: number;
  readonly modifiedMs: number;
  readonly headerId: string;
  readonly headerVersion: number;
  readonly headerCwd: string;
  readonly headerCwdRealpath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error("Pi session inspection aborted.");
}

/** Verify a catalog-listed session file is still the same file object and readable. */
export async function inspectPiSessionFile(
  input: { readonly file: string },
  options: { readonly signal: AbortSignal },
): Promise<PiSessionInspection> {
  const { signal } = options;
  abortIfRequested(signal);
  if (input.file.length === 0 || Buffer.byteLength(input.file) > MAX_PATH_BYTES) {
    throw new PiSessionSourceError("unsafe", "Pi session path is outside the readable range.");
  }
  const file = NodePath.resolve(input.file);
  let before: NodeFS.Stats;
  try {
    before = await NodeFSP.lstat(file);
  } catch {
    throw new PiSessionSourceError("missing", "Pi session file is no longer available.");
  }
  if (!before.isFile() || before.isSymbolicLink() || before.ino === 0) {
    throw new PiSessionSourceError("unsafe", "Pi session file failed its safety check.");
  }
  if (before.size <= 0 || before.size > MAX_SOURCE_BYTES) {
    throw new PiSessionSourceError("format", "Pi session file is outside the readable range.");
  }
  abortIfRequested(signal);
  let realFile: string;
  try {
    realFile = await NodeFSP.realpath(file);
  } catch {
    throw new PiSessionSourceError("missing", "Pi session file is no longer available.");
  }
  if (realFile !== file) {
    throw new PiSessionSourceError("unsafe", "Pi session file failed its safety check.");
  }
  const noFollow = "O_NOFOLLOW" in NodeFS.constants ? NodeFS.constants.O_NOFOLLOW : 0;
  let handle: NodeFSP.FileHandle;
  try {
    handle = await NodeFSP.open(file, NodeFS.constants.O_RDONLY | noFollow);
  } catch {
    throw new PiSessionSourceError("missing", "Pi session file is no longer available.");
  }
  try {
    abortIfRequested(signal);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino === 0 || opened.ino !== before.ino) {
      throw new PiSessionSourceError("unsafe", "Pi session file failed its safety check.");
    }
    const prefixLength = Math.min(opened.size, MAX_PREFIX_BYTES);
    const buffer = Buffer.alloc(prefixLength);
    await handle.read(buffer, 0, prefixLength, 0);
    abortIfRequested(signal);
    const after = await handle.stat();
    if (after.ino !== opened.ino || after.size !== opened.size) {
      throw new PiSessionSourceError("missing", "Pi session file changed during inspection.");
    }
    const text = buffer.toString("utf8");
    const newline = text.indexOf("\n");
    const headerLine = newline === -1 ? text : text.slice(0, newline);
    if (headerLine.length === 0 || Buffer.byteLength(headerLine) > MAX_RECORD_BYTES) {
      throw new PiSessionSourceError("format", "Pi session file has no readable header.");
    }
    let header: unknown;
    try {
      header = JSON.parse(headerLine);
    } catch {
      throw new PiSessionSourceError("format", "Pi session file has no readable header.");
    }
    if (!isRecord(header) || header.type !== "session") {
      throw new PiSessionSourceError("format", "Pi session file has no readable header.");
    }
    const headerId = readString(header.id);
    const headerCwd = readString(header.cwd);
    if (
      headerId === undefined ||
      headerCwd === undefined ||
      !Number.isSafeInteger(header.version)
    ) {
      throw new PiSessionSourceError("format", "Pi session header is unsupported.");
    }
    let headerCwdRealpath: string;
    try {
      headerCwdRealpath = await NodeFSP.realpath(headerCwd);
    } catch {
      throw new PiSessionSourceError("workspace", "Pi session workspace is unavailable.");
    }
    return {
      device: String(opened.dev),
      inode: String(opened.ino),
      size: opened.size,
      modifiedMs: opened.mtimeMs,
      headerId,
      headerVersion: header.version as number,
      headerCwd,
      headerCwdRealpath,
    };
  } finally {
    await handle.close();
  }
}
