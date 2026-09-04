// @effect-diagnostics nodeBuiltinImport:off -- Read-only package/declaration compatibility probe.
import * as Crypto from "node:crypto";
import * as FileSystem from "node:fs/promises";
import * as Path from "node:path";

const MAX_JSONL_RECORD_BYTES = 1024 * 1024;
const PI_PACKAGE_NAME = "@earendil-works/pi-coding-agent";

export type PiRpcRecord = Readonly<Record<string, unknown>>;

export type PiJsonlFrame =
  | { readonly type: "record"; readonly record: PiRpcRecord }
  | { readonly type: "invalid"; readonly reason: "invalid-json" | "invalid-record" | "oversized" };

function isRecord(value: unknown): value is PiRpcRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Pi RPC is LF-delimited JSONL. This deliberately operates on bytes so a
 * multi-byte character split between stdout chunks is never decoded early.
 */
export class PiJsonlDecoder {
  readonly #decoder = new TextDecoder("utf-8", { fatal: true });
  #parts: Uint8Array[] = [];
  #length = 0;
  #oversized = false;

  push(chunk: Uint8Array): ReadonlyArray<PiJsonlFrame> {
    const frames: PiJsonlFrame[] = [];
    let start = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      if (chunk[index] !== 0x0a) continue;
      this.#append(chunk.subarray(start, index));
      const frame = this.#finishRecord();
      if (frame !== undefined) frames.push(frame);
      start = index + 1;
    }
    this.#append(chunk.subarray(start));
    return frames;
  }

  finish(): ReadonlyArray<PiJsonlFrame> {
    const frame = this.#finishRecord();
    return frame === undefined ? [] : [frame];
  }

  #append(part: Uint8Array): void {
    if (part.length === 0 || this.#oversized) return;
    this.#length += part.length;
    if (this.#length > MAX_JSONL_RECORD_BYTES) {
      this.#parts = [];
      this.#oversized = true;
      return;
    }
    this.#parts.push(part);
  }

  #finishRecord(): PiJsonlFrame | undefined {
    if (this.#oversized) {
      this.#reset();
      return { type: "invalid", reason: "oversized" };
    }
    if (this.#length === 0) return undefined;
    const bytes = new Uint8Array(this.#length);
    let offset = 0;
    for (const part of this.#parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    this.#reset();
    const line = bytes.at(-1) === 0x0d ? bytes.subarray(0, -1) : bytes;
    if (line.length === 0) return undefined;
    try {
      const value: unknown = JSON.parse(this.#decoder.decode(line));
      return isRecord(value)
        ? { type: "record", record: value }
        : { type: "invalid", reason: "invalid-record" };
    } catch {
      return { type: "invalid", reason: "invalid-json" };
    }
  }

  #reset(): void {
    this.#parts = [];
    this.#length = 0;
    this.#oversized = false;
  }
}

export function encodePiJsonlRecord(record: PiRpcRecord): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(record)}\n`);
}

export interface PiSessionEntry extends PiRpcRecord {
  readonly id: string;
  readonly parentId: string | null;
}

export interface PiSessionV3 {
  readonly header: PiRpcRecord;
  readonly entries: ReadonlyArray<PiSessionEntry>;
  /** Last append-order entry. This is intentionally not the active leaf. */
  readonly highWaterId: string | null;
}

export function parsePiSessionV3(jsonl: Uint8Array): PiSessionV3 {
  const decoder = new PiJsonlDecoder();
  const frames = [...decoder.push(jsonl), ...decoder.finish()];
  if (frames.some((frame) => frame.type === "invalid")) {
    throw new Error("Pi session fixture contains an invalid JSONL record.");
  }
  const records = frames.flatMap((frame) => (frame.type === "record" ? [frame.record] : []));
  const header = records.shift();
  if (header?.type !== "session" || header.version !== 3) {
    throw new Error("Pi session fixture must start with a v3 session header.");
  }
  const entries = records.map((record, index): PiSessionEntry => {
    if (
      typeof record.id !== "string" ||
      (typeof record.parentId !== "string" && record.parentId !== null)
    ) {
      throw new Error(`Pi session fixture entry ${index + 1} has no valid id/parentId.`);
    }
    return record as PiSessionEntry;
  });
  return { header, entries, highWaterId: entries.at(-1)?.id ?? null };
}

export function activePiSessionBranch(
  entries: ReadonlyArray<PiSessionEntry>,
  leafId: string | null,
): ReadonlyArray<PiSessionEntry> {
  if (leafId === null) return [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const branch: PiSessionEntry[] = [];
  const seen = new Set<string>();
  let current = byId.get(leafId);
  while (current !== undefined) {
    if (seen.has(current.id))
      throw new Error(`Pi session tree contains a cycle at '${current.id}'.`);
    seen.add(current.id);
    branch.push(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
    if (branch.at(-1)?.parentId !== null && current === undefined) {
      throw new Error(`Pi session leaf '${leafId}' has a missing parent.`);
    }
  }
  return branch.reverse();
}

async function packageRootFromDirectory(directory: string): Promise<string | undefined> {
  let current = directory;
  while (true) {
    const packageJsonPath = Path.join(current, "package.json");
    try {
      const metadata: unknown = JSON.parse(await FileSystem.readFile(packageJsonPath, "utf8"));
      if (isRecord(metadata) && metadata.name === PI_PACKAGE_NAME) return current;
    } catch {
      // Keep walking toward the filesystem root.
    }
    const parent = Path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Resolve a configured Pi binary to its owning npm package without executing it. */
export async function resolvePiPackageFromBinary(
  binaryPath: string,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const extensions =
    process.platform === "win32"
      ? ["", ...(environment.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")]
      : [""];
  const names = Path.extname(binaryPath)
    ? [binaryPath]
    : extensions.map((ext) => `${binaryPath}${ext.toLowerCase()}`);
  const candidates =
    Path.isAbsolute(binaryPath) || binaryPath.includes("/") || binaryPath.includes("\\")
      ? names
      : (environment.PATH ?? "")
          .split(Path.delimiter)
          .filter(Boolean)
          .flatMap((directory) => names.map((name) => Path.join(directory, name)));
  for (const candidate of candidates) {
    let executable: string;
    try {
      executable = await FileSystem.realpath(candidate);
    } catch {
      continue;
    }
    const directPackage = await packageRootFromDirectory(Path.dirname(executable));
    if (directPackage !== undefined) return directPackage;
    const npmPackage = Path.join(
      Path.dirname(executable),
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
    );
    try {
      const metadata: unknown = JSON.parse(
        await FileSystem.readFile(Path.join(npmPackage, "package.json"), "utf8"),
      );
      if (isRecord(metadata) && metadata.name === PI_PACKAGE_NAME) {
        return await FileSystem.realpath(npmPackage);
      }
    } catch {
      // This candidate is not an npm Pi launcher.
    }
  }
  throw new Error(`Cannot resolve configured Pi binary '${binaryPath}' to '${PI_PACKAGE_NAME}'.`);
}

function requiredRecord(value: unknown, description: string): PiRpcRecord {
  if (!isRecord(value)) throw new Error(`${description} must be an object.`);
  return value;
}

function exactKeys(record: PiRpcRecord, keys: ReadonlyArray<string>, description: string): void {
  const expected = new Set(keys);
  const unexpected = Object.keys(record).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in record));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${description} fields do not match Pi 0.84.4 (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}).`,
    );
  }
}

