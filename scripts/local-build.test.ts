// @effect-diagnostics nodeBuiltinImport:off -- Local output lifecycle uses filesystem fixtures.
// @effect-diagnostics globalDate:off -- Fixed timestamp fixture for synchronous output reservation.
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";

import { localBuildOutput, runLocalBuild } from "./local-build.ts";

const now = new Date("2026-10-05T12:34:56.789Z");
type Output = ReturnType<typeof localBuildOutput>;

function fixtureRoot(t: NodeTest.TestContext): string {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "takomi-local-output-"));
  t.after(() => NodeFS.rmSync(root, { recursive: true, force: true }));
  return root;
}

function desktopName(output: Output, arch = "x64"): string {
  return `Takomi-Code-0.0.45-preview.${output.stamp}-${arch}.exe`;
}

function androidName(output: Output): string {
  return `Takomi-Code-Preview-2.0.0-9b452f8b-${output.stamp}-dirty.apk`;
}

NodeTest.test("reservations separate concurrent attempts and skip existing releases", (t) => {
  const root = fixtureRoot(t);
  const preview = localBuildOutput(root, true, now);
  NodeAssert.match(preview.stamp, /^20261005\.\d+$/u);
  NodeAssert.equal(NodeFS.existsSync(NodePath.join(root, "release")), false);

  NodeFS.mkdirSync(preview.directory, { recursive: true });
  const artifact = NodePath.join(preview.directory, "known-good.exe");
  NodeFS.writeFileSync(artifact, "known good");
  const first = localBuildOutput(root, false, now);
  const second = localBuildOutput(root, false, now);
  NodeAssert.notEqual(first.stamp, preview.stamp);
  NodeAssert.notEqual(second.stamp, first.stamp);
  NodeAssert.equal(NodeFS.existsSync(first.stagingDirectory), true);
  NodeAssert.equal(NodeFS.existsSync(second.stagingDirectory), true);
  NodeAssert.equal(NodeFS.existsSync(first.directory), false);
  NodeAssert.equal(NodeFS.existsSync(second.directory), false);
  NodeAssert.equal(NodeFS.readFileSync(artifact, "utf8"), "known good");
  NodeAssert.deepEqual(NodeFS.readdirSync(NodePath.join(root, "release")), [
    ".local-build",
    NodePath.basename(preview.directory),
  ]);

  const reservationsBefore = NodeFS.readdirSync(NodePath.dirname(first.stagingDirectory));
  const dryRun = localBuildOutput(root, true, now);
  NodeAssert.notEqual(dryRun.stamp, second.stamp);
  NodeAssert.deepEqual(
    NodeFS.readdirSync(NodePath.dirname(first.stagingDirectory)),
    reservationsBefore,
  );
});

NodeTest.test(
  "a failed build cleans staged files, creates no release, and reserves its retry number",
  (t) => {
    const root = fixtureRoot(t);
    const planned = localBuildOutput(root, true, now);
    const failure = new Error("packaging failed after writing partial output");
    NodeAssert.throws(
      () =>
        runLocalBuild(
          root,
          { desktop: true, android: true, dryRun: false },
          {
            desktop: (_root, _dryRun, output) => {
              NodeAssert.equal(NodeFS.existsSync(output.directory), false);
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, desktopName(output)),
                "partial installer",
              );
              NodeFS.mkdirSync(NodePath.join(output.stagingDirectory, "win-unpacked"));
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, "win-unpacked", "payload.exe"),
                "partial payload",
              );
              throw failure;
            },
            android: () => NodeAssert.fail("Android must not run after desktop fails"),
          },
          now,
        ),
      (error) => error === failure,
    );
    NodeAssert.equal(NodeFS.existsSync(planned.directory), false);
    NodeAssert.equal(NodeFS.existsSync(planned.stagingDirectory), false);
    NodeAssert.deepEqual(NodeFS.readdirSync(NodePath.dirname(planned.stagingDirectory)), [
      `${NodePath.basename(planned.stagingDirectory)}.reserved`,
    ]);

    const retry = runLocalBuild(
      root,
      { desktop: true, android: false, dryRun: false },
      {
        desktop: (_root, _dryRun, output) => {
          NodeFS.writeFileSync(
            NodePath.join(output.stagingDirectory, desktopName(output)),
            "finished installer",
          );
        },
        android: () => NodeAssert.fail("Android was not requested"),
      },
      now,
    );
    NodeAssert.notEqual(retry.stamp, planned.stamp);
    NodeAssert.equal(
      NodeFS.readFileSync(NodePath.join(retry.directory, desktopName(retry)), "utf8"),
      "finished installer",
    );
    NodeAssert.equal(NodeFS.existsSync(retry.stagingDirectory), false);
  },
);

