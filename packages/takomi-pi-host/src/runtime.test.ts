// @effect-diagnostics nodeBuiltinImport:off - The test creates isolated on-disk runtime fixtures.
import assert from "node:assert/strict";
import * as ChildProcess from "node:child_process";
import * as FileSystem from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as Zlib from "node:zlib";
import { test } from "node:test";

import { probePiHost } from "./host.ts";
import {
  createRuntimePackageManifest,
  diffOwnership,
  inspectOwnership,
  verifyRuntimeProvenance,
} from "./runtime.ts";

const PI_PACKAGE = "@earendil-works/pi-coding-agent";

async function writeJson(path: string, value: unknown): Promise<void> {
  await FileSystem.mkdir(Path.dirname(path), { recursive: true });
  await FileSystem.writeFile(path, `${JSON.stringify(value, undefined, 2)}\n`);
}

async function writePackage(root: string): Promise<void> {
  await writeJson(Path.join(root, "package.json"), {
    name: "takomi",
    version: "2.5.15",
    license: "ISC",
    dependencies: { "pi-subagents": "0.31.0" },
    devDependencies: { [PI_PACKAGE]: "0.84.4" },
  });
  await FileSystem.writeFile(Path.join(root, "LICENSE"), "ISC\n");
  await FileSystem.writeFile(Path.join(root, ".gitignore"), "node_modules/\n");
  await FileSystem.writeFile(Path.join(root, "runtime.mjs"), "export {};\n");
  await writeJson(
    Path.join(root, ".pi", "extensions", "takomi-subagents", "pi-subagents-compatibility.json"),
    {
      schemaVersion: 1,
      piVersion: "0.84.4",
      piSubagentsVersion: "0.31.0",
      privateModules: [
        {
          specifier: "pi-subagents/src/private-api.ts",
          requiredExports: ["createPrivateApi"],
        },
      ],
    },
  );
}

async function writePiDependency(root: string, loaderError?: string): Promise<void> {
  const piRoot = Path.join(root, "node_modules", "@earendil-works", "pi-coding-agent");
  await writeJson(Path.join(piRoot, "package.json"), {
    name: PI_PACKAGE,
    version: "0.84.4",
    type: "module",
    exports: { ".": { import: "./index.js" } },
  });
  await FileSystem.writeFile(
    Path.join(piRoot, "index.js"),
    `import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const loaderError = ${JSON.stringify(loaderError ?? null)};
export class DefaultResourceLoader {
  constructor(options) { this.options = options; this.errors = []; }
  async reload() {
    if (loaderError !== null) {
      this.errors.push({ error: loaderError });
      return;
    }
    for (const path of this.options.additionalExtensionPaths) {
      try {
        let source = await readFile(path, "utf8");
        for (const match of source.matchAll(/from "(file:[^"]+)";/g)) {
          const moduleSource = await readFile(fileURLToPath(match[1]), "utf8");
          source = source.replace(match[0], "from " + JSON.stringify("data:text/javascript," + encodeURIComponent(moduleSource)) + ";");
        }
        const extension = await import("data:text/javascript," + encodeURIComponent(source));
        if (typeof extension.default !== "function") throw new Error("Extension does not export a valid factory function.");
        await extension.default();
      } catch (error) {
        this.errors.push({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  getExtensions() { return { errors: this.errors }; }
}
`,
  );
}

async function writeDependencies(root: string): Promise<void> {
  await writeJson(Path.join(root, "node_modules", "pi-subagents", "package.json"), {
    name: "pi-subagents",
    version: "0.31.0",
  });
  const privateApiPath = Path.join(root, "node_modules", "pi-subagents", "src", "private-api.ts");
  await FileSystem.mkdir(Path.dirname(privateApiPath), { recursive: true });
  await FileSystem.writeFile(privateApiPath, "export const createPrivateApi = () => undefined;\n");
  await writePiDependency(root);
}

