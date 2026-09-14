// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- Isolated, bounded, read-only Pi metadata scanning.
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export const PI_CATALOG_VERSION = "0.84.4";
/**
 * Pi releases whose session storage and catalog conventions are verified.
 * Deliberately an allowlist, not a range: each new Pi release must prove
 * header version, filename convention, and fork layout before joining it.
 */
export const PI_CATALOG_VERSIONS: ReadonlyArray<string> = ["0.84.4", "0.85.1"];
export const PI_CATALOG_HARD_CEILING = 2_000;
const MAX_FILE_PREFIX_BYTES = 1024 * 1024;
const MAX_FILE_TAIL_BYTES = 64 * 1024;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_SESSION_RECORDS = 4_096;
const MAX_DIRECTORY_NAME_BYTES = 512;
const MAX_NATIVE_ID_BYTES = 512;
const MAX_LABEL_BYTES = 160;
const READ_CONCURRENCY = 8;

export interface PiSessionFileIdentity {
  readonly device: string;
  readonly inode: string;
  readonly size: number;
  readonly modifiedMs: number;
}

export interface PiNativeSessionCatalogEntry {
  /** Host-internal values. The server must replace these with random handles. */
  readonly nativeSessionId: string;
  readonly nativeFile: string;
  readonly fileIdentity: PiSessionFileIdentity;
  readonly name: string;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly model?: string;
  readonly thinking?: string;
  readonly entryCount: number;
  readonly entryCountExact: boolean;
  readonly parentSession: boolean;
  readonly formatVersion: number | "legacy" | "unknown";
  readonly compatibility: "compatible" | "legacy" | "unknown" | "malformed" | "truncated";
  readonly fidelity: "metadata-only" | "metadata-truncated";
  readonly activity: "unobservable";
  readonly ownership: "external-source";
}

export interface PiSessionCatalogScanResult {
  readonly entries: ReadonlyArray<PiNativeSessionCatalogEntry>;
  /** True only when more valid directory candidates exist than the hard ceiling. */
  readonly hardCapped: boolean;
  readonly hardCeiling: typeof PI_CATALOG_HARD_CEILING;
  readonly source: "pi-documented-session-storage";
}

export interface PiSessionCatalogScanRequest {
  readonly workspacePath: string;
  readonly agentDir: string;
  readonly packageRoot: string;
  readonly launchArgs: ReadonlyArray<string>;
  readonly environmentSessionDir?: string;
}

interface SessionHeader {
  readonly id: string;
  readonly timestamp: string;
  readonly cwd: string;
  readonly version?: number;
  readonly parentSession?: string;
}

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error("Pi session catalog scan aborted.");
}

