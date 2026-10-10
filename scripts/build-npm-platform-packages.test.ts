// @effect-diagnostics nodeBuiltinImport:off - Evaluates the generated launcher without starting an app.
import * as NodeVM from "node:vm";
import { HostProcessArchitecture, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { windowsSystemTar } from "./build-cli-archive.ts";
import {
  buildNpmPlatformPackages,
  NpmPackagesArchivesMissingError,
  npmLauncherPackageManifest,
  npmLauncherScript,
  npmPlatformPackageManifest,
} from "./build-npm-platform-packages.ts";

it("generates Windows and Linux packages without a global t3 alias and resolves their executables", () => {
  const keys = ["linux-x64", "win32-x64"] as const;
  const manifest = npmLauncherPackageManifest("0.1.0", keys);
  assert.deepStrictEqual(manifest.bin, { "takomi-code": "./bin/takomi-code.js" });
  assert.deepStrictEqual(manifest.optionalDependencies, {
    "@johnsax/takomi-code-linux-x64": "0.1.0",
    "@johnsax/takomi-code-win32-x64": "0.1.0",
  });
  for (const key of keys) {
    const [platform] = key.split("-");
    const native = npmPlatformPackageManifest(key, "0.1.0", {});
    assert.deepStrictEqual(native.os, [platform]);
    assert.deepStrictEqual(native.cpu, ["x64"]);
    assert.notProperty(native, "bin");
    for (const childResult of [
      { status: 7, signal: null },
      { status: null, signal: "SIGTERM" },
    ]) {
      let exitCode: number | undefined;
      const stopped = new Error("launcher exited");
      const require = Object.assign(
        (module: string) => {
          if (module === "node:os") return { constants: { signals: { SIGTERM: 15 } } };
          if (module === "node:path")
            return {
              dirname: (value: string) => value.slice(0, value.lastIndexOf("/")),
              join: (...parts: string[]) => parts.join("/"),
            };
          if (module === "node:child_process")
            return {
              spawnSync: (executable: string, args: string[], options: { stdio: string }) => {
                assert.equal(
                  executable,
                  `/packages/${key}/${platform === "win32" ? "t3.exe" : "t3"}`,
                );
                assert.deepStrictEqual(Array.from(args), ["serve", "--port", "1234"]);
                assert.equal(options.stdio, "inherit");
                return childResult;
              },
            };
          throw new Error(`Unexpected module ${module}`);
        },
        {
          resolve: (specifier: string) => {
            assert.equal(specifier, `@johnsax/takomi-code-${key}/package.json`);
            return `/packages/${key}/package.json`;
          },
        },
      );
      assert.throws(
        () =>
          new NodeVM.Script(npmLauncherScript(keys)).runInNewContext({
            require,
            process: {
              platform,
              arch: "x64",
              argv: ["node", "launcher", "serve", "--port", "1234"],
              exit: (code: number) => {
                exitCode = code;
                throw stopped;
              },
              stderr: {
                write: (message: string) => {
                  throw new Error(message);
                },
              },
            },
          }),
        "launcher exited",
      );
      assert.equal(exitCode, childResult.status ?? 143);
    }
  }
});

const VERSION = "1.2.3";
const decodeManifest = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);
const KEYS = ["linux-x64", "darwin-arm64"] as const;

const collect = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (acc, chunk) => acc + chunk,
    ),
  );

const run = Effect.fn("test.run")(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly env?: Record<string, string> },
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const platform = yield* HostProcessPlatform;
  const child = yield* spawner.spawn(
    ChildProcess.make(
      platform === "win32" && command === "tar" ? windowsSystemTar() : command,
      args,
      { cwd: options.cwd, env: options.env ?? {} },
    ),
  );
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [collect(child.stdout), collect(child.stderr), child.exitCode.pipe(Effect.map(Number))],
    { concurrency: "unbounded" },
  );
  return { stdout, stderr, exitCode };
});

