import type {
  ServerProviderSkill,
  ServerProviderSlashCommand,
  ServerProviderSlashCommandSourceInfo,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { parse as parseYaml } from "yaml";

export const MAX_PI_DISCOVERED_RESOURCES = 256;
export const MAX_PI_RESOURCE_METADATA_FILES = 64;
export const MAX_PI_RESOURCE_FILE_BYTES = 64 * 1024;
export const MAX_PI_RESOURCE_METADATA_BYTES = 512 * 1024;
const MAX_METADATA_CHARS = 4_096;
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const decodeUnknownJsonString = Schema.decodeUnknownSync(UnknownFromJsonString);

type PiResourceSource = "extension" | "prompt" | "skill";

export type PiProjectTrustDiagnostic =
  | "explicit-approved"
  | "explicit-rejected"
  | "observed-project-resources"
  | "configured-saved-approved-partial"
  | "configured-saved-rejected-partial"
  | "configured-default-always-partial"
  | "configured-default-never-partial"
  | "configured-default-ask-partial"
  | "unknown";

interface PiResourceFile {
  readonly id: string;
  readonly hostPath: string;
}

export interface PiDiscoveredResources {
  readonly slashCommands: ReadonlyArray<ServerProviderSlashCommand>;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
  /** Host-only metadata inputs. These paths are removed before publishing. */
  readonly resourceFiles: ReadonlyArray<PiResourceFile>;
  /** Diagnostic only: extension handlers can make static trust files incomplete. */
  readonly projectTrust?: PiProjectTrustDiagnostic;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, limit = MAX_METADATA_CHARS): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= limit ? trimmed : undefined;
}

function normalizeScope(scope: string | undefined): string | undefined {
  switch (scope?.toLowerCase()) {
    case "global":
    case "personal":
      return "user";
    case "workspace":
    case "local":
      return "project";
    case "path":
      return "explicit";
    case "user":
    case "project":
      return scope.toLowerCase();
    default:
      return undefined;
  }
}

function sourceOf(command: Record<string, unknown>): PiResourceSource | undefined {
  switch (command.source) {
    case "extension":
    case "prompt":
    case "skill":
      return command.source;
    default:
      return undefined;
  }
}

function safeSourceProvenance(value: unknown): string | undefined {
  const source = boundedString(value);
  // Pi's sourceInfo.source is provenance, not the command classification. It
  // can include package specifiers such as npm:@scope/package, but never a
  // host path or a traversal segment.
  if (
    !source ||
    source.includes("\\") ||
    source.startsWith("/") ||
    source.includes("..") ||
    source.startsWith("file:")
  ) {
    return undefined;
  }
  return source;
}

function publicSourceInfo(
  command: Record<string, unknown>,
  resourceId: string | undefined,
): ServerProviderSlashCommandSourceInfo {
  const raw = isRecord(command.sourceInfo) ? command.sourceInfo : {};
  const source = safeSourceProvenance(raw.source);
  const scope = normalizeScope(boundedString(raw.scope ?? command.location));
  const rawOrigin = boundedString(raw.origin);
  const origin = rawOrigin && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(rawOrigin) ? rawOrigin : undefined;
  return {
    ...(resourceId ? { path: resourceId } : {}),
    ...(source ? { source } : {}),
    ...(scope ? { scope } : {}),
    ...(origin ? { origin } : {}),
  };
}

/**
 * Maps only resources Pi reports as RPC-invocable. TUI built-ins are never
 * synthesized. Raw environment paths remain in host-only metadata records;
 * wire contracts receive opaque IDs.
 */