function validateScanRequest(input: PiSessionCatalogScanRequest): void {
  const paths = [
    input.workspacePath,
    input.agentDir,
    input.packageRoot,
    ...(input.environmentSessionDir ? [input.environmentSessionDir] : []),
  ];
  if (
    paths.some((path) => path.length === 0 || Buffer.byteLength(path) > 32_768) ||
    input.launchArgs.length > 128 ||
    input.launchArgs.some((argument) => Buffer.byteLength(argument) > 4_096)
  ) {
    throw new Error("Invalid Pi catalog scan request.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * First user message text, mirroring Pi's session-selector fallback
 * (display name, else first message). String content is used verbatim;
 * block content joins its text blocks. Empty extraction keeps scanning.
 */
function extractUserMessageText(message: unknown): string | undefined {
  if (!isRecord(message) || message.role !== "user") return undefined;
  const content = message.content;
  if (typeof content === "string") return readString(content);
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter(isRecord)
    .filter((block) => block.type === "text")
    .map((block) => readString(block.text) ?? "")
    .filter((part) => part.length > 0)
    .join(" ");
  return text.length > 0 ? text : undefined;
}

function safeLabel(value: string | undefined, fallback: string): string {
  const compact = (value ?? fallback).replaceAll(/[\r\n\t]/g, " ").trim() || fallback;
  if (Buffer.byteLength(compact) <= MAX_LABEL_BYTES) return compact;
  let bounded = "";
  for (const character of compact) {
    if (Buffer.byteLength(bounded + character) > MAX_LABEL_BYTES) break;
    bounded += character;
  }
  return bounded.trimEnd();
}

function boundedLines(value: string): {
  readonly lines: ReadonlyArray<string>;
  readonly capped: boolean;
} {
  const lines: Array<string> = [];
  let offset = 0;
  while (lines.length < MAX_SESSION_RECORDS + 1 && offset <= value.length) {
    const newline = value.indexOf("\n", offset);
    const end = newline === -1 ? value.length : newline;
    const line = value.slice(offset, end);
    lines.push(line.endsWith("\r") ? line.slice(0, -1) : line);
    if (newline === -1) return { lines, capped: false };
    offset = newline + 1;
  }
  return { lines, capped: offset < value.length };
}

function isoTimestamp(value: unknown): string | undefined {
  const timestamp = readString(value);
  return timestamp !== undefined &&
    Buffer.byteLength(timestamp) <= 64 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(timestamp)
    ? timestamp
    : undefined;
}

function identity(stat: NodeFS.Stats): PiSessionFileIdentity {
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    size: stat.size,
    modifiedMs: stat.mtimeMs,
  };
}

/**
 * Latest session_info name from the file tail, mirroring Pi's getSessionName
 * (latest wins, blank clears). Best-effort: undefined means "keep the prefix
 * name". Skips the chunk's first (possibly partial) line and any line that
 * does not parse, so a concurrently-appended partial record is ignored.
 */
async function readTailSessionName(
  handle: NodeFSP.FileHandle,
  fileSize: number,
  signal: AbortSignal,
): Promise<{ readonly found: boolean; readonly name: string | undefined } | undefined> {
  try {
    abortIfRequested(signal);
    const tailLength = Math.min(fileSize, MAX_FILE_TAIL_BYTES);
    if (tailLength <= 0) return undefined;
    const buffer = Buffer.alloc(tailLength);
    let offset = 0;
    while (offset < tailLength) {
      abortIfRequested(signal);
      const read = await handle.read(
        buffer,
        offset,
        tailLength - offset,
        fileSize - tailLength + offset,
      );
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
    }
    abortIfRequested(signal);
    const text = buffer.subarray(0, offset).toString("utf8");
    const firstNewline = text.indexOf("\n");
    if (firstNewline === -1) return undefined;
    const lines = text.slice(firstNewline + 1).split("\n");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (line === undefined || line.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (isRecord(parsed) && parsed.type === "session_info") {
        return { found: true, name: readString(parsed.name) };
      }
    }
    return { found: false, name: undefined };
  } catch {
    return undefined;
  }
}

function sameIdentity(left: NodeFS.Stats, right: NodeFS.Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  );
}

async function readPrefix(
  handle: NodeFSP.FileHandle,
  length: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    abortIfRequested(signal);
    const read = await handle.read(bytes, offset, length - offset, offset);
    if (read.bytesRead === 0) break;
    offset += read.bytesRead;
  }
  return bytes.subarray(0, offset);
}

function contained(root: string, candidate: string): boolean {
  const relative = NodePath.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !NodePath.isAbsolute(relative);
}

interface CanonicalDirectory {
  readonly path: string;
  readonly identity: NodeFS.Stats;
}

async function canonicalDirectory(path: string, signal: AbortSignal): Promise<CanonicalDirectory> {
  abortIfRequested(signal);
  const before = await NodeFSP.lstat(path);
  abortIfRequested(signal);
  if (!before.isDirectory() || before.isSymbolicLink() || before.ino === 0)
    throw new Error("Unsafe catalog directory.");
  const canonical = await NodeFSP.realpath(path);
  abortIfRequested(signal);
  const after = await NodeFSP.lstat(canonical);
  if (
    !after.isDirectory() ||
    after.isSymbolicLink() ||
    after.ino === 0 ||
    !sameIdentity(before, after)
  ) {
    throw new Error("Catalog directory changed during validation.");
  }
  return { path: canonical, identity: after };
}

function resolveConfiguredPath(path: string): string {
  if (path === "~") return NodeOS.homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return NodePath.resolve(NodeOS.homedir(), path.slice(2));
  }
  return NodePath.resolve(path);
}

function launchSessionDirectory(args: ReadonlyArray<string>): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") break;
    if (argument === "--session-dir") return args[index + 1];
    if (argument?.startsWith("--session-dir=")) return argument.slice("--session-dir=".length);
  }
  return undefined;
}