function tarHeader(path: string, size: number, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  header.write(path);
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
  header.write("00000000000\0", 136);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write("ustar\0", 257);
  header.write("00", 263);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
  return header;
}

const PACKED_FILES = [
  "package.json",
  "LICENSE",
  "runtime.mjs",
  ".pi/extensions/takomi-subagents/pi-subagents-compatibility.json",
];

function paxRecord(key: string, value: string): Buffer {
  const suffix = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(suffix);
  while (true) {
    const record = Buffer.from(`${length}${suffix}`);
    if (record.length === length) return record;
    length = record.length;
  }
}

function paxRecords(attributes: Readonly<Record<string, string>>): Buffer {
  return Buffer.concat(Object.entries(attributes).map(([key, value]) => paxRecord(key, value)));
}

function appendTarEntry(
  entries: Array<Buffer>,
  path: string,
  content: Uint8Array,
  type = "0",
): void {
  entries.push(tarHeader(path, content.length, type), Buffer.from(content));
  entries.push(Buffer.alloc((512 - (content.length % 512)) % 512));
}

interface PackOptions {
  readonly additionalPaths?: ReadonlyArray<string>;
  readonly globalPax?: Readonly<Record<string, string>>;
  readonly paxEntries?: Readonly<Record<string, Uint8Array>>;
}

async function pack(source: string, artifact: string, options: PackOptions = {}): Promise<void> {
  const entries: Array<Buffer> = [];
  if (options.globalPax !== undefined) {
    appendTarEntry(entries, "GlobalHead", paxRecords(options.globalPax), "g");
  }
  for (const relativePath of [...PACKED_FILES, ...(options.additionalPaths ?? [])]) {
    const pax = options.paxEntries?.[relativePath];
    if (pax !== undefined) appendTarEntry(entries, `PaxHeader/${relativePath}`, pax, "x");
    const content = await FileSystem.readFile(Path.join(source, relativePath));
    appendTarEntry(entries, `package/${relativePath}`, content);
  }
  await FileSystem.writeFile(
    artifact,
    Zlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])),
  );
}

async function copyPackedFiles(source: string, destination: string): Promise<void> {
  for (const relativePath of PACKED_FILES) {
    const target = Path.join(destination, relativePath);
    await FileSystem.mkdir(Path.dirname(target), { recursive: true });
    await FileSystem.copyFile(Path.join(source, relativePath), target);
  }
}

async function git(root: string, args: ReadonlyArray<string>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ChildProcess.execFile("git", ["-C", root, ...args], (error, _stdout, stderr) => {
      if (error === null) resolve();
      else reject(new Error(stderr || error.message));
    });
  });
}

async function writeFixture(): Promise<{
  readonly root: string;
  readonly canonicalSource: string;
  readonly packedArtifact: string;
  readonly extractedPackage: string;
  readonly installedPackage: string;
}> {
  const root = await FileSystem.mkdtemp(Path.join(Os.tmpdir(), "takomi-pi-host-"));
  const canonicalSource = Path.join(root, "canonical");
  const extractedPackage = Path.join(root, "extracted", "package");
  const installedPackage = Path.join(root, "isolated", "node_modules", "takomi");
  const packedArtifact = Path.join(root, "takomi-2.5.15.tgz");
  await writePackage(canonicalSource);
  await writeDependencies(canonicalSource);
  await git(canonicalSource, ["init"]);
  await git(canonicalSource, ["add", "."]);
  await git(canonicalSource, [
    "-c",
    "user.name=Takomi Test",
    "-c",
    "user.email=takomi@example.test",
    "commit",
    "-m",
    "fixture",
  ]);
  await pack(canonicalSource, packedArtifact);
  await copyPackedFiles(canonicalSource, extractedPackage);
  await copyPackedFiles(canonicalSource, installedPackage);
  await writeDependencies(installedPackage);
  return { root, canonicalSource, packedArtifact, extractedPackage, installedPackage };
}

