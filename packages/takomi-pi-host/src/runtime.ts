// @effect-diagnostics nodeBuiltinImport:off - This isolated host validates a package tree before an Effect runtime or Pi session exists.
import * as ChildProcess from "node:child_process";
import * as Crypto from "node:crypto";
import * as FileSystem from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { pathToFileURL } from "node:url";
import * as Zlib from "node:zlib";

const PACKAGE_NAME = "takomi";
const PI_PACKAGE_NAME = "@earendil-works/pi-coding-agent";
const PI_SUBAGENTS_PACKAGE_NAME = "pi-subagents";
const COMPATIBILITY_FILE = ".pi/extensions/takomi-subagents/pi-subagents-compatibility.json";
const EXCLUDED_DIRECTORIES = new Set([".git", "node_modules"]);
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_PACKED_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_UNPACKED_ARTIFACT_BYTES = 128 * 1024 * 1024;
const MAX_PAX_RECORD_BYTES = 1024 * 1024;

export interface RuntimeProvenance {
  readonly canonicalSource: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly dirty: boolean;
  readonly packedSha256: string;
}

export interface PrivateModuleCompatibility {
  readonly specifier: string;
  readonly requiredExports: ReadonlyArray<string>;
  /** Bound into runtime manifests after hashing the canonical private module. */
  readonly contentSha256?: string;
}

export interface PiSubagentsCompatibility {
  readonly schemaVersion: 1;
  readonly piVersion: string;
  readonly piSubagentsVersion: string;
  readonly privateModules: ReadonlyArray<PrivateModuleCompatibility>;
}

export interface PinnedPackage {
  readonly name: string;
  readonly version: string;
  readonly packageJsonSha256: string;
}

export interface ResolvedPackage extends PinnedPackage {
  /** Host-local diagnostic only. Never include this in a client contract. */
  readonly path: string;
}

export interface RuntimePackageManifest {
  readonly schemaVersion: 1;
  readonly provenance: RuntimeProvenance;
  readonly compatibility: PiSubagentsCompatibility;
  readonly package: {
    readonly name: string;
    readonly version: string;
    readonly license: string;
    readonly packageJsonSha256: string;
  };
  readonly dependencies: {
    readonly pi: PinnedPackage;
    readonly piSubagents: PinnedPackage;
  };
  /** Hashes of regular files in the packed package, relative to its package root. */
  readonly files: Readonly<Record<string, string>>;
}

export interface RuntimeVerificationInput {
  readonly canonicalSource: string;
  readonly packedArtifact: string;
  readonly extractedPackage: string;
  readonly installedPackage: string;
}

export interface DependencyDiagnostics {
  readonly pi: {
    readonly candidates: ReadonlyArray<ResolvedPackage>;
    readonly selected: ResolvedPackage;
  };
  readonly piSubagents: {
    readonly candidates: ReadonlyArray<ResolvedPackage>;
    readonly selected: ResolvedPackage;
  };
}

export interface RuntimeVerificationResult {
  readonly manifest: RuntimePackageManifest;
  /** This information is for the environment host's diagnostics, never clients. */
  readonly diagnostics: DependencyDiagnostics;
}

export interface OwnershipDiff {
  /** Files newly owned by the next package manifest. */
  readonly added: ReadonlyArray<string>;
  /** Previously owned files whose expected content changed. */
  readonly changed: ReadonlyArray<string>;
  /** Previously owned files absent from the next package manifest. */
  readonly removed: ReadonlyArray<string>;
}

export interface OwnershipInspection {
  /** Expected regular files that are missing, non-regular, or hash-mismatched. */
  readonly conflicted: ReadonlyArray<string>;
  /** Actual entries not named by the ownership manifest. */
  readonly unmanaged: ReadonlyArray<string>;
  /** Symlinks and other non-regular entries; they are never traversed. */
  readonly unsafe: ReadonlyArray<string>;
}

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
}

interface PackageTree {
  readonly files: Readonly<Record<string, string>>;
  readonly unsafe: ReadonlyArray<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, description: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Runtime package ${description} must be a non-empty string.`);
  }
  return value;
}

function readExactVersion(value: unknown, description: string): string {
  const version = readString(value, description);
  if (!EXACT_VERSION.test(version)) {
    throw new Error(
      `Runtime package ${description} must be an exact version, received '${version}'.`,
    );
  }
  return version;
}

function readStringArray(value: unknown, description: string): ReadonlyArray<string> {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error(`Runtime package ${description} must be an array of non-empty strings.`);
  }
  return value;
}

function readStringRecord(value: unknown, description: string): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === "string" ? [[key, entry] as const] : [],
  );
  if (entries.length !== Object.keys(value).length) {
    throw new Error(`Runtime package ${description} must contain only string values.`);
  }
  return Object.fromEntries(entries);
}

function sha256(value: Uint8Array): string {
  return Crypto.createHash("sha256").update(value).digest("hex");
}

async function hashFile(path: string): Promise<string> {
  return sha256(await FileSystem.readFile(path));
}

function safeRelativePath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe package path '${path}'.`);
  }
  return normalized;
}