function validateUsage(value: unknown, description: string): void {
  const usage = requiredRecord(value, description);
  for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]) {
    if (typeof usage[key] !== "number") throw new Error(`${description}.${key} must be numeric.`);
  }
  const cost = requiredRecord(usage.cost, `${description}.cost`);
  for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"]) {
    if (typeof cost[key] !== "number")
      throw new Error(`${description}.cost.${key} must be numeric.`);
  }
}

function validateMessage(value: unknown, description: string): void {
  const message = requiredRecord(value, description);
  if (typeof message.timestamp !== "number")
    throw new Error(`${description}.timestamp is required.`);
  if (message.role === "assistant") {
    for (const key of ["api", "provider", "model", "stopReason"]) {
      if (typeof message[key] !== "string") throw new Error(`${description}.${key} is required.`);
    }
    if (!Array.isArray(message.content))
      throw new Error(`${description}.content must be an array.`);
    validateUsage(message.usage, `${description}.usage`);
  } else if (message.role === "toolResult") {
    for (const key of ["toolCallId", "toolName"]) {
      if (typeof message[key] !== "string") throw new Error(`${description}.${key} is required.`);
    }
    if (!Array.isArray(message.content) || typeof message.isError !== "boolean") {
      throw new Error(`${description} is not a complete tool result.`);
    }
  } else if (message.role === "user") {
    if (typeof message.content !== "string" && !Array.isArray(message.content)) {
      throw new Error(`${description}.content is required.`);
    }
  } else {
    throw new Error(`${description} has unsupported role '${String(message.role)}'.`);
  }
}