export function parsePiDiscoveredResources(data: unknown): PiDiscoveredResources {
  const commands = isRecord(data) && Array.isArray(data.commands) ? data.commands : [];
  const slashCommands: ServerProviderSlashCommand[] = [];
  const skills: ServerProviderSkill[] = [];
  const resourceFiles = new Map<string, PiResourceFile>();
  const resourceIdsByHostPath = new Map<string, string>();
  const commandNames = new Set<string>();
  const skillNames = new Set<string>();

  for (const candidate of commands.slice(0, MAX_PI_DISCOVERED_RESOURCES)) {
    if (!isRecord(candidate)) continue;
    const source = sourceOf(candidate);
    const commandName = boundedString(candidate.name, 256);
    if (!source || !commandName) continue;
    const rawSourceInfo = isRecord(candidate.sourceInfo) ? candidate.sourceInfo : {};
    const hostPath = boundedString(rawSourceInfo.path ?? candidate.path);
    const resourceId = hostPath
      ? (resourceIdsByHostPath.get(hostPath) ?? `pi-resource:${resourceFiles.size + 1}`)
      : undefined;
    const info = publicSourceInfo(candidate, resourceId);
    const description = boundedString(candidate.description);

    if (source === "skill") {
      const name = commandName.startsWith("skill:")
        ? commandName.slice("skill:".length)
        : commandName;
      const normalizedName = name.toLowerCase();
      if (!name || skillNames.has(normalizedName)) continue;
      skillNames.add(normalizedName);
      if (hostPath && resourceId) {
        resourceFiles.set(resourceId, { id: resourceId, hostPath });
        resourceIdsByHostPath.set(hostPath, resourceId);
      }
      skills.push({
        name,
        path: resourceId ?? `pi:skill:${name}`,
        enabled: true,
        ...(description ? { description } : {}),
        ...(info.scope ? { scope: info.scope } : {}),
      });
      continue;
    }

    const normalizedName = commandName.toLowerCase();
    if (commandNames.has(normalizedName)) continue;
    commandNames.add(normalizedName);
    if (hostPath && resourceId) {
      resourceFiles.set(resourceId, { id: resourceId, hostPath });
      resourceIdsByHostPath.set(hostPath, resourceId);
    }
    slashCommands.push({
      name: commandName,
      ...(description ? { description } : {}),
      sourceInfo: info,
    });
  }

  return { slashCommands, skills, resourceFiles: [...resourceFiles.values()] };
}

function parseJsonRecord(contents: string): Record<string, unknown> | undefined {
  try {
    const parsed = decodeUnknownJsonString(contents);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseFrontmatter(contents: string): Record<string, unknown> | undefined {
  const match = FRONTMATTER_PATTERN.exec(contents);
  if (!match) return undefined;
  try {
    const parsed = parseYaml(match[1] ?? "");
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Stat, open, and read no more than the caller's explicit byte limit. */
export const readPiResourceFileBounded = Effect.fn("readPiResourceFileBounded")(function* (
  resourcePath: string,
  maxBytes = MAX_PI_RESOURCE_FILE_BYTES,
): Effect.fn.Return<string | undefined, never, FileSystem.FileSystem> {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const file = yield* fileSystem.open(resourcePath, { flag: "r" });
      const info = yield* file.stat;
      if (info.type !== "File" || Number(info.size) > maxBytes) return undefined;
      const bytes = yield* file.readAlloc(maxBytes + 1);
      if (Option.isNone(bytes) || bytes.value.byteLength > maxBytes) return undefined;
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.value);
    }),
  ).pipe(Effect.orElseSucceed(() => undefined));
});

/** Enrich Pi's authoritative list under fixed file-count and aggregate budgets. */
export const enrichPiDiscoveredResources = Effect.fn("enrichPiDiscoveredResources")(function* (
  discovered: PiDiscoveredResources,
): Effect.fn.Return<PiDiscoveredResources, never, FileSystem.FileSystem> {
  const metadataById = new Map<string, Record<string, unknown> | undefined>();
  let remainingBytes = MAX_PI_RESOURCE_METADATA_BYTES;
  for (const resource of discovered.resourceFiles.slice(0, MAX_PI_RESOURCE_METADATA_FILES)) {
    if (remainingBytes <= 0) break;
    const maxBytes = Math.min(MAX_PI_RESOURCE_FILE_BYTES, remainingBytes);
    const contents = yield* readPiResourceFileBounded(resource.hostPath, maxBytes);
    if (contents === undefined) continue;
    remainingBytes -= new TextEncoder().encode(contents).byteLength;
    metadataById.set(resource.id, parseFrontmatter(contents));
  }

  const slashCommands = discovered.slashCommands.map((command) => {
    const metadata = command.sourceInfo?.path
      ? metadataById.get(command.sourceInfo.path)
      : undefined;
    const hint = boundedString(metadata?.["argument-hint"], 512);
    return hint ? { ...command, input: { hint } } : command;
  });
  const skills = discovered.skills.map((skill) => {
    const metadata = metadataById.get(skill.path);
    const description = boundedString(metadata?.description);
    return {
      ...skill,
      ...(description ? { description } : {}),
      // Pi 0.84.4 supports only a literal YAML boolean true here.
      ...(metadata?.["disable-model-invocation"] === true ? { userInvocationOnly: true } : {}),
    };
  });
  return { ...discovered, slashCommands, skills };
});

export function parsePiProjectTrustOverride(
  launchArgs: ReadonlyArray<string>,
): boolean | undefined {
  let override: boolean | undefined;
  for (const argument of launchArgs) {
    if (argument === "--") break;
    if (argument === "--approve" || argument === "-a") override = true;
    if (argument === "--no-approve" || argument === "-na") override = false;
  }
  return override;
}