async function readPackageJson(packageRoot: string): Promise<PackageJson> {
  const path = Path.join(packageRoot, "package.json");
  const parsed: unknown = JSON.parse(await FileSystem.readFile(path, "utf8"));
  if (!isRecord(parsed)) throw new Error(`Runtime package manifest '${path}' must be an object.`);

  return {
    name: readString(parsed.name, "name"),
    version: readExactVersion(parsed.version, "version"),
    license: readString(parsed.license, "license"),
    dependencies: readStringRecord(parsed.dependencies, "dependencies"),
    devDependencies: readStringRecord(parsed.devDependencies, "devDependencies"),
  };
}

async function requireLicenseFile(packageRoot: string): Promise<void> {
  const license = Path.join(packageRoot, "LICENSE");
  const stat = await FileSystem.lstat(license).catch(() => undefined);
  if (stat === undefined || !stat.isFile()) {
    throw new Error(`Runtime package '${packageRoot}' must include a regular LICENSE file.`);
  }
}

async function scanPackageTree(root: string, current = root): Promise<PackageTree> {
  const files: Record<string, string> = {};
  const unsafe: Array<string> = [];
  const entries = await FileSystem.readdir(current, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const path = Path.join(current, entry.name);
    const relativePath = safeRelativePath(Path.relative(root, path));
    if (entry.isDirectory()) {
      const nested = await scanPackageTree(root, path);
      Object.assign(files, nested.files);
      unsafe.push(...nested.unsafe);
    } else if (entry.isFile()) {
      files[relativePath] = await hashFile(path);
    } else {
      // Dirent/lstat identifies links without resolving their target. In particular,
      // a link to a path outside this package is never read or traversed.
      unsafe.push(relativePath);
    }
  }

  return { files, unsafe: unsafe.sort() };
}

async function readCompatibility(packageRoot: string): Promise<PiSubagentsCompatibility> {
  const path = Path.join(packageRoot, COMPATIBILITY_FILE);
  const parsed: unknown = JSON.parse(await FileSystem.readFile(path, "utf8"));
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.privateModules)) {
    throw new Error(`Runtime compatibility manifest '${path}' is invalid.`);
  }

  const privateModules = parsed.privateModules.map((entry, index): PrivateModuleCompatibility => {
    if (!isRecord(entry)) throw new Error(`Runtime private module ${index} is invalid.`);
    const specifier = readString(entry.specifier, `private module ${index} specifier`);
    if (!/^pi-subagents\/.+\.ts$/.test(specifier)) {
      throw new Error(
        `Runtime private module specifier '${specifier}' is not a pi-subagents TypeScript module.`,
      );
    }
    const requiredExports = readStringArray(
      entry.requiredExports,
      `private module ${index} required exports`,
    );
    if (requiredExports.length === 0) {
      throw new Error(`Runtime private module '${specifier}' must require at least one export.`);
    }
    const contentSha256 = entry.contentSha256;
    if (
      contentSha256 !== undefined &&
      (typeof contentSha256 !== "string" || !SHA256.test(contentSha256))
    ) {
      throw new Error(`Runtime private module '${specifier}' has an invalid content hash.`);
    }
    return contentSha256 === undefined
      ? { specifier, requiredExports }
      : { specifier, requiredExports, contentSha256 };
  });
  if (privateModules.length === 0)
    throw new Error("Runtime compatibility privateModules cannot be empty.");

  return {
    schemaVersion: 1,
    piVersion: readExactVersion(parsed.piVersion, "compatibility Pi version"),
    piSubagentsVersion: readExactVersion(
      parsed.piSubagentsVersion,
      "compatibility pi-subagents version",
    ),
    privateModules,
  };
}

function requiredDependencyVersion(
  packageJson: PackageJson,
  dependency: string,
  source: Readonly<Record<string, string>>,
): string {
  const version = source[dependency];
  if (version === undefined) throw new Error(`Runtime package must declare '${dependency}'.`);
  return readExactVersion(version, `dependency '${dependency}'`);
}

function assertPackageCompatibility(
  packageJson: PackageJson,
  compatibility: PiSubagentsCompatibility,
): void {
  if (packageJson.name !== PACKAGE_NAME) {
    throw new Error(`Runtime package must be '${PACKAGE_NAME}', received '${packageJson.name}'.`);
  }
  const piVersion = requiredDependencyVersion(
    packageJson,
    PI_PACKAGE_NAME,
    packageJson.devDependencies,
  );
  const piSubagentsVersion = requiredDependencyVersion(
    packageJson,
    PI_SUBAGENTS_PACKAGE_NAME,
    packageJson.dependencies,
  );
  if (
    piVersion !== compatibility.piVersion ||
    piSubagentsVersion !== compatibility.piSubagentsVersion
  ) {
    throw new Error(
      "Runtime package dependencies do not match its canonical Pi compatibility manifest.",
    );
  }
}