/** Validate fixture shapes whose required fields are declared outside RpcCommand. */
export function validatePiRpcConformanceFixture(
  value: unknown,
  probe: PiProtocolCompatibilityProbe,
): void {
  const fixture = requiredRecord(value, "Pi RPC fixture");
  if (
    !Array.isArray(fixture.rpcMethods) ||
    !Array.isArray(fixture.slashCommands) ||
    !Array.isArray(fixture.events)
  ) {
    throw new Error(
      "Pi RPC fixture requires separate rpcMethods, slashCommands, and events arrays.",
    );
  }
  if (JSON.stringify(fixture.rpcMethods) !== JSON.stringify(probe.rpcCommands)) {
    throw new Error("Pi RPC method fixture does not match the resolved RpcCommand declaration.");
  }
  const rpcMethods = new Set(fixture.rpcMethods);
  for (const [index, commandValue] of fixture.slashCommands.entries()) {
    const command = requiredRecord(commandValue, `slashCommands[${index}]`);
    exactKeys(command, ["name", "description", "source", "sourceInfo"], `slashCommands[${index}]`);
    if (typeof command.name !== "string" || rpcMethods.has(command.name)) {
      throw new Error("Slash-command discovery is conflated with RPC method discriminants.");
    }
    const sourceInfo = requiredRecord(command.sourceInfo, `slashCommands[${index}].sourceInfo`);
    exactKeys(
      sourceInfo,
      ["path", "source", "scope", "origin", "baseDir"],
      `slashCommands[${index}].sourceInfo`,
    );
    for (const key of ["path", "source", "scope", "origin", "baseDir"]) {
      if (typeof sourceInfo[key] !== "string")
        throw new Error(`slashCommands[${index}].sourceInfo.${key} is required.`);
    }
  }
  const state = requiredRecord(fixture.state, "state");
  exactKeys(
    state,
    [
      "model",
      "thinkingLevel",
      "isStreaming",
      "isCompacting",
      "steeringMode",
      "followUpMode",
      "sessionFile",
      "sessionId",
      "sessionName",
      "autoCompactionEnabled",
      "messageCount",
      "pendingMessageCount",
    ],
    "state",
  );
  const model = requiredRecord(state.model, "state.model");
  exactKeys(
    model,
    [
      "id",
      "name",
      "api",
      "provider",
      "baseUrl",
      "reasoning",
      "input",
      "cost",
      "contextWindow",
      "maxTokens",
    ],
    "state.model",
  );
  for (const key of ["id", "name", "api", "provider", "baseUrl"]) {
    if (typeof model[key] !== "string") throw new Error(`state.model.${key} is required.`);
  }
  if (
    !Array.isArray(model.input) ||
    typeof model.reasoning !== "boolean" ||
    typeof model.contextWindow !== "number" ||
    typeof model.maxTokens !== "number"
  ) {
    throw new Error("state.model does not satisfy Pi's public Model declaration.");
  }
  const modelCost = requiredRecord(model.cost, "state.model.cost");
  exactKeys(modelCost, ["input", "output", "cacheRead", "cacheWrite"], "state.model.cost");

  for (const [index, eventValue] of fixture.events.entries()) {
    const event = requiredRecord(eventValue, `events[${index}]`);
    const description = `events[${index}] (${String(event.type)})`;
    switch (event.type) {
      case "message_update":
        exactKeys(event, ["type", "usage", "assistantMessageEvent"], description);
        validateUsage(event.usage, `${description}.usage`);
        requiredRecord(event.assistantMessageEvent, `${description}.assistantMessageEvent`);
        break;
      case "message_end":
        exactKeys(event, ["type", "message"], description);
        validateMessage(event.message, `${description}.message`);
        break;
      case "tool_execution_start":
        exactKeys(event, ["type", "toolCallId", "toolName", "args"], description);
        break;
      case "tool_execution_update": {
        exactKeys(event, ["type", "toolCallId", "toolName", "args", "partialResult"], description);
        const partialResult = requiredRecord(event.partialResult, `${description}.partialResult`);
        if (!Array.isArray(partialResult.content) || !("details" in partialResult)) {
          throw new Error(`${description}.partialResult must satisfy AgentToolResult.`);
        }
        break;
      }
      case "tool_execution_end": {
        exactKeys(event, ["type", "toolCallId", "toolName", "result", "isError"], description);
        const result = requiredRecord(event.result, `${description}.result`);
        if (
          !Array.isArray(result.content) ||
          !("details" in result) ||
          typeof event.isError !== "boolean"
        ) {
          throw new Error(`${description}.result must satisfy AgentToolResult.`);
        }
        break;
      }
      case "queue_update":
        exactKeys(event, ["type", "steering", "followUp"], description);
        if (!Array.isArray(event.steering) || !Array.isArray(event.followUp)) {
          throw new Error(`${description} requires steering and followUp arrays.`);
        }
        break;
      case "extension_ui_request": {
        const fieldsByMethod: Readonly<Record<string, ReadonlyArray<string>>> = {
          confirm: ["type", "id", "method", "title", "message"],
          select: ["type", "id", "method", "title", "options"],
          input: ["type", "id", "method", "title", "placeholder"],
          editor: ["type", "id", "method", "title", "prefill"],
          notify: ["type", "id", "method", "message", "notifyType"],
          setStatus: ["type", "id", "method", "statusKey", "statusText"],
          setWidget: ["type", "id", "method", "widgetKey", "widgetLines", "widgetPlacement"],
          setTitle: ["type", "id", "method", "title"],
          set_editor_text: ["type", "id", "method", "text"],
        };
        const fields = typeof event.method === "string" ? fieldsByMethod[event.method] : undefined;
        if (fields === undefined) throw new Error(`${description} has an unknown UI method.`);
        exactKeys(event, fields, description);
        break;
      }
      case "compaction_start":
        exactKeys(event, ["type", "reason"], description);
        break;
      case "compaction_end": {
        exactKeys(event, ["type", "reason", "result", "aborted", "willRetry"], description);
        const result = requiredRecord(event.result, `${description}.result`);
        exactKeys(
          result,
          [
            "summary",
            "firstKeptEntryId",
            "tokensBefore",
            "estimatedTokensAfter",
            "usage",
            "details",
          ],
          `${description}.result`,
        );
        for (const key of ["summary", "firstKeptEntryId"]) {
          if (typeof result[key] !== "string")
            throw new Error(`${description}.result.${key} is required.`);
        }
        if (typeof result.tokensBefore !== "number")
          throw new Error(`${description}.result.tokensBefore is required.`);
        break;
      }
      case "auto_retry_start":
        exactKeys(
          event,
          ["type", "attempt", "maxAttempts", "delayMs", "errorMessage"],
          description,
        );
        break;
      case "auto_retry_end":
        exactKeys(event, ["type", "success", "attempt"], description);
        break;
      case "summarization_retry_scheduled":
        exactKeys(
          event,
          ["type", "attempt", "maxAttempts", "delayMs", "errorMessage"],
          description,
        );
        break;
      case "summarization_retry_attempt_start":
        exactKeys(event, ["type", "source", "reason"], description);
        break;
      case "summarization_retry_finished":
      case "agent_settled":
        exactKeys(event, ["type"], description);
        break;
    }
  }
  const forward = requiredRecord(fixture.forwardCompatibleRecord, "forwardCompatibleRecord");
  if (typeof forward.type !== "string" || !("futureField" in forward)) {
    throw new Error("Pi RPC fixture requires one isolated forward-compatible record.");
  }
}