NodeTest.test(
  "desktop survives a later Android failure without publishing the partial APK",
  (t) => {
    const root = fixtureRoot(t);
    const planned = localBuildOutput(root, true, now);
    const oldArtifact = NodePath.join(root, "release", "older.apk");
    NodeFS.mkdirSync(NodePath.dirname(oldArtifact));
    NodeFS.writeFileSync(oldArtifact, "previous release");
    NodeAssert.throws(
      () =>
        runLocalBuild(
          root,
          { desktop: true, android: true, dryRun: false },
          {
            desktop: (_root, _dryRun, output) => {
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, desktopName(output)),
                "completed desktop",
              );
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, "builder-debug.yml"),
                "builder report",
              );
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, "latest.yml"),
                "not a preview update feed",
              );
            },
            android: (_root, _dryRun, output) => {
              NodeAssert.equal(
                NodeFS.readFileSync(NodePath.join(output.directory, desktopName(output)), "utf8"),
                "completed desktop",
              );
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, androidName(output)),
                "partial APK",
              );
              throw new Error("Gradle failed");
            },
          },
          now,
        ),
      /Gradle failed/u,
    );
    NodeAssert.deepEqual(NodeFS.readdirSync(planned.directory), [desktopName(planned)]);
    NodeAssert.equal(NodeFS.existsSync(planned.stagingDirectory), false);
    NodeAssert.equal(NodeFS.readFileSync(oldArtifact, "utf8"), "previous release");
  },
);

NodeTest.test(
  "successful targets publish only installables and remove builder intermediates",
  (t) => {
    const root = fixtureRoot(t);
    const output = runLocalBuild(
      root,
      { desktop: true, android: true, dryRun: false },
      {
        desktop: (_root, _dryRun, attempt) => {
          NodeFS.writeFileSync(
            NodePath.join(attempt.stagingDirectory, desktopName(attempt, "arm64")),
            "installer",
          );
          NodeFS.writeFileSync(
            NodePath.join(attempt.stagingDirectory, `${desktopName(attempt, "arm64")}.blockmap`),
            "blockmap",
          );
          NodeFS.writeFileSync(
            NodePath.join(attempt.stagingDirectory, "builder-debug.yml"),
            "report",
          );
          NodeFS.mkdirSync(NodePath.join(attempt.stagingDirectory, "win-arm64-unpacked"));
        },
        android: (_root, _dryRun, attempt) => {
          NodeAssert.equal(
            NodeFS.existsSync(NodePath.join(attempt.directory, desktopName(attempt, "arm64"))),
            true,
          );
          NodeFS.writeFileSync(
            NodePath.join(attempt.stagingDirectory, androidName(attempt)),
            "APK",
          );
        },
      },
      now,
    );
    NodeAssert.deepEqual(
      NodeFS.readdirSync(output.directory).sort(),
      [desktopName(output, "arm64"), androidName(output)].sort(),
    );
    NodeAssert.equal(NodeFS.existsSync(output.stagingDirectory), false);
  },
);