/** A tar.gz laid out like build-cli-archive.ts writes, with a stub `t3` that echoes its args. */
const makeFakeArchives = Effect.fn("test.makeFakeArchives")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-npm-packages-test-" });
  const archivesDir = path.join(root, "archives");
  yield* fs.makeDirectory(archivesDir);
  for (const key of KEYS) {
    const stem = `t3-${VERSION}-${key}`;
    const stage = path.join(root, "stage", key);
    const contentDir = path.join(stage, stem);
    for (const dir of [
      "client",
      "resource-monitor",
      "node_modules/node-pty",
      "node_modules/@ff-labs/fff-node",
    ]) {
      yield* fs.makeDirectory(path.join(contentDir, dir), { recursive: true });
    }
    yield* fs.writeFileString(
      path.join(contentDir, "node_modules/node-pty/package.json"),
      '{ "name": "node-pty", "version": "1.1.0" }\n',
    );
    yield* fs.writeFileString(
      path.join(contentDir, "node_modules/@ff-labs/fff-node/package.json"),
      '{ "name": "@ff-labs/fff-node", "version": "0.9.4" }\n',
    );
    yield* fs.writeFileString(path.join(contentDir, "client/index.html"), "<html></html>\n");
    yield* fs.writeFileString(
      path.join(contentDir, "t3"),
      `#!/bin/sh\necho "stub ${key} $*"\nexit 7\n`,
    );
    yield* fs.chmod(path.join(contentDir, "t3"), 0o755);
    const exit = yield* run("tar", ["-czf", path.join(archivesDir, `${stem}.tar.gz`), stem], {
      cwd: stage,
    });
    assert.equal(exit.exitCode, 0, exit.stderr);
  }
  yield* fs.writeFileString(path.join(archivesDir, "SHA256SUMS"), "");
  return { root, archivesDir, outputDir: path.join(root, "out") };
});