function equalCompatibility(
  left: PiSubagentsCompatibility,
  right: PiSubagentsCompatibility,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.piVersion === right.piVersion &&
    left.piSubagentsVersion === right.piSubagentsVersion &&
    left.privateModules.length === right.privateModules.length &&
    left.privateModules.every((module, index) => {
      const other = right.privateModules[index];
      return (
        other !== undefined &&
        module.specifier === other.specifier &&
        JSON.stringify(module.requiredExports) === JSON.stringify(other.requiredExports) &&
        (module.contentSha256 === undefined ||
          other.contentSha256 === undefined ||
          module.contentSha256 === other.contentSha256)
      );
    })
  );
}

function assertBoundCompatibility(compatibility: PiSubagentsCompatibility): void {
  for (const privateModule of compatibility.privateModules) {
    if (privateModule.contentSha256 === undefined || !SHA256.test(privateModule.contentSha256)) {
      throw new Error(
        `Runtime private module '${privateModule.specifier}' is missing its content hash.`,
      );
    }
  }
}

function readTarString(block: Uint8Array, offset: number, length: number): string {
  return Buffer.from(block.subarray(offset, offset + length))
    .toString("utf8")
    .replace(/\0.*$/, "");
}

function readTarSize(block: Uint8Array): number {
  const text = readTarString(block, 124, 12).trim();
  if (text.length === 0) return 0;
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Packed artifact has an invalid tar size.");
  return value;
}

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((value) => value === 0);
}

function paxPath(content: Uint8Array): string | undefined {
  let offset = 0;
  let path: string | undefined;

  while (offset < content.length) {
    let cursor = offset;
    let length = 0;
    while (cursor < content.length && content[cursor] !== 0x20) {
      const byte = content[cursor];
      if (byte === undefined || byte < 0x30 || byte > 0x39) {
        throw new Error("Packed artifact has an invalid PAX header.");
      }
      const digit = byte - 0x30;
      if (length > Math.floor((MAX_PAX_RECORD_BYTES - digit) / 10)) {
        throw new Error("Packed artifact has an oversized PAX header record.");
      }
      length = length * 10 + digit;
      cursor += 1;
    }
    if (cursor === offset || cursor === content.length) {
      throw new Error("Packed artifact has an invalid PAX header.");
    }

    const recordEnd = offset + length;
    if (recordEnd > content.length || content[recordEnd - 1] !== 0x0a) {
      throw new Error("Packed artifact has an invalid PAX header length.");
    }
    const valueStart = cursor + 1;
    const valueEnd = recordEnd - 1;
    const separator = content.indexOf(0x3d, valueStart);
    if (separator <= valueStart || separator >= valueEnd) {
      throw new Error("Packed artifact has an invalid PAX header.");
    }
    if (
      separator - valueStart === 4 &&
      content[valueStart] === 0x70 &&
      content[valueStart + 1] === 0x61 &&
      content[valueStart + 2] === 0x74 &&
      content[valueStart + 3] === 0x68
    ) {
      path = Buffer.from(content.subarray(separator + 1, valueEnd)).toString("utf8");
    }
    offset = recordEnd;
  }
  return path;
}

async function readPackedFiles(artifactPath: string): Promise<Readonly<Record<string, string>>> {
  const artifactStat = await FileSystem.stat(artifactPath);
  if (!artifactStat.isFile() || artifactStat.size > MAX_PACKED_ARTIFACT_BYTES) {
    throw new Error("Packed artifact exceeds the maximum supported size.");
  }
  const archive = Zlib.gunzipSync(await FileSystem.readFile(artifactPath), {
    maxOutputLength: MAX_UNPACKED_ARTIFACT_BYTES,
  });
  const files: Record<string, string> = {};
  let offset = 0;
  let globalPath: string | undefined;
  let nextPath: string | undefined;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (isZeroBlock(header)) break;
    const size = readTarSize(header);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    if (contentEnd > archive.length) throw new Error("Packed artifact ends inside a tar entry.");

    const type = readTarString(header, 156, 1) || "0";
    const headerPath = [readTarString(header, 345, 155), readTarString(header, 0, 100)]
      .filter((part) => part.length > 0)
      .join("/");
    const rawPath = nextPath ?? globalPath ?? headerPath;
    nextPath = undefined;

    if (type === "g") {
      const path = paxPath(archive.subarray(contentStart, contentEnd));
      if (path !== undefined) globalPath = path;
    } else if (type === "x") {
      nextPath = paxPath(archive.subarray(contentStart, contentEnd));
    } else if (type === "L") {
      nextPath = readTarString(archive.subarray(contentStart, contentEnd), 0, size);
    } else if (type !== "5") {
      if (type !== "0")
        throw new Error(`Packed artifact contains unsupported entry type '${type}'.`);
      if (!rawPath.startsWith("package/")) {
        throw new Error(`Packed artifact entry '${rawPath}' is outside its package root.`);
      }
      const relativePath = safeRelativePath(rawPath.slice("package/".length));
      if (files[relativePath] !== undefined)
        throw new Error(`Packed artifact duplicates '${relativePath}'.`);
      files[relativePath] = sha256(archive.subarray(contentStart, contentEnd));
    }
    const nextOffset = contentStart + Math.ceil(size / 512) * 512;
    if (nextOffset > archive.length)
      throw new Error("Packed artifact ends inside tar entry padding.");
    offset = nextOffset;
  }

  if (Object.keys(files).length === 0)
    throw new Error("Packed artifact contains no regular package files.");
  return files;
}