async function runCli(args: ReadonlyArray<string>): Promise<unknown> {
  const { stdout } = await new Promise<{ readonly stdout: string }>((resolve, reject) => {
    ChildProcess.execFile(
      process.execPath,
      [fileURLToPath(new URL("../bin.mjs", import.meta.url)), ...args],
      (error, output, stderr) => {
        if (error === null) resolve({ stdout: output });
        else reject(new Error(stderr || error.message));
      },
    );
  });
  return JSON.parse(stdout);
}

async function probeChild(packageRoot: string, manifestPath: string): Promise<unknown> {
  const child = ChildProcess.spawn(
    process.execPath,
    [fileURLToPath(new URL("../bin.mjs", import.meta.url)), "serve"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  if (child.stdin === null || child.stdout === null) {
    throw new Error("Host child did not expose the required stdio boundary.");
  }
  const output: Array<Buffer> = [];
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode) => resolve(exitCode));
    child.stdin?.end(`${JSON.stringify({ method: "probe", packageRoot, manifestPath })}\n`);
  });
  assert.equal(code, 0);
  return JSON.parse(Buffer.concat(output).toString("utf8"));
}

test("verifies canonical, packed, extracted, and isolated provenance then probes read-only", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    const cliManifestPath = Path.join(fixture.root, "cli-runtime-manifest.json");
    const cliResult = await runCli([
      "verify",
      fixture.canonicalSource,
      fixture.packedArtifact,
      fixture.extractedPackage,
      fixture.installedPackage,
      "--manifest",
      cliManifestPath,
    ]);
    assert.deepEqual(JSON.parse(await FileSystem.readFile(cliManifestPath, "utf8")), manifest);
    assert.deepEqual(cliResult, {
      manifest,
      diagnostics: {
        pi: {
          candidates: [
            {
              ...manifest.dependencies.pi,
              path: await FileSystem.realpath(
                Path.join(
                  fixture.installedPackage,
                  "node_modules",
                  "@earendil-works",
                  "pi-coding-agent",
                ),
              ),
            },
          ],
          selected: {
            ...manifest.dependencies.pi,
            path: await FileSystem.realpath(
              Path.join(
                fixture.installedPackage,
                "node_modules",
                "@earendil-works",
                "pi-coding-agent",
              ),
            ),
          },
        },
        piSubagents: {
          candidates: [
            {
              ...manifest.dependencies.piSubagents,
              path: await FileSystem.realpath(
                Path.join(fixture.installedPackage, "node_modules", "pi-subagents"),
              ),
            },
          ],
          selected: {
            ...manifest.dependencies.piSubagents,
            path: await FileSystem.realpath(
              Path.join(fixture.installedPackage, "node_modules", "pi-subagents"),
            ),
          },
        },
      },
    });
    assert.equal(manifest.provenance.dirty, false);
    assert.equal(manifest.compatibility.piVersion, "0.84.4");
    assert.match(manifest.compatibility.privateModules[0]?.contentSha256 ?? "", /^[a-f0-9]{64}$/);
    const manifestPath = Path.join(fixture.root, "takomi-runtime-manifest.json");
    await writeJson(manifestPath, manifest);

    const probe = await probePiHost({ packageRoot: fixture.installedPackage, manifestPath });
    assert.deepEqual(probe.capabilities, ["capability-probe"]);
    assert.equal(probe.session, "not-opened");
    assert.deepEqual(await probeChild(fixture.installedPackage, manifestPath), probe);
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("loads Pi 0.84.4's import-only public export", async () => {
  const fixture = await writeFixture();
  try {
    const piRoot = Path.join(
      fixture.installedPackage,
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
    );
    const requireFromPi = createRequire(Path.join(piRoot, "conformance.cjs"));
    assert.throws(() => requireFromPi.resolve(PI_PACKAGE), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
    await assert.doesNotReject(createRuntimePackageManifest(fixture));
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("anchors conformance to the isolated Pi package instead of canonical or nearby installs", async () => {
  const fixture = await writeFixture();
  try {
    await Promise.all([
      writePiDependency(fixture.canonicalSource, "canonical Pi installation was loaded"),
      writePiDependency(fixture.root, "nearby alternate Pi installation was loaded"),
    ]);
    const manifest = await createRuntimePackageManifest(fixture);

    const verification = await verifyRuntimeProvenance(fixture, manifest);
    assert.equal(
      verification.diagnostics.pi.selected.path,
      await FileSystem.realpath(
        Path.join(fixture.installedPackage, "node_modules", "@earendil-works", "pi-coding-agent"),
      ),
    );
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("represents a dirty canonical tree instead of claiming a clean commit", async () => {
  const fixture = await writeFixture();
  try {
    await FileSystem.writeFile(
      Path.join(fixture.canonicalSource, "review-note.txt"),
      "uncommitted\n",
    );
    const manifest = await createRuntimePackageManifest(fixture);
    assert.equal(manifest.provenance.dirty, true);
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("accepts npm-style UTF-8 PAX paths and global headers", async () => {
  const fixture = await writeFixture();
  const relativePath = "assets/Legacy/2✨ ULTIMATE ORCHESTRATION PROMPT✨.md";
  try {
    for (const root of [
      fixture.canonicalSource,
      fixture.extractedPackage,
      fixture.installedPackage,
    ]) {
      const path = Path.join(root, relativePath);
      await FileSystem.mkdir(Path.dirname(path), { recursive: true });
      await FileSystem.writeFile(path, "PAX fixture\n");
    }
    await pack(fixture.canonicalSource, fixture.packedArtifact, {
      additionalPaths: [relativePath],
      globalPax: { mtime: "499162500" },
      paxEntries: { [relativePath]: paxRecords({ path: `package/${relativePath}` }) },
    });

    const manifest = await createRuntimePackageManifest(fixture);
    assert.match(manifest.files[relativePath] ?? "", /^[a-f0-9]{64}$/);
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("rejects malformed, oversized, and traversal PAX records", async () => {
  const fixture = await writeFixture();
  try {
    for (const [pax, expected] of [
      [Buffer.from("12 path=package.json\n"), /invalid PAX header length/],
      [Buffer.from("1048577 path=x\n"), /oversized PAX header record/],
      [paxRecords({ path: "package/../outside" }), /Unsafe package path/],
    ] as const) {
      await pack(fixture.canonicalSource, fixture.packedArtifact, {
        paxEntries: { "package.json": pax },
      });
      await assert.rejects(createRuntimePackageManifest(fixture), expected);
    }
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("rejects fabricated provenance and artifact hash mismatches", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    await assert.rejects(
      verifyRuntimeProvenance(fixture, {
        ...manifest,
        provenance: { ...manifest.provenance, sourceCommit: "0".repeat(40) },
      }),
      /commit\/tree state/,
    );
    await FileSystem.appendFile(fixture.packedArtifact, "tampered");
    await assert.rejects(verifyRuntimeProvenance(fixture, manifest), /SHA-256/);
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("rejects canonical private-module drift even when the isolated installation is unchanged", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    const isolatedPrivateModule = Path.join(
      fixture.installedPackage,
      "node_modules",
      "pi-subagents",
      "src",
      "private-api.ts",
    );
    const isolatedContents = await FileSystem.readFile(isolatedPrivateModule, "utf8");
    await FileSystem.writeFile(
      Path.join(fixture.canonicalSource, "node_modules", "pi-subagents", "src", "private-api.ts"),
      "export const createPrivateApi = () => 'canonical drift';\n",
    );

    await assert.rejects(verifyRuntimeProvenance(fixture, manifest), /Canonical package metadata/);
    assert.equal(await FileSystem.readFile(isolatedPrivateModule, "utf8"), isolatedContents);
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("rejects a private export missing behind a textual comment", async () => {
  const fixture = await writeFixture();
  try {
    const missingExport =
      "// createPrivateApi remains mentioned, but is not exported.\nexport const anotherApi = () => undefined;\n";
    await Promise.all([
      FileSystem.writeFile(
        Path.join(fixture.canonicalSource, "node_modules", "pi-subagents", "src", "private-api.ts"),
        missingExport,
      ),
      FileSystem.writeFile(
        Path.join(
          fixture.installedPackage,
          "node_modules",
          "pi-subagents",
          "src",
          "private-api.ts",
        ),
        missingExport,
      ),
    ]);
    await assert.rejects(
      createRuntimePackageManifest(fixture),
      /Pi extension-loader conformance failed: .*missing 'createPrivateApi'/,
    );
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("rejects isolated package drift and wrong dependency identity", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    await FileSystem.writeFile(Path.join(fixture.installedPackage, "runtime.mjs"), "tampered\n");
    await assert.rejects(
      verifyRuntimeProvenance(fixture, manifest),
      /Isolated installed package file integrity/,
    );
    await FileSystem.writeFile(Path.join(fixture.installedPackage, "runtime.mjs"), "export {};\n");
    await writeJson(
      Path.join(fixture.installedPackage, "node_modules", "pi-subagents", "package.json"),
      {
        name: "not-pi-subagents",
        version: "0.31.0",
      },
    );
    await assert.rejects(
      verifyRuntimeProvenance(fixture, manifest),
      /must be 'pi-subagents@0.31.0'/,
    );
    await writeJson(
      Path.join(fixture.installedPackage, "node_modules", "pi-subagents", "package.json"),
      {
        name: "pi-subagents",
        version: "0.31.1",
      },
    );
    await assert.rejects(
      verifyRuntimeProvenance(fixture, manifest),
      /must be 'pi-subagents@0.31.0'/,
    );
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("rejects ambiguous dependency installations", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    const duplicate = Path.join(Path.dirname(fixture.installedPackage), "pi-subagents");
    await writeJson(Path.join(duplicate, "package.json"), {
      name: "pi-subagents",
      version: "0.31.0",
    });
    const duplicateModule = Path.join(duplicate, "src", "private-api.ts");
    await FileSystem.mkdir(Path.dirname(duplicateModule), { recursive: true });
    await FileSystem.writeFile(
      duplicateModule,
      "export const createPrivateApi = () => undefined;\n",
    );
    await assert.rejects(
      verifyRuntimeProvenance(fixture, manifest),
      /ambiguous 'pi-subagents' installations/,
    );
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("reports ownership states and never follows symlink entries", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    assert.deepEqual(
      diffOwnership(
        { "removed.ts": "before", "runtime.mjs": "before" },
        { "added.ts": "after", "runtime.mjs": "after" },
      ),
      { added: ["added.ts"], changed: ["runtime.mjs"], removed: ["removed.ts"] },
    );
    await FileSystem.writeFile(Path.join(fixture.installedPackage, "runtime.mjs"), "changed\n");
    await FileSystem.writeFile(Path.join(fixture.installedPackage, "user-file.txt"), "unmanaged\n");
    const outside = Path.join(fixture.root, "outside.txt");
    await FileSystem.writeFile(outside, "outside\n");
    await FileSystem.symlink(outside, Path.join(fixture.installedPackage, "outside-link"));
    const inspection = await inspectOwnership(fixture.installedPackage, manifest.files);
    assert.deepEqual(inspection.conflicted, ["runtime.mjs"]);
    assert.deepEqual(inspection.unmanaged, ["outside-link", "user-file.txt"]);
    assert.deepEqual(inspection.unsafe, ["outside-link"]);

    await FileSystem.rm(Path.join(fixture.installedPackage, "runtime.mjs"), { force: true });
    await FileSystem.symlink(outside, Path.join(fixture.installedPackage, "runtime.mjs"));
    const ownedLink = await inspectOwnership(fixture.installedPackage, manifest.files);
    assert.ok(ownedLink.conflicted.includes("runtime.mjs"));
    assert.deepEqual(ownedLink.unsafe, ["outside-link", "runtime.mjs"]);
  } finally {
    await FileSystem.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});