function agentDirectory(
  path: Path.Path,
  input: {
    readonly homePath: string;
    readonly cwd: string;
    readonly environment: Record<string, string | undefined>;
  },
): string | undefined {
  const configured = input.homePath.trim() || input.environment.PI_CODING_AGENT_DIR?.trim();
  if (configured) return path.resolve(input.cwd, configured);
  const home = input.environment.HOME?.trim() || input.environment.USERPROFILE?.trim();
  return home ? path.join(home, ".pi", "agent") : undefined;
}

/**
 * Reports supported evidence without claiming Pi's unobservable effective
 * trust. User/global extensions run before saved/default trust and may own the
 * decision, so static-file outcomes are explicitly marked partial.
 */
export const discoverPiProjectTrust = Effect.fn("discoverPiProjectTrust")(function* (input: {
  readonly homePath: string;
  readonly cwd: string;
  readonly environment: Record<string, string | undefined>;
  readonly launchArgs: ReadonlyArray<string>;
  readonly observedProjectResources: boolean;
}): Effect.fn.Return<PiProjectTrustDiagnostic, never, FileSystem.FileSystem | Path.Path> {
  const override = parsePiProjectTrustOverride(input.launchArgs);
  if (override !== undefined) return override ? "explicit-approved" : "explicit-rejected";
  if (input.observedProjectResources) return "observed-project-resources";

  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = agentDirectory(path, input);
  if (!directory) return "unknown";
  const [trustContents, settingsContents, canonicalCwd] = yield* Effect.all([
    readPiResourceFileBounded(path.join(directory, "trust.json")),
    readPiResourceFileBounded(path.join(directory, "settings.json")),
    fileSystem
      .realPath(path.resolve(input.cwd))
      .pipe(Effect.orElseSucceed(() => path.resolve(input.cwd))),
  ]);
  const trust = trustContents === undefined ? {} : parseJsonRecord(trustContents);
  if (trustContents !== undefined && !trust) return "unknown";
  for (let current = canonicalCwd; ; current = path.dirname(current)) {
    const decision = trust?.[current];
    if (decision === true) return "configured-saved-approved-partial";
    if (decision === false) return "configured-saved-rejected-partial";
    const parent = path.dirname(current);
    if (parent === current) break;
  }
  const settings = settingsContents === undefined ? {} : parseJsonRecord(settingsContents);
  if (settingsContents !== undefined && !settings) return "unknown";
  switch (settings?.defaultProjectTrust) {
    case "always":
      return "configured-default-always-partial";
    case "never":
      return "configured-default-never-partial";
    case undefined:
    case "ask":
      return "configured-default-ask-partial";
    default:
      return "unknown";
  }
});

/** Translate only known T3 `$skill` picks to Pi's native leading command. */
export function expandPiSkillReferences(text: string, skillNames: ReadonlySet<string>): string {
  const references = /(^|\s)\$([^\s]+)(?=\s|$)/g;
  const found: Array<{ readonly name: string; readonly start: number; readonly end: number }> = [];
  for (const match of text.matchAll(references)) {
    const name = match[2];
    if (name === undefined || !skillNames.has(name) || match.index === undefined) continue;
    const start = match.index + (match[1]?.length ?? 0);
    found.push({ name, start, end: start + name.length + 1 });
  }
  if (found.length === 0) return text;

  const names: string[] = [];
  const seen = new Set<string>();
  for (const reference of found) {
    if (seen.has(reference.name)) continue;
    seen.add(reference.name);
    names.push(reference.name);
  }
  let body = text;
  for (const reference of found.toReversed()) {
    body = `${body.slice(0, reference.start)}${body.slice(reference.end)}`;
  }
  body = body.replace(/\s+/g, " ").trim();
  const prefix = names.map((name) => `/skill:${name}`).join(" ");
  return body ? `${prefix} ${body}` : prefix;
}

/** Host-only cache fingerprint; raw paths are hashed and never published. */
export function piResourceFingerprint(input: {
  readonly settings: string;
  readonly resources: PiDiscoveredResources;
}): string {
  const commandFields = input.resources.slashCommands.flatMap((command) => [
    command.name,
    command.description ?? "",
    command.input?.hint ?? "",
    command.sourceInfo?.path ?? "",
    command.sourceInfo?.source ?? "",
    command.sourceInfo?.scope ?? "",
    command.sourceInfo?.origin ?? "",
  ]);
  const skillFields = input.resources.skills.flatMap((skill) => [
    skill.name,
    skill.description ?? "",
    skill.path,
    skill.scope ?? "",
    String(skill.enabled),
    String(skill.userInvocationOnly ?? false),
  ]);
  return [
    input.settings,
    input.resources.projectTrust ?? "unknown",
    ...input.resources.resourceFiles.map((resource) => resource.hostPath),
    ...commandFields,
    ...skillFields,
  ]
    .map((field) => `${field.length}:${field}`)
    .join("|");
}