NodeTest.test(
  "reports, unpacked payloads, uninstallers, stale installers and empty EXEs are not success",
  (t) => {
    const root = fixtureRoot(t);
    const planned = localBuildOutput(root, true, now);
    NodeAssert.throws(
      () =>
        runLocalBuild(
          root,
          { desktop: true, android: false, dryRun: false },
          {
            desktop: (_root, _dryRun, output) => {
              NodeFS.writeFileSync(NodePath.join(output.stagingDirectory, desktopName(output)), "");
              NodeFS.mkdirSync(
                NodePath.join(output.stagingDirectory, desktopName(output, "arm64")),
              );
              NodeFS.mkdirSync(NodePath.join(output.stagingDirectory, "win-unpacked"));
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, "win-unpacked", desktopName(output)),
                "unpacked app",
              );
              NodeFS.writeFileSync(
                NodePath.join(
                  output.stagingDirectory,
                  "Takomi-Code-0.0.45-preview.20261004.123-x64.exe",
                ),
                "stale installer",
              );
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, "__uninstaller-nsis-Takomi Code.exe"),
                "uninstaller",
              );
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, "builder-debug.yml"),
                "report",
              );
            },
            android: () => NodeAssert.fail("Android was not requested"),
          },
          now,
        ),
      /desktop build completed but produced no nonempty installable/u,
    );
    NodeAssert.equal(NodeFS.existsSync(planned.directory), false);
    NodeAssert.equal(NodeFS.existsSync(planned.stagingDirectory), false);
  },
);

NodeTest.test("an Android-only build requires a nonzero APK from the current attempt", (t) => {
  const root = fixtureRoot(t);
  const planned = localBuildOutput(root, true, now);
  NodeAssert.throws(
    () =>
      runLocalBuild(
        root,
        { desktop: false, android: true, dryRun: false },
        {
          desktop: () => NodeAssert.fail("Desktop was not requested"),
          android: (_root, _dryRun, output) => {
            NodeFS.writeFileSync(NodePath.join(output.stagingDirectory, androidName(output)), "");
            NodeFS.writeFileSync(
              NodePath.join(
                output.stagingDirectory,
                "Takomi-Code-Preview-2.0.0-9b452f8b-20261004.123.apk",
              ),
              "stale APK",
            );
          },
        },
        now,
      ),
    /android build completed but produced no nonempty installable/u,
  );
  NodeAssert.equal(NodeFS.existsSync(planned.directory), false);
  NodeAssert.equal(NodeFS.existsSync(planned.stagingDirectory), false);
});

NodeTest.test(
  "publication refuses a release created after reservation without changing it",
  (t) => {
    const root = fixtureRoot(t);
    const planned = localBuildOutput(root, true, now);
    NodeAssert.throws(
      () =>
        runLocalBuild(
          root,
          { desktop: true, android: false, dryRun: false },
          {
            desktop: (_root, _dryRun, output) => {
              NodeFS.writeFileSync(
                NodePath.join(output.stagingDirectory, desktopName(output)),
                "new installer",
              );
              NodeFS.mkdirSync(output.directory);
              NodeFS.writeFileSync(
                NodePath.join(output.directory, desktopName(output)),
                "existing installer",
              );
            },
            android: () => NodeAssert.fail("Android was not requested"),
          },
          now,
        ),
      { code: "EEXIST" },
    );
    NodeAssert.equal(
      NodeFS.readFileSync(NodePath.join(planned.directory, desktopName(planned)), "utf8"),
      "existing installer",
    );
    NodeAssert.equal(NodeFS.existsSync(planned.stagingDirectory), false);
  },
);

NodeTest.test("dry-run plans both targets without writing staging or release files", (t) => {
  const root = fixtureRoot(t);
  const targets: string[] = [];
  runLocalBuild(
    root,
    { desktop: true, android: true, dryRun: true },
    {
      desktop: (_root, dryRun, output) => {
        NodeAssert.equal(dryRun, true);
        NodeAssert.equal(NodeFS.existsSync(output.stagingDirectory), false);
        targets.push("desktop");
      },
      android: (_root, dryRun, output) => {
        NodeAssert.equal(dryRun, true);
        NodeAssert.equal(NodeFS.existsSync(output.directory), false);
        targets.push("android");
      },
    },
    now,
  );
  NodeAssert.deepEqual(targets, ["desktop", "android"]);
  NodeAssert.deepEqual(NodeFS.readdirSync(root), []);
});