async function settingsSessionDirectory(
  agentDir: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  abortIfRequested(signal);
  try {
    const settingsPath = NodePath.join(agentDir, "settings.json");
    const before = await NodeFSP.lstat(settingsPath);
    if (!before.isFile() || before.isSymbolicLink() || before.ino === 0) {
      throw new Error("Unsafe Pi settings file.");
    }
    const noFollow = "O_NOFOLLOW" in NodeFS.constants ? NodeFS.constants.O_NOFOLLOW : 0;
    const handle = await NodeFSP.open(settingsPath, NodeFS.constants.O_RDONLY | noFollow);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_RECORD_BYTES || !sameIdentity(before, stat)) {
        throw new Error("Pi settings file changed during validation.");
      }
      const bytes = await readPrefix(handle, stat.size, signal);
      if (bytes.length !== stat.size)
        throw new Error("Pi settings file was truncated during read.");
      abortIfRequested(signal);
      if (!sameIdentity(stat, await handle.stat())) {
        throw new Error("Pi settings file changed during read.");
      }
      const value: unknown = JSON.parse(bytes.toString("utf8"));
      return isRecord(value) ? readString(value.sessionDir) : undefined;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function resolveSessionDirectory(
  input: PiSessionCatalogScanRequest,
  workspace: string,
  agentDir: string,
  packageRoot: string,
  signal: AbortSignal,
): Promise<string> {
  const packagePath = NodePath.join(packageRoot, "package.json");
  const packageBefore = await NodeFSP.lstat(packagePath);
  if (
    !packageBefore.isFile() ||
    packageBefore.isSymbolicLink() ||
    packageBefore.ino === 0 ||
    packageBefore.size > MAX_RECORD_BYTES
  ) {
    throw new Error("Unsafe Pi package metadata.");
  }
  const noFollow = "O_NOFOLLOW" in NodeFS.constants ? NodeFS.constants.O_NOFOLLOW : 0;
  const packageHandle = await NodeFSP.open(packagePath, NodeFS.constants.O_RDONLY | noFollow);
  let packageJson: unknown;
  try {
    const opened = await packageHandle.stat();
    if (!sameIdentity(packageBefore, opened)) throw new Error("Pi package metadata changed.");
    const bytes = await readPrefix(packageHandle, opened.size, signal);
    if (bytes.length !== opened.size) throw new Error("Pi package metadata was truncated.");
    abortIfRequested(signal);
    if (!sameIdentity(opened, await packageHandle.stat())) {
      throw new Error("Pi package metadata changed during read.");
    }
    packageJson = JSON.parse(bytes.toString("utf8"));
  } finally {
    await packageHandle.close();
  }
  if (
    !isRecord(packageJson) ||
    packageJson.name !== "@earendil-works/pi-coding-agent" ||
    typeof packageJson.version !== "string" ||
    !PI_CATALOG_VERSIONS.includes(packageJson.version)
  ) {
    throw new Error(
      `Pi catalog requires a verified Pi release (${PI_CATALOG_VERSIONS.join(", ")}).`,
    );
  }
  const configured =
    launchSessionDirectory(input.launchArgs) ??
    input.environmentSessionDir ??
    (await settingsSessionDirectory(agentDir, signal));
  if (configured !== undefined) return resolveConfiguredPath(configured);
  const encoded = `--${workspace.replace(/^[\\/]/, "").replaceAll(/[\\/:]/g, "-")}--`;
  return NodePath.join(agentDir, "sessions", encoded);
}

async function readSession(
  file: string,
  directory: string,
  workspace: string,
  signal: AbortSignal,
  beforeOpen?: (file: string) => Promise<void>,
): Promise<PiNativeSessionCatalogEntry | undefined> {
  abortIfRequested(signal);
  const before = await NodeFSP.lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.ino === 0) return undefined;
  await beforeOpen?.(file);
  abortIfRequested(signal);
  const realFile = await NodeFSP.realpath(file);
  if (!contained(directory, realFile) || realFile !== file) return undefined;
  const noFollow = "O_NOFOLLOW" in NodeFS.constants ? NodeFS.constants.O_NOFOLLOW : 0;
  let handle: NodeFSP.FileHandle;
  try {
    handle = await NodeFSP.open(file, NodeFS.constants.O_RDONLY | noFollow);
  } catch {
    return undefined;
  }
  try {
    abortIfRequested(signal);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino === 0 || !sameIdentity(before, opened)) return undefined;
    const prefixLength = Math.min(opened.size, MAX_FILE_PREFIX_BYTES);
    const bytes = await readPrefix(handle, prefixLength, signal);
    const bytesRead = bytes.length;
    abortIfRequested(signal);
    const after = await handle.stat();
    if (!sameIdentity(opened, after)) return undefined;
    const bounded = boundedLines(bytes.toString("utf8"));
    const truncated = opened.size > bytesRead || bounded.capped;
    const [headerLine, ...lines] = bounded.lines;
    if (headerLine === undefined || Buffer.byteLength(headerLine) > MAX_RECORD_BYTES)
      return undefined;
    let rawHeader: unknown;
    try {
      rawHeader = JSON.parse(headerLine);
    } catch {
      return undefined;
    }
    if (!isRecord(rawHeader) || rawHeader.type !== "session") return undefined;
    const id = readString(rawHeader.id);
    const timestamp = isoTimestamp(rawHeader.timestamp);
    const cwd = readString(rawHeader.cwd);
    if (
      id === undefined ||
      Buffer.byteLength(id) > MAX_NATIVE_ID_BYTES ||
      timestamp === undefined ||
      cwd === undefined
    )
      return undefined;
    const sessionCwd = await NodeFSP.realpath(cwd).catch(() => undefined);
    abortIfRequested(signal);
    if (sessionCwd !== workspace) return undefined;
    const validVersion =
      rawHeader.version === undefined ||
      (Number.isSafeInteger(rawHeader.version) && (rawHeader.version as number) >= 0);
    const parentSession = readString(rawHeader.parentSession);
    const header: SessionHeader = {
      id,
      timestamp,
      cwd,
      ...(validVersion && typeof rawHeader.version === "number"
        ? { version: rawHeader.version }
        : {}),
      ...(parentSession ? { parentSession } : {}),
    };
    let infoName: string | undefined;
    let firstMessage: string | undefined;
    let model: string | undefined;
    let thinking: string | undefined;
    let entryCount = 0;
    let malformed = !validVersion;
    for (const line of lines) {
      abortIfRequested(signal);
      if (line.length === 0) continue;
      if (Buffer.byteLength(line) > MAX_RECORD_BYTES) {
        malformed = true;
        break;
      }
      try {
        const entry: unknown = JSON.parse(line);
        if (!isRecord(entry)) {
          malformed = true;
          break;
        }
        entryCount += 1;
        // Latest session_info wins, blank clears — exactly Pi's getSessionName.
        if (entry.type === "session_info") {
          infoName = readString(entry.name);
        }
        if (entry.type === "message" && firstMessage === undefined) {
          firstMessage = extractUserMessageText(entry.message) ?? undefined;
        }
        if (entry.type === "model_change") {
          const provider = readString(entry.provider);
          const modelId = readString(entry.modelId);
          if (provider && modelId) model = `${provider}/${modelId}`;
        }
        if (entry.type === "thinking_level_change")
          thinking = readString(entry.thinkingLevel) ?? thinking;
      } catch {
        malformed = true;
        break;
      }
    }
    const compatibility = truncated
      ? "truncated"
      : malformed
        ? "malformed"
        : header.version === 3
          ? "compatible"
          : header.version === undefined || header.version < 3
            ? "legacy"
            : "unknown";
    if (truncated) {
      // Pi appends renames (session_info) at the END of the file, so a
      // truncated prefix can miss the current name. Mirror Pi's
      // getSessionName (latest session_info wins, blank clears) with a
      // bounded tail read; any read trouble keeps the prefix name.
      const tail = await readTailSessionName(handle, opened.size, signal);
      if (tail !== undefined && tail.found) {
        infoName = tail.name;
      }
    }
    // Pi's selector shows the name, else the first user message. A blank
    // rename clears back to undefined, which falls through to the message.
    const displayName = infoName ?? firstMessage;
    return {
      nativeSessionId: header.id,
      nativeFile: realFile,
      fileIdentity: identity(opened),
      name: safeLabel(displayName, "Untitled Pi session"),
      createdAt: header.timestamp,
      modifiedAt: new Date(opened.mtimeMs).toISOString(),
      ...(model ? { model: safeLabel(model, "Unknown model") } : {}),
      ...(thinking ? { thinking: safeLabel(thinking, "Unknown") } : {}),
      entryCount,
      entryCountExact: !truncated && !malformed,
      parentSession: header.parentSession !== undefined,
      formatVersion: validVersion ? (header.version ?? "legacy") : "unknown",
      compatibility,
      fidelity: truncated ? "metadata-truncated" : "metadata-only",
      activity: "unobservable",
      ownership: "external-source",
    };
  } finally {
    await handle.close();
  }
}