export interface PiProtocolCompatibilityProbe {
  readonly packagePath: string;
  readonly version: string;
  readonly packageJsonSha256: string;
  readonly rpcDeclarationsPath: string;
  readonly rpcDeclarationsSha256: string;
  /** RPC command discriminants declared by the resolved Pi package, not slash commands. */
  readonly rpcCommands: ReadonlyArray<string>;
}

/**
 * Reads the public package metadata and RPC declaration from the exact resolved
 * Pi installation. It neither starts Pi nor reads a session or credential.
 */
export function assertPiRpcOperations(
  probe: PiProtocolCompatibilityProbe,
  advertisedOperations: ReadonlyArray<string>,
): void {
  const declared = new Set(probe.rpcCommands);
  const missing = advertisedOperations.filter((operation) => !declared.has(operation));
  if (missing.length > 0) {
    throw new Error(
      `Pi ${probe.version} at '${probe.packagePath}' does not declare advertised RPC operation(s): ${missing.join(", ")}.`,
    );
  }
}

export async function probePiProtocol(packagePath: string): Promise<PiProtocolCompatibilityProbe> {
  const resolvedPackagePath = await FileSystem.realpath(packagePath);
  const packageJsonPath = Path.join(resolvedPackagePath, "package.json");
  const declarationsPath = Path.join(resolvedPackagePath, "dist", "modes", "rpc", "rpc-types.d.ts");
  const [packageJson, declarations] = await Promise.all([
    FileSystem.readFile(packageJsonPath),
    FileSystem.readFile(declarationsPath, "utf8"),
  ]);
  const metadata: unknown = JSON.parse(packageJson.toString("utf8"));
  if (
    !isRecord(metadata) ||
    metadata.name !== PI_PACKAGE_NAME ||
    typeof metadata.version !== "string"
  ) {
    throw new Error(`Resolved Pi package '${resolvedPackagePath}' has invalid identity.`);
  }
  const commandDeclaration = declarations.match(
    /export type RpcCommand =([\s\S]*?)export interface RpcSlashCommand/u,
  )?.[1];
  const rpcCommands = [
    ...new Set(
      [...(commandDeclaration?.matchAll(/type: "([^"]+)"/gu) ?? [])].map((match) => match[1]!),
    ),
  ];
  if (rpcCommands.length === 0)
    throw new Error("Resolved Pi RPC declarations contain no commands.");
  return {
    packagePath: resolvedPackagePath,
    version: metadata.version,
    packageJsonSha256: Crypto.createHash("sha256").update(packageJson).digest("hex"),
    rpcDeclarationsPath: declarationsPath,
    rpcDeclarationsSha256: Crypto.createHash("sha256").update(declarations).digest("hex"),
    rpcCommands,
  };
}