it.layer(NodeServices.layer)("build-npm-platform-packages", (it) => {
  it.effect("refuses a partial release unless --allow-missing is passed", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFakeArchives();
      const error = yield* buildNpmPlatformPackages({
        ...fixture,
        version: VERSION,
        allowMissing: false,
      }).pipe(Effect.flip);
      assert.instanceOf(error, NpmPackagesArchivesMissingError);
      assert.deepStrictEqual((error as NpmPackagesArchivesMissingError).missing, [
        "linux-arm64",
        "win32-arm64",
        "win32-x64",
      ]);
    }),
  );

  it.effect("builds platform packages and a launcher that execs the installed one", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const hostPlatform = yield* HostProcessPlatform;
      const fixture = yield* makeFakeArchives();
      const outputs = yield* buildNpmPlatformPackages({
        ...fixture,
        version: VERSION,
        allowMissing: true,
      });
      // Platform packages in CLI_ARCHIVE_PLATFORM_KEYS order, launcher last.
      assert.deepStrictEqual(
        outputs.map((output) => output.name),
        ["@johnsax/takomi-code-darwin-arm64", "@johnsax/takomi-code-linux-x64", "takomi-code"],
      );
      for (const output of outputs) {
        assert.isTrue(yield* fs.exists(output.tarball), output.tarball);
      }

      const linuxDir = path.join(fixture.outputDir, "@johnsax/takomi-code-linux-x64");
      const linuxManifest = yield* decodeManifest(
        yield* fs.readFileString(path.join(linuxDir, "package.json")),
      );
      assert.equal(linuxManifest.name, "@johnsax/takomi-code-linux-x64");
      assert.equal(linuxManifest.version, VERSION);
      assert.deepStrictEqual(linuxManifest.os, ["linux"]);
      assert.deepStrictEqual(linuxManifest.cpu, ["x64"]);
      assert.deepStrictEqual(linuxManifest.files, [
        "t3",
        "t3.exe",
        "client",
        "resource-monitor",
        "node_modules",
      ]);
      assert.equal(linuxManifest.preferUnplugged, true);
      assert.isUndefined(linuxManifest.bin);
      // The shipped node_modules is declared, or npm prunes it as extraneous
      // on the next install in the same project and the executable breaks.
      assert.deepStrictEqual(linuxManifest.dependencies, {
        "@ff-labs/fff-node": "0.9.4",
        "node-pty": "1.1.0",
      });
      assert.deepStrictEqual(linuxManifest.bundleDependencies, ["@ff-labs/fff-node", "node-pty"]);
      // Archive contents sit at the package root, not under the archive stem.
      assert.isTrue(yield* fs.exists(path.join(linuxDir, "client/index.html")));
      // A root README, or npm would display a bundled dependency's.
      assert.include(
        yield* fs.readFileString(path.join(linuxDir, "README.md")),
        "# @johnsax/takomi-code-linux-x64",
      );
      assert.isTrue(yield* fs.exists(path.join(linuxDir, "node_modules/node-pty")));
      // Windows does not expose POSIX executable permission bits.
      if (hostPlatform !== "win32") {
        assert.equal(Number((yield* fs.stat(path.join(linuxDir, "t3"))).mode) & 0o111, 0o111);
      }

      const darwinManifest = yield* decodeManifest(
        yield* fs.readFileString(
          path.join(fixture.outputDir, "@johnsax/takomi-code-darwin-arm64/package.json"),
        ),
      );
      assert.deepStrictEqual(darwinManifest.os, ["darwin"]);
      assert.deepStrictEqual(darwinManifest.cpu, ["arm64"]);

      const launcherDir = path.join(fixture.outputDir, "takomi-code");
      const launcherManifest = yield* decodeManifest(
        yield* fs.readFileString(path.join(launcherDir, "package.json")),
      );
      assert.equal(launcherManifest.name, "takomi-code");
      assert.equal(launcherManifest.version, VERSION);
      assert.deepStrictEqual(launcherManifest.repository, {
        type: "git",
        url: "https://github.com/JStaRFilms/Takomi-Code",
      });
      assert.deepStrictEqual(launcherManifest.bin, { "takomi-code": "./bin/takomi-code.js" });
      assert.deepStrictEqual(launcherManifest.files, ["bin", "dist"]);
      assert.deepStrictEqual(launcherManifest.optionalDependencies, {
        "@johnsax/takomi-code-darwin-arm64": VERSION,
        "@johnsax/takomi-code-linux-x64": VERSION,
      });
      assert.isUndefined(launcherManifest.engines);
      assert.isTrue(yield* fs.exists(path.join(launcherDir, "bin/takomi-code.js")));

      // The scratch dirs must not be left behind next to the packages.
      const outputEntries = yield* fs.readDirectory(fixture.outputDir);
      assert.deepStrictEqual(outputEntries.sort(), ["@johnsax", "takomi-code", "takomi-code.tgz"]);

      // The tarball is what gets published: it must carry node_modules (which
      // `npm publish <dir>` would strip) under npm's `package/` root, with the
      // executable bit intact.
      const listing = yield* run(
        "tar",
        ["-tzvf", path.join(fixture.outputDir, "@johnsax/takomi-code-linux-x64.tgz")],
        { cwd: fixture.outputDir },
      );
      assert.equal(listing.exitCode, 0, listing.stderr);
      const lines = listing.stdout.replaceAll("\\", "/").split(/\r?\n/);
      assert.isTrue(
        lines.some((line) => / package\/node_modules\/node-pty\/?$/.test(line)),
        listing.stdout,
      );
      assert.isTrue(lines.some((line) => line.endsWith(" package/package.json")));
      if (hostPlatform !== "win32") {
        assert.isTrue(
          lines.some((line) => /^-rwxr-xr-x .* package\/t3$/.test(line)),
          listing.stdout,
        );
      }

      // NODE_PATH stands in for node_modules: require.resolve finds the
      // platform package there exactly as it would after `npm install`.
      const hostArch = yield* HostProcessArchitecture;
      const env = { ...process.env, NODE_PATH: fixture.outputDir } as Record<string, string>;
      if (KEYS.some((key) => key === `${hostPlatform}-${hostArch}`)) {
        const passthrough = yield* run(
          process.execPath,
          ["bin/takomi-code.js", "serve", "--port", "1234"],
          {
            cwd: launcherDir,
            env,
          },
        );
        assert.equal(
          passthrough.stdout.trim(),
          `stub ${hostPlatform}-${hostArch} serve --port 1234`,
        );
        assert.equal(passthrough.exitCode, 7);

        // Run the entry point used by already-installed service updaters from
        // the published tarball, including their preflight arguments.
        const installedLauncher = path.join(fixture.root, "installed-launcher");
        yield* fs.makeDirectory(installedLauncher);
        const unpack = yield* run(
          "tar",
          ["-xf", path.join(fixture.outputDir, "takomi-code.tgz"), "-C", installedLauncher],
          {
            cwd: fixture.root,
          },
        );
        assert.equal(unpack.exitCode, 0, unpack.stderr);
        const legacy = yield* run(
          process.execPath,
          [
            "dist/bin.mjs",
            "__service-preflight",
            "--database-path",
            "a database.sqlite",
            "--launcher-protocol",
            "2",
          ],
          { cwd: path.join(installedLauncher, "package"), env },
        );
        assert.equal(
          legacy.stdout.trim(),
          `stub ${hostPlatform}-${hostArch} __service-preflight --database-path a database.sqlite --launcher-protocol 2`,
        );
        assert.equal(legacy.exitCode, 7);
      }

      const unsupported = yield* run(process.execPath, ["bin/takomi-code.js", "--version"], {
        cwd: launcherDir,
        env: { ...env, NODE_PATH: path.join(fixture.root, "nowhere") },
      });
      assert.equal(unsupported.exitCode, 1);
      assert.include(unsupported.stderr, "linux-x64");
      assert.notInclude(unsupported.stderr, "win32-arm64");
      assert.include(unsupported.stderr, "https://github.com/JStaRFilms/Takomi-Code/releases");
    }),
  );
});