/**
 * Pi 0.84.4 `SessionManager.list()` loads every file before returning. This
 * scanner instead applies Pi's documented storage precedence/convention and
 * reads bounded prefixes without opening a writable SessionManager.
 */
export async function scanPiSessionCatalog(
  input: PiSessionCatalogScanRequest,
  options: {
    readonly signal: AbortSignal;
    /** Deterministic race injection for conformance tests; production omits it. */
    readonly beforeOpen?: (file: string) => Promise<void>;
  },
): Promise<PiSessionCatalogScanResult> {
  const { signal } = options;
  validateScanRequest(input);
  abortIfRequested(signal);
  const workspaceState = await canonicalDirectory(NodePath.resolve(input.workspacePath), signal);
  const agentDirState = await canonicalDirectory(NodePath.resolve(input.agentDir), signal);
  const packageRootState = await canonicalDirectory(NodePath.resolve(input.packageRoot), signal);
  const workspace = workspaceState.path;
  const agentDir = agentDirState.path;
  const selected = await resolveSessionDirectory(
    input,
    workspace,
    agentDir,
    packageRootState.path,
    signal,
  );
  let directoryState: CanonicalDirectory;
  try {
    directoryState = await canonicalDirectory(selected, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        entries: [],
        hardCapped: false,
        hardCeiling: PI_CATALOG_HARD_CEILING,
        source: "pi-documented-session-storage",
      };
    }
    throw error;
  }
  const directory = directoryState.path;
  // Default storage must remain under the verified agent directory. Explicit
  // custom storage is itself canonicalized and never derived from client data.
  if (selected.startsWith(NodePath.join(agentDir, "sessions")) && !contained(agentDir, directory)) {
    throw new Error("Pi session storage escaped the configured agent directory.");
  }
  const candidates: Array<{ readonly name: string; readonly modifiedMs: number }> = [];
  const directoryHandle = await NodeFSP.opendir(directory);
  const openedDirectory = await NodeFSP.lstat(directory);
  if (!sameIdentity(directoryState.identity, openedDirectory)) {
    await directoryHandle.close().catch(() => undefined);
    throw new Error("Pi session storage changed before enumeration.");
  }
  try {
    for await (const entry of directoryHandle) {
      abortIfRequested(signal);
      if (Buffer.byteLength(entry.name) > MAX_DIRECTORY_NAME_BYTES) continue;
      if (!entry.name.endsWith(".jsonl") || !entry.isFile() || entry.isSymbolicLink()) continue;
      const stat = await NodeFSP.lstat(NodePath.join(directory, entry.name));
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      candidates.push({ name: entry.name, modifiedMs: stat.mtimeMs });
      if (candidates.length > PI_CATALOG_HARD_CEILING) break;
    }
  } finally {
    await directoryHandle.close().catch(() => undefined);
  }
  const afterEnumeration = await NodeFSP.lstat(directory);
  if (!sameIdentity(directoryState.identity, afterEnumeration)) {
    throw new Error("Pi session storage changed during enumeration.");
  }
  const hardCapped = candidates.length > PI_CATALOG_HARD_CEILING;
  candidates.length = Math.min(candidates.length, PI_CATALOG_HARD_CEILING);
  candidates.sort(
    (left, right) => right.modifiedMs - left.modifiedMs || left.name.localeCompare(right.name),
  );
  const results = Array.from<PiNativeSessionCatalogEntry | undefined>({
    length: candidates.length,
  });
  let next = 0;
  const worker = async () => {
    while (true) {
      abortIfRequested(signal);
      const index = next++;
      const candidate = candidates[index];
      if (candidate === undefined) return;
      results[index] = await readSession(
        NodePath.join(directory, candidate.name),
        directory,
        workspace,
        signal,
        options.beforeOpen,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, candidates.length) }, worker));
  abortIfRequested(signal);
  const [afterReads, workspaceAfter, agentDirAfter, packageRootAfter] = await Promise.all([
    NodeFSP.lstat(directory),
    NodeFSP.lstat(workspace),
    NodeFSP.lstat(agentDir),
    NodeFSP.lstat(packageRootState.path),
  ]);
  if (
    !sameIdentity(directoryState.identity, afterReads) ||
    !sameIdentity(workspaceState.identity, workspaceAfter) ||
    !sameIdentity(agentDirState.identity, agentDirAfter) ||
    !sameIdentity(packageRootState.identity, packageRootAfter)
  ) {
    throw new Error("Pi catalog roots changed during scan.");
  }
  return {
    entries: results.flatMap((entry) => (entry === undefined ? [] : [entry])),
    hardCapped,
    hardCeiling: PI_CATALOG_HARD_CEILING,
    source: "pi-documented-session-storage",
  };
}