async function git(canonicalSource: string, args: ReadonlyArray<string>): Promise<string> {
  const result = await new Promise<{ readonly stdout: string; readonly stderr: string }>(
    (resolve, reject) => {
      ChildProcess.execFile("git", ["-C", canonicalSource, ...args], (error, stdout, stderr) => {
        if (error !== null)
          reject(new Error(`Cannot inspect canonical source with git: ${stderr || error.message}`));
        else resolve({ stdout, stderr });
      });
    },
  );
  return result.stdout.trim();
}

async function readCanonicalState(canonicalSource: string): Promise<{
  readonly canonicalSource: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly dirty: boolean;
}> {
  const root = await FileSystem.realpath(canonicalSource);
  const [sourceCommit, sourceTree, status] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["rev-parse", "HEAD^{tree}"]),
    git(root, ["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  return { canonicalSource: root, sourceCommit, sourceTree, dirty: status.length > 0 };
}

async function assertCanonicalFiles(
  canonicalSource: string,
  packedFiles: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [relativePath, expectedHash] of Object.entries(packedFiles)) {
    const path = Path.join(canonicalSource, relativePath);
    const stat = await FileSystem.lstat(path).catch(() => undefined);
    if (stat === undefined || !stat.isFile() || (await hashFile(path)) !== expectedHash) {
      throw new Error(`Canonical source does not match packed file '${relativePath}'.`);
    }
  }
}

function formatInspection(inspection: OwnershipInspection): string {
  return `conflicted: ${inspection.conflicted.join(", ") || "none"}; unmanaged: ${inspection.unmanaged.join(", ") || "none"}; unsafe: ${inspection.unsafe.join(", ") || "none"}`;
}

async function assertOwnedTree(
  packageRoot: string,
  expectedFiles: Readonly<Record<string, string>>,
  description: string,
): Promise<void> {
  const inspection = await inspectOwnership(packageRoot, expectedFiles);
  if (
    inspection.conflicted.length > 0 ||
    inspection.unmanaged.length > 0 ||
    inspection.unsafe.length > 0
  ) {
    throw new Error(`${description} file integrity failed (${formatInspection(inspection)}).`);
  }
}

function resolutionBoundary(packageRoot: string): string {
  let directory = packageRoot;
  while (true) {
    if (Path.basename(directory) === "node_modules") return Path.dirname(directory);
    const parent = Path.dirname(directory);
    if (parent === directory) return packageRoot;
    directory = parent;
  }
}

