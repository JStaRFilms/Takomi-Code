// @effect-diagnostics nodeBuiltinImport:off - The test creates isolated on-disk runtime fixtures.
import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeModule from "node:module";
import * as NodeURL from "node:url";
import * as NodeZlib from "node:zlib";
import * as NodeTest from "node:test";

import { probePiHost } from "./host.ts";
import {
  createRuntimePackageManifest,
  diffOwnership,
  inspectOwnership,
  verifyRuntimeProvenance,
} from "./runtime.ts";

const PI_PACKAGE = "@earendil-works/pi-coding-agent";

async function writeJson(path: string, value: unknown): Promise<void> {
  await NodeFSP.mkdir(NodePath.dirname(path), { recursive: true });
  await NodeFSP.writeFile(path, `${JSON.stringify(value, undefined, 2)}\n`);
}

async function writePackage(root: string): Promise<void> {
  await writeJson(NodePath.join(root, "package.json"), {
    name: "takomi",
    version: "2.5.15",
    license: "ISC",
    dependencies: { "pi-subagents": "0.31.0" },
    devDependencies: { [PI_PACKAGE]: "0.84.4" },
  });
  await NodeFSP.writeFile(NodePath.join(root, "LICENSE"), "ISC\n");
  await NodeFSP.writeFile(NodePath.join(root, ".gitignore"), "node_modules/\n");
  await NodeFSP.writeFile(NodePath.join(root, "runtime.mjs"), "export {};\n");
  await writeJson(
    NodePath.join(root, ".pi", "extensions", "takomi-subagents", "pi-subagents-compatibility.json"),
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
  const piRoot = NodePath.join(root, "node_modules", "@earendil-works", "pi-coding-agent");
  await writeJson(NodePath.join(piRoot, "package.json"), {
    name: PI_PACKAGE,
    version: "0.84.4",
    type: "module",
    exports: { ".": { import: "./index.js" } },
  });
  await NodeFSP.writeFile(
    NodePath.join(piRoot, "index.js"),
    `import { readFile } from "node:fs/promises";
import * as NodeURL from "node:url";
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
          const moduleSource = await readFile(NodeURL.fileURLToPath(match[1]), "utf8");
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
  await writeJson(NodePath.join(root, "node_modules", "pi-subagents", "package.json"), {
    name: "pi-subagents",
    version: "0.31.0",
  });
  const privateApiPath = NodePath.join(
    root,
    "node_modules",
    "pi-subagents",
    "src",
    "private-api.ts",
  );
  await NodeFSP.mkdir(NodePath.dirname(privateApiPath), { recursive: true });
  await NodeFSP.writeFile(privateApiPath, "export const createPrivateApi = () => undefined;\n");
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
    const content = await NodeFSP.readFile(NodePath.join(source, relativePath));
    appendTarEntry(entries, `package/${relativePath}`, content);
  }
  await NodeFSP.writeFile(
    artifact,
    NodeZlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])),
  );
}

async function copyPackedFiles(source: string, destination: string): Promise<void> {
  for (const relativePath of PACKED_FILES) {
    const target = NodePath.join(destination, relativePath);
    await NodeFSP.mkdir(NodePath.dirname(target), { recursive: true });
    await NodeFSP.copyFile(NodePath.join(source, relativePath), target);
  }
}

async function git(root: string, args: ReadonlyArray<string>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    NodeChildProcess.execFile("git", ["-C", root, ...args], (error, _stdout, stderr) => {
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
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "takomi-pi-host-"));
  const canonicalSource = NodePath.join(root, "canonical");
  const extractedPackage = NodePath.join(root, "extracted", "package");
  const installedPackage = NodePath.join(root, "isolated", "node_modules", "takomi");
  const packedArtifact = NodePath.join(root, "takomi-2.5.15.tgz");
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
    NodeChildProcess.execFile(
      process.execPath,
      [NodeURL.fileURLToPath(new URL("../bin.mjs", import.meta.url)), ...args],
      (error, output, stderr) => {
        if (error === null) resolve({ stdout: output });
        else reject(new Error(stderr || error.message));
      },
    );
  });
  return JSON.parse(stdout);
}

async function probeChild(packageRoot: string, manifestPath: string): Promise<unknown> {
  const child = NodeChildProcess.spawn(
    process.execPath,
    [NodeURL.fileURLToPath(new URL("../bin.mjs", import.meta.url)), "serve"],
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
  NodeAssert.equal(code, 0);
  return JSON.parse(Buffer.concat(output).toString("utf8"));
}

NodeTest.test(
  "verifies canonical, packed, extracted, and isolated provenance then probes read-only",
  async () => {
    const fixture = await writeFixture();
    try {
      const manifest = await createRuntimePackageManifest(fixture);
      const cliManifestPath = NodePath.join(fixture.root, "cli-runtime-manifest.json");
      const cliResult = await runCli([
        "verify",
        fixture.canonicalSource,
        fixture.packedArtifact,
        fixture.extractedPackage,
        fixture.installedPackage,
        "--manifest",
        cliManifestPath,
      ]);
      NodeAssert.deepEqual(JSON.parse(await NodeFSP.readFile(cliManifestPath, "utf8")), manifest);
      NodeAssert.deepEqual(cliResult, {
        manifest,
        diagnostics: {
          pi: {
            candidates: [
              {
                ...manifest.dependencies.pi,
                path: await NodeFSP.realpath(
                  NodePath.join(
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
              path: await NodeFSP.realpath(
                NodePath.join(
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
                path: await NodeFSP.realpath(
                  NodePath.join(fixture.installedPackage, "node_modules", "pi-subagents"),
                ),
              },
            ],
            selected: {
              ...manifest.dependencies.piSubagents,
              path: await NodeFSP.realpath(
                NodePath.join(fixture.installedPackage, "node_modules", "pi-subagents"),
              ),
            },
          },
        },
      });
      NodeAssert.equal(manifest.provenance.dirty, false);
      NodeAssert.equal(manifest.compatibility.piVersion, "0.84.4");
      NodeAssert.match(
        manifest.compatibility.privateModules[0]?.contentSha256 ?? "",
        /^[a-f0-9]{64}$/,
      );
      const manifestPath = NodePath.join(fixture.root, "takomi-runtime-manifest.json");
      await writeJson(manifestPath, manifest);

      const probe = await probePiHost({ packageRoot: fixture.installedPackage, manifestPath });
      NodeAssert.deepEqual(probe.capabilities, ["capability-probe"]);
      NodeAssert.equal(probe.session, "not-opened");
      NodeAssert.equal(probe.package.path, await NodeFSP.realpath(fixture.installedPackage));
      NodeAssert.equal(probe.package.packageJsonSha256, manifest.package.packageJsonSha256);
      NodeAssert.equal(probe.dependencies.pi.version, "0.84.4");
      NodeAssert.equal(
        probe.dependencies.pi.packageJsonSha256,
        manifest.dependencies.pi.packageJsonSha256,
      );
      NodeAssert.equal(
        probe.dependencies.pi.path,
        await NodeFSP.realpath(
          NodePath.join(
            fixture.installedPackage,
            "node_modules",
            "@earendil-works",
            "pi-coding-agent",
          ),
        ),
      );
      NodeAssert.equal(probe.dependencies.piSubagents.version, "0.31.0");
      NodeAssert.equal(
        probe.dependencies.piSubagents.packageJsonSha256,
        manifest.dependencies.piSubagents.packageJsonSha256,
      );
      NodeAssert.deepEqual(await probeChild(fixture.installedPackage, manifestPath), probe);
    } finally {
      await NodeFSP.rm(fixture.root, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  },
);

NodeTest.test("loads Pi 0.84.4's import-only public export", async () => {
  const fixture = await writeFixture();
  try {
    const piRoot = NodePath.join(
      fixture.installedPackage,
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
    );
    const requireFromPi = NodeModule.createRequire(NodePath.join(piRoot, "conformance.cjs"));
    NodeAssert.throws(() => requireFromPi.resolve(PI_PACKAGE), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
    await NodeAssert.doesNotReject(createRuntimePackageManifest(fixture));
  } finally {
    await NodeFSP.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

NodeTest.test(
  "anchors conformance to the isolated Pi package instead of canonical or nearby installs",
  async () => {
    const fixture = await writeFixture();
    try {
      await Promise.all([
        writePiDependency(fixture.canonicalSource, "canonical Pi installation was loaded"),
        writePiDependency(fixture.root, "nearby alternate Pi installation was loaded"),
      ]);
      const manifest = await createRuntimePackageManifest(fixture);

      const verification = await verifyRuntimeProvenance(fixture, manifest);
      NodeAssert.equal(
        verification.diagnostics.pi.selected.path,
        await NodeFSP.realpath(
          NodePath.join(
            fixture.installedPackage,
            "node_modules",
            "@earendil-works",
            "pi-coding-agent",
          ),
        ),
      );
    } finally {
      await NodeFSP.rm(fixture.root, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  },
);

NodeTest.test("represents a dirty canonical tree instead of claiming a clean commit", async () => {
  const fixture = await writeFixture();
  try {
    await NodeFSP.writeFile(
      NodePath.join(fixture.canonicalSource, "review-note.txt"),
      "uncommitted\n",
    );
    const manifest = await createRuntimePackageManifest(fixture);
    NodeAssert.equal(manifest.provenance.dirty, true);
  } finally {
    await NodeFSP.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

NodeTest.test("accepts npm-style UTF-8 PAX paths and global headers", async () => {
  const fixture = await writeFixture();
  const relativePath = "assets/Legacy/2✨ ULTIMATE ORCHESTRATION PROMPT✨.md";
  try {
    for (const root of [
      fixture.canonicalSource,
      fixture.extractedPackage,
      fixture.installedPackage,
    ]) {
      const path = NodePath.join(root, relativePath);
      await NodeFSP.mkdir(NodePath.dirname(path), { recursive: true });
      await NodeFSP.writeFile(path, "PAX fixture\n");
    }
    await pack(fixture.canonicalSource, fixture.packedArtifact, {
      additionalPaths: [relativePath],
      globalPax: { mtime: "499162500" },
      paxEntries: { [relativePath]: paxRecords({ path: `package/${relativePath}` }) },
    });

    const manifest = await createRuntimePackageManifest(fixture);
    NodeAssert.match(manifest.files[relativePath] ?? "", /^[a-f0-9]{64}$/);
  } finally {
    await NodeFSP.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

NodeTest.test("rejects malformed, oversized, and traversal PAX records", async () => {
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
      await NodeAssert.rejects(createRuntimePackageManifest(fixture), expected);
    }
  } finally {
    await NodeFSP.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

NodeTest.test("rejects fabricated provenance and artifact hash mismatches", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    await NodeAssert.rejects(
      verifyRuntimeProvenance(fixture, {
        ...manifest,
        provenance: { ...manifest.provenance, sourceCommit: "0".repeat(40) },
      }),
      /commit\/tree state/,
    );
    await NodeFSP.appendFile(fixture.packedArtifact, "tampered");
    await NodeAssert.rejects(verifyRuntimeProvenance(fixture, manifest), /SHA-256/);
  } finally {
    await NodeFSP.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

NodeTest.test(
  "rejects canonical private-module drift even when the isolated installation is unchanged",
  async () => {
    const fixture = await writeFixture();
    try {
      const manifest = await createRuntimePackageManifest(fixture);
      const isolatedPrivateModule = NodePath.join(
        fixture.installedPackage,
        "node_modules",
        "pi-subagents",
        "src",
        "private-api.ts",
      );
      const isolatedContents = await NodeFSP.readFile(isolatedPrivateModule, "utf8");
      await NodeFSP.writeFile(
        NodePath.join(
          fixture.canonicalSource,
          "node_modules",
          "pi-subagents",
          "src",
          "private-api.ts",
        ),
        "export const createPrivateApi = () => 'canonical drift';\n",
      );

      await NodeAssert.rejects(
        verifyRuntimeProvenance(fixture, manifest),
        /Canonical package metadata/,
      );
      NodeAssert.equal(await NodeFSP.readFile(isolatedPrivateModule, "utf8"), isolatedContents);
    } finally {
      await NodeFSP.rm(fixture.root, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  },
);

NodeTest.test("rejects a private export missing behind a textual comment", async () => {
  const fixture = await writeFixture();
  try {
    const missingExport =
      "// createPrivateApi remains mentioned, but is not exported.\nexport const anotherApi = () => undefined;\n";
    await Promise.all([
      NodeFSP.writeFile(
        NodePath.join(
          fixture.canonicalSource,
          "node_modules",
          "pi-subagents",
          "src",
          "private-api.ts",
        ),
        missingExport,
      ),
      NodeFSP.writeFile(
        NodePath.join(
          fixture.installedPackage,
          "node_modules",
          "pi-subagents",
          "src",
          "private-api.ts",
        ),
        missingExport,
      ),
    ]);
    await NodeAssert.rejects(
      createRuntimePackageManifest(fixture),
      /Pi extension-loader conformance failed: .*missing 'createPrivateApi'/,
    );
  } finally {
    await NodeFSP.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

NodeTest.test("rejects isolated package drift and wrong dependency identity", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    await NodeFSP.writeFile(NodePath.join(fixture.installedPackage, "runtime.mjs"), "tampered\n");
    await NodeAssert.rejects(
      verifyRuntimeProvenance(fixture, manifest),
      /Isolated installed package file integrity/,
    );
    await NodeFSP.writeFile(NodePath.join(fixture.installedPackage, "runtime.mjs"), "export {};\n");
    await writeJson(
      NodePath.join(fixture.installedPackage, "node_modules", "pi-subagents", "package.json"),
      {
        name: "not-pi-subagents",
        version: "0.31.0",
      },
    );
    await NodeAssert.rejects(
      verifyRuntimeProvenance(fixture, manifest),
      /must be 'pi-subagents@0.31.0'/,
    );
    await writeJson(
      NodePath.join(fixture.installedPackage, "node_modules", "pi-subagents", "package.json"),
      {
        name: "pi-subagents",
        version: "0.31.1",
      },
    );
    await NodeAssert.rejects(
      verifyRuntimeProvenance(fixture, manifest),
      /must be 'pi-subagents@0.31.0'/,
    );
  } finally {
    await NodeFSP.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

NodeTest.test("rejects ambiguous dependency installations", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    const duplicate = NodePath.join(NodePath.dirname(fixture.installedPackage), "pi-subagents");
    await writeJson(NodePath.join(duplicate, "package.json"), {
      name: "pi-subagents",
      version: "0.31.0",
    });
    const duplicateModule = NodePath.join(duplicate, "src", "private-api.ts");
    await NodeFSP.mkdir(NodePath.dirname(duplicateModule), { recursive: true });
    await NodeFSP.writeFile(duplicateModule, "export const createPrivateApi = () => undefined;\n");
    await NodeAssert.rejects(
      verifyRuntimeProvenance(fixture, manifest),
      /ambiguous 'pi-subagents' installations/,
    );
  } finally {
    await NodeFSP.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

NodeTest.test("reports ownership states and never follows symlink entries", async () => {
  const fixture = await writeFixture();
  try {
    const manifest = await createRuntimePackageManifest(fixture);
    NodeAssert.deepEqual(
      diffOwnership(
        { "removed.ts": "before", "runtime.mjs": "before" },
        { "added.ts": "after", "runtime.mjs": "after" },
      ),
      { added: ["added.ts"], changed: ["runtime.mjs"], removed: ["removed.ts"] },
    );
    await NodeFSP.writeFile(NodePath.join(fixture.installedPackage, "runtime.mjs"), "changed\n");
    await NodeFSP.writeFile(
      NodePath.join(fixture.installedPackage, "user-file.txt"),
      "unmanaged\n",
    );
    const outside = NodePath.join(fixture.root, "outside.txt");
    await NodeFSP.writeFile(outside, "outside\n");
    await NodeFSP.symlink(outside, NodePath.join(fixture.installedPackage, "outside-link"));
    const inspection = await inspectOwnership(fixture.installedPackage, manifest.files);
    NodeAssert.deepEqual(inspection.conflicted, ["runtime.mjs"]);
    NodeAssert.deepEqual(inspection.unmanaged, ["outside-link", "user-file.txt"]);
    NodeAssert.deepEqual(inspection.unsafe, ["outside-link"]);

    await NodeFSP.rm(NodePath.join(fixture.installedPackage, "runtime.mjs"), { force: true });
    await NodeFSP.symlink(outside, NodePath.join(fixture.installedPackage, "runtime.mjs"));
    const ownedLink = await inspectOwnership(fixture.installedPackage, manifest.files);
    NodeAssert.ok(ownedLink.conflicted.includes("runtime.mjs"));
    NodeAssert.deepEqual(ownedLink.unsafe, ["outside-link", "runtime.mjs"]);
  } finally {
    await NodeFSP.rm(fixture.root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});