async function dependencyCandidates(
  packageRoot: string,
  packageName: string,
): Promise<ReadonlyArray<ResolvedPackage>> {
  const candidates: Array<ResolvedPackage> = [];
  const seen = new Set<string>();
  const boundary = resolutionBoundary(packageRoot);
  let directory = packageRoot;
  while (true) {
    const packageJsonPath = Path.join(directory, "node_modules", packageName, "package.json");
    const stat = await FileSystem.lstat(packageJsonPath).catch(() => undefined);
    if (stat?.isFile()) {
      const path = await FileSystem.realpath(Path.dirname(packageJsonPath));
      if (!seen.has(path)) {
        seen.add(path);
        const parsed: unknown = JSON.parse(await FileSystem.readFile(packageJsonPath, "utf8"));
        if (!isRecord(parsed))
          throw new Error(`Resolved package manifest '${packageJsonPath}' must be an object.`);
        candidates.push({
          name: readString(parsed.name, `resolved ${packageName} name`),
          version: readExactVersion(parsed.version, `resolved ${packageName} version`),
          packageJsonSha256: await hashFile(packageJsonPath),
          path,
        });
      }
    }
    if (directory === boundary) break;
    const parent = Path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return candidates;
}

async function resolvePinnedPackage(
  packageRoot: string,
  expected: PinnedPackage,
): Promise<{
  readonly candidates: ReadonlyArray<ResolvedPackage>;
  readonly selected: ResolvedPackage;
}> {
  const candidates = await dependencyCandidates(packageRoot, expected.name);
  if (candidates.length === 0)
    throw new Error(`Runtime package cannot resolve '${expected.name}' from '${packageRoot}'.`);
  for (const candidate of candidates) {
    if (candidate.name !== expected.name || candidate.version !== expected.version) {
      throw new Error(
        `Resolved '${expected.name}' must be '${expected.name}@${expected.version}', received '${candidate.name}@${candidate.version}' at '${candidate.path}'.`,
      );
    }
  }
  if (candidates.length !== 1) {
    throw new Error(
      `Runtime package has ambiguous '${expected.name}' installations: ${candidates.map((candidate) => candidate.path).join(", ")}.`,
    );
  }
  const selected = candidates[0];
  if (selected === undefined) throw new Error(`Runtime package cannot resolve '${expected.name}'.`);
  if (
    expected.packageJsonSha256.length > 0 &&
    selected.packageJsonSha256 !== expected.packageJsonSha256
  ) {
    throw new Error(
      `Resolved '${expected.name}' package metadata integrity does not match canonical source.`,
    );
  }
  return { candidates, selected };
}

async function publicImportEntryPoint(resolvedPackage: ResolvedPackage): Promise<string> {
  const packageJsonPath = Path.join(resolvedPackage.path, "package.json");
  const parsed: unknown = JSON.parse(await FileSystem.readFile(packageJsonPath, "utf8"));
  if (!isRecord(parsed))
    throw new Error(`Resolved package manifest '${packageJsonPath}' must be an object.`);
  if (
    readString(parsed.name, `resolved ${resolvedPackage.name} name`) !== resolvedPackage.name ||
    readExactVersion(parsed.version, `resolved ${resolvedPackage.name} version`) !==
      resolvedPackage.version ||
    (await hashFile(packageJsonPath)) !== resolvedPackage.packageJsonSha256
  ) {
    throw new Error(
      `Resolved '${resolvedPackage.name}' package identity changed before conformance loading.`,
    );
  }

  const exports = parsed.exports;
  const rootExport = isRecord(exports) && Object.hasOwn(exports, ".") ? exports["."] : exports;
  const target = publicImportTarget(rootExport);
  if (target === undefined) {
    throw new Error(
      `Resolved '${resolvedPackage.name}' does not expose an importable public entry point.`,
    );
  }
  if (!target.startsWith("./")) {
    throw new Error(
      `Resolved '${resolvedPackage.name}' has an unsafe public export target '${target}'.`,
    );
  }

  const entryPoint = Path.join(resolvedPackage.path, safeRelativePath(target.slice(2)));
  const [root, resolvedEntryPoint, stat] = await Promise.all([
    FileSystem.realpath(resolvedPackage.path),
    FileSystem.realpath(entryPoint),
    FileSystem.stat(entryPoint).catch(() => undefined),
  ]);
  const relativeEntryPoint = Path.relative(root, resolvedEntryPoint);
  if (
    stat === undefined ||
    !stat.isFile() ||
    relativeEntryPoint === "" ||
    relativeEntryPoint === ".." ||
    relativeEntryPoint.startsWith(`..${Path.sep}`) ||
    Path.isAbsolute(relativeEntryPoint)
  ) {
    throw new Error(
      `Resolved '${resolvedPackage.name}' public entry point is outside its package root.`,
    );
  }
  return resolvedEntryPoint;
}

function publicImportTarget(exports: unknown): string | undefined {
  if (typeof exports === "string") return exports;
  if (!isRecord(exports)) return undefined;

  const rootExport = Object.hasOwn(exports, ".") ? exports["."] : undefined;
  if (rootExport !== undefined) return publicImportTarget(rootExport);

  for (const condition of ["node", "import", "default"]) {
    const target = exports[condition];
    const resolved = publicImportTarget(target);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

async function privateModulePath(
  piSubagents: ResolvedPackage,
  privateModule: PrivateModuleCompatibility,
): Promise<string> {
  const relativePath = safeRelativePath(privateModule.specifier.slice("pi-subagents/".length));
  const path = Path.join(piSubagents.path, relativePath);
  const stat = await FileSystem.lstat(path).catch(() => undefined);
  if (stat === undefined || !stat.isFile()) {
    throw new Error(
      `Resolved pi-subagents is missing private module '${privateModule.specifier}'.`,
    );
  }
  return path;
}

async function bindPrivateModuleContents(
  piSubagents: ResolvedPackage,
  compatibility: PiSubagentsCompatibility,
): Promise<PiSubagentsCompatibility> {
  const privateModules = await Promise.all(
    compatibility.privateModules.map(async (privateModule): Promise<PrivateModuleCompatibility> => {
      const contentSha256 = await hashFile(await privateModulePath(piSubagents, privateModule));
      if (
        privateModule.contentSha256 !== undefined &&
        privateModule.contentSha256 !== contentSha256
      ) {
        throw new Error(
          `Resolved pi-subagents private module '${privateModule.specifier}' content does not match runtime provenance.`,
        );
      }
      return { ...privateModule, contentSha256 };
    }),
  );
  return { ...compatibility, privateModules };
}

interface PiExtensionResult {
  readonly errors: ReadonlyArray<{ readonly error: string }>;
}

interface PiExtensionLoader {
  reload(): Promise<void>;
  getExtensions(): PiExtensionResult;
}

interface PiExtensionLoaderConstructor {
  new (options: {
    readonly cwd: string;
    readonly agentDir: string;
    readonly additionalExtensionPaths: ReadonlyArray<string>;
    readonly noContextFiles: true;
    readonly noExtensions: true;
    readonly noPromptTemplates: true;
    readonly noSkills: true;
    readonly noThemes: true;
  }): PiExtensionLoader;
}

async function assertPrivateModuleExports(
  pi: ResolvedPackage,
  piSubagents: ResolvedPackage,
  compatibility: PiSubagentsCompatibility,
): Promise<void> {
  const directory = await FileSystem.mkdtemp(Path.join(Os.tmpdir(), "takomi-pi-conformance-"));
  try {
    const imports = await Promise.all(
      compatibility.privateModules.map(async (privateModule, index) => {
        const path = await privateModulePath(piSubagents, privateModule);
        return `import * as privateModule${index} from ${JSON.stringify(pathToFileURL(path).href)};`;
      }),
    );
    const assertions = compatibility.privateModules.flatMap((privateModule, index) =>
      privateModule.requiredExports.map(
        (exportName) =>
          `if (!Object.hasOwn(privateModule${index}, ${JSON.stringify(exportName)})) throw new Error(${JSON.stringify(`Resolved pi-subagents private module '${privateModule.specifier}' is missing '${exportName}'.`)});`,
      ),
    );
    const extensionPath = Path.join(directory, "private-module-conformance.ts");
    await FileSystem.writeFile(
      extensionPath,
      `${imports.join("\n")}\n${assertions.join("\n")}\nexport default function conformanceExtension() {}\n`,
    );

    const piEntryPoint = await publicImportEntryPoint(pi);
    const piModule: unknown = await import(pathToFileURL(piEntryPoint).href);
    if (!isRecord(piModule) || typeof piModule.DefaultResourceLoader !== "function") {
      throw new Error(
        `Resolved '${PI_PACKAGE_NAME}' does not expose its public DefaultResourceLoader.`,
      );
    }
    const loader = new (piModule.DefaultResourceLoader as PiExtensionLoaderConstructor)({
      cwd: directory,
      agentDir: directory,
      additionalExtensionPaths: [extensionPath],
      noContextFiles: true,
      noExtensions: true,
      noPromptTemplates: true,
      noSkills: true,
      noThemes: true,
    });
    await loader.reload();
    const errors = loader.getExtensions().errors;
    if (errors.length > 0) {
      throw new Error(
        `Pi extension-loader conformance failed: ${errors.map((error) => error.error).join("; ")}`,
      );
    }
  } finally {
    await FileSystem.rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}

async function assertPrivateModuleCompatibility(
  pi: ResolvedPackage,
  piSubagents: ResolvedPackage,
  compatibility: PiSubagentsCompatibility,
): Promise<void> {
  await bindPrivateModuleContents(piSubagents, compatibility);
  await assertPrivateModuleExports(pi, piSubagents, compatibility);
}

async function resolvePinnedDependencies(
  packageRoot: string,
  dependencies: RuntimePackageManifest["dependencies"],
): Promise<DependencyDiagnostics> {
  const [pi, piSubagents] = await Promise.all([
    resolvePinnedPackage(packageRoot, dependencies.pi),
    resolvePinnedPackage(packageRoot, dependencies.piSubagents),
  ]);
  return { pi, piSubagents };
}

async function resolveDependencies(
  packageRoot: string,
  dependencies: RuntimePackageManifest["dependencies"],
  compatibility: PiSubagentsCompatibility,
): Promise<DependencyDiagnostics> {
  const diagnostics = await resolvePinnedDependencies(packageRoot, dependencies);
  await assertPrivateModuleCompatibility(
    diagnostics.pi.selected,
    diagnostics.piSubagents.selected,
    compatibility,
  );
  return diagnostics;
}

function pinnedPackage(resolved: ResolvedPackage): PinnedPackage {
  return {
    name: resolved.name,
    version: resolved.version,
    packageJsonSha256: resolved.packageJsonSha256,
  };
}

async function canonicalPackageInputs(canonicalSource: string): Promise<{
  readonly packageJson: PackageJson;
  readonly compatibility: PiSubagentsCompatibility;
  readonly dependencies: RuntimePackageManifest["dependencies"];
}> {
  const [packageJson, compatibility] = await Promise.all([
    readPackageJson(canonicalSource),
    readCompatibility(canonicalSource),
  ]);
  await requireLicenseFile(canonicalSource);
  assertPackageCompatibility(packageJson, compatibility);
  const diagnostics = await resolvePinnedDependencies(canonicalSource, {
    pi: { name: PI_PACKAGE_NAME, version: compatibility.piVersion, packageJsonSha256: "" },
    piSubagents: {
      name: PI_SUBAGENTS_PACKAGE_NAME,
      version: compatibility.piSubagentsVersion,
      packageJsonSha256: "",
    },
  });
  return {
    packageJson,
    compatibility: await bindPrivateModuleContents(diagnostics.piSubagents.selected, compatibility),
    dependencies: {
      pi: pinnedPackage(diagnostics.pi.selected),
      piSubagents: pinnedPackage(diagnostics.piSubagents.selected),
    },
  };
}

export async function createRuntimePackageManifest(
  input: RuntimeVerificationInput,
): Promise<RuntimePackageManifest> {
  const [canonicalState, canonicalInputs, packedSha256, packedFiles] = await Promise.all([
    readCanonicalState(input.canonicalSource),
    canonicalPackageInputs(input.canonicalSource),
    hashFile(input.packedArtifact),
    readPackedFiles(input.packedArtifact),
  ]);
  await assertCanonicalFiles(canonicalState.canonicalSource, packedFiles);

  const manifest: RuntimePackageManifest = {
    schemaVersion: 1,
    provenance: { ...canonicalState, packedSha256 },
    compatibility: canonicalInputs.compatibility,
    package: {
      name: canonicalInputs.packageJson.name,
      version: canonicalInputs.packageJson.version,
      license: canonicalInputs.packageJson.license,
      packageJsonSha256: await hashFile(Path.join(canonicalState.canonicalSource, "package.json")),
    },
    dependencies: canonicalInputs.dependencies,
    files: packedFiles,
  };
  await verifyRuntimeProvenance(input, manifest);
  return manifest;
}

export async function verifyRuntimeProvenance(
  input: RuntimeVerificationInput,
  manifest: RuntimePackageManifest,
): Promise<RuntimeVerificationResult> {
  if (manifest.schemaVersion !== 1)
    throw new Error(`Unsupported runtime manifest schema '${String(manifest.schemaVersion)}'.`);
  assertBoundCompatibility(manifest.compatibility);
  if (!SHA256.test(manifest.provenance.packedSha256))
    throw new Error("Runtime manifest packed artifact hash is invalid.");
  const packedSha256 = await hashFile(input.packedArtifact);
  if (packedSha256 !== manifest.provenance.packedSha256) {
    throw new Error("Packed artifact SHA-256 does not match runtime provenance.");
  }
  const [canonicalState, canonicalInputs, packedFiles] = await Promise.all([
    readCanonicalState(input.canonicalSource),
    canonicalPackageInputs(input.canonicalSource),
    readPackedFiles(input.packedArtifact),
  ]);
  if (
    canonicalState.canonicalSource !== manifest.provenance.canonicalSource ||
    canonicalState.sourceCommit !== manifest.provenance.sourceCommit ||
    canonicalState.sourceTree !== manifest.provenance.sourceTree ||
    canonicalState.dirty !== manifest.provenance.dirty
  ) {
    throw new Error("Canonical source commit/tree state does not match runtime provenance.");
  }
  if (
    canonicalInputs.packageJson.name !== manifest.package.name ||
    canonicalInputs.packageJson.version !== manifest.package.version ||
    canonicalInputs.packageJson.license !== manifest.package.license ||
    (await hashFile(Path.join(canonicalState.canonicalSource, "package.json"))) !==
      manifest.package.packageJsonSha256 ||
    !equalCompatibility(canonicalInputs.compatibility, manifest.compatibility) ||
    JSON.stringify(canonicalInputs.dependencies) !== JSON.stringify(manifest.dependencies)
  ) {
    throw new Error("Canonical package metadata does not match runtime provenance.");
  }
  if (JSON.stringify(packedFiles) !== JSON.stringify(manifest.files)) {
    throw new Error("Packed artifact files do not match runtime provenance.");
  }
  await assertCanonicalFiles(canonicalState.canonicalSource, packedFiles);
  await assertOwnedTree(input.extractedPackage, packedFiles, "Extracted packed package");

  const [
    extractedPackageJson,
    extractedCompatibility,
    installedPackageJson,
    installedCompatibility,
  ] = await Promise.all([
    readPackageJson(input.extractedPackage),
    readCompatibility(input.extractedPackage),
    readPackageJson(input.installedPackage),
    readCompatibility(input.installedPackage),
  ]);
  await Promise.all([
    requireLicenseFile(input.extractedPackage),
    requireLicenseFile(input.installedPackage),
  ]);
  for (const [description, packageJson, compatibility] of [
    ["Extracted packed package", extractedPackageJson, extractedCompatibility],
    ["Isolated installed package", installedPackageJson, installedCompatibility],
  ] as const) {
    assertPackageCompatibility(packageJson, compatibility);
    if (
      packageJson.name !== manifest.package.name ||
      packageJson.version !== manifest.package.version ||
      packageJson.license !== manifest.package.license ||
      !equalCompatibility(compatibility, manifest.compatibility)
    ) {
      throw new Error(`${description} metadata does not match runtime provenance.`);
    }
  }
  await assertOwnedTree(input.installedPackage, packedFiles, "Isolated installed package");
  const diagnostics = await resolveDependencies(
    input.installedPackage,
    manifest.dependencies,
    manifest.compatibility,
  );
  return { manifest, diagnostics };
}

/** Validates only the installed package against a previously verified local manifest. */
export async function verifyRuntimePackageManifest(
  packageRoot: string,
  manifest: RuntimePackageManifest,
): Promise<DependencyDiagnostics> {
  assertBoundCompatibility(manifest.compatibility);
  await assertOwnedTree(packageRoot, manifest.files, "Isolated installed package");
  const [packageJson, compatibility] = await Promise.all([
    readPackageJson(packageRoot),
    readCompatibility(packageRoot),
  ]);
  await requireLicenseFile(packageRoot);
  assertPackageCompatibility(packageJson, compatibility);
  if (
    packageJson.name !== manifest.package.name ||
    packageJson.version !== manifest.package.version ||
    packageJson.license !== manifest.package.license ||
    !equalCompatibility(compatibility, manifest.compatibility)
  ) {
    throw new Error("Isolated installed package metadata does not match runtime manifest.");
  }
  return resolveDependencies(packageRoot, manifest.dependencies, manifest.compatibility);
}

export function diffOwnership(
  previous: Readonly<Record<string, string>>,
  next: Readonly<Record<string, string>>,
): OwnershipDiff {
  const previousPaths = new Set(Object.keys(previous));
  const nextPaths = new Set(Object.keys(next));
  return {
    added: [...nextPaths].filter((path) => !previousPaths.has(path)).sort(),
    changed: [...nextPaths]
      .filter((path) => previous[path] !== undefined && previous[path] !== next[path])
      .sort(),
    removed: [...previousPaths].filter((path) => !nextPaths.has(path)).sort(),
  };
}

export async function inspectOwnership(
  packageRoot: string,
  expectedFiles: Readonly<Record<string, string>>,
): Promise<OwnershipInspection> {
  const tree = await scanPackageTree(packageRoot);
  const actualPaths = new Set(Object.keys(tree.files));
  const unsafePaths = new Set(tree.unsafe);
  const conflicted = Object.entries(expectedFiles)
    .filter(([path, hash]) => !actualPaths.has(path) || tree.files[path] !== hash)
    .map(([path]) => path)
    .sort();
  return {
    conflicted,
    unmanaged: [...Object.keys(tree.files), ...tree.unsafe]
      .filter((path) => expectedFiles[path] === undefined)
      .sort(),
    unsafe: [...unsafePaths].sort(),
  };
}

export async function readRuntimePackageManifest(path: string): Promise<RuntimePackageManifest> {
  const parsed: unknown = JSON.parse(await FileSystem.readFile(path, "utf8"));
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    !isRecord(parsed.provenance) ||
    !isRecord(parsed.compatibility) ||
    !isRecord(parsed.package) ||
    !isRecord(parsed.dependencies) ||
    !isRecord(parsed.files) ||
    !isRecord(parsed.dependencies.pi) ||
    !isRecord(parsed.dependencies.piSubagents) ||
    parsed.compatibility.schemaVersion !== 1 ||
    !Array.isArray(parsed.compatibility.privateModules)
  ) {
    throw new Error(`Runtime manifest '${path}' is invalid.`);
  }
  const readPinnedPackage = (
    value: Record<string, unknown>,
    description: string,
  ): PinnedPackage => ({
    name: readString(value.name, `${description} name`),
    version: readExactVersion(value.version, `${description} version`),
    packageJsonSha256: readString(value.packageJsonSha256, `${description} package metadata hash`),
  });
  const privateModules = parsed.compatibility.privateModules.map(
    (entry, index): PrivateModuleCompatibility => {
      if (!isRecord(entry)) throw new Error(`Runtime manifest private module ${index} is invalid.`);
      const specifier = readString(entry.specifier, `manifest private module ${index} specifier`);
      if (!/^pi-subagents\/.+\.ts$/.test(specifier)) {
        throw new Error(`Runtime manifest private module '${specifier}' is invalid.`);
      }
      const requiredExports = readStringArray(
        entry.requiredExports,
        `manifest private module ${index} required exports`,
      );
      if (requiredExports.length === 0) {
        throw new Error(`Runtime manifest private module '${specifier}' is invalid.`);
      }
      return {
        specifier,
        requiredExports,
        contentSha256: readString(
          entry.contentSha256,
          `manifest private module '${specifier}' content hash`,
        ),
      };
    },
  );
  if (typeof parsed.provenance.dirty !== "boolean") {
    throw new Error("Runtime provenance dirty state is invalid.");
  }
  return {
    schemaVersion: 1,
    provenance: {
      canonicalSource: readString(parsed.provenance.canonicalSource, "provenance canonical source"),
      sourceCommit: readString(parsed.provenance.sourceCommit, "provenance source commit"),
      sourceTree: readString(parsed.provenance.sourceTree, "provenance source tree"),
      dirty: parsed.provenance.dirty,
      packedSha256: readString(parsed.provenance.packedSha256, "provenance packed hash"),
    },
    compatibility: {
      schemaVersion: 1,
      piVersion: readExactVersion(parsed.compatibility.piVersion, "compatibility Pi version"),
      piSubagentsVersion: readExactVersion(
        parsed.compatibility.piSubagentsVersion,
        "compatibility pi-subagents version",
      ),
      privateModules,
    },
    package: {
      name: readString(parsed.package.name, "package name"),
      version: readExactVersion(parsed.package.version, "package version"),
      license: readString(parsed.package.license, "package license"),
      packageJsonSha256: readString(parsed.package.packageJsonSha256, "package metadata hash"),
    },
    dependencies: {
      pi: readPinnedPackage(parsed.dependencies.pi, "Pi dependency"),
      piSubagents: readPinnedPackage(parsed.dependencies.piSubagents, "pi-subagents dependency"),
    },
    files: readStringRecord(parsed.files, "files"),
  };
}
