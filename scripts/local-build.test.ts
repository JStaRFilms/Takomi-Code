// @effect-diagnostics nodeBuiltinImport:off -- Local output reservation uses filesystem fixtures.
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";

import { localBuildOutput } from "./local-build.ts";

NodeTest.test("local build attempts reserve separate outputs even in the same millisecond", (t) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "takomi-local-output-"));
  t.after(() => NodeFS.rmSync(root, { recursive: true, force: true }));
  const now = new Date("2026-10-05T12:34:56.789Z");
  const preview = localBuildOutput(root, true, now);
  NodeAssert.match(preview.stamp, /^20261005\.\d+$/u);
  NodeAssert.equal(NodeFS.existsSync(NodePath.join(root, "release")), false);

  const first = localBuildOutput(root, false, now);
  const artifact = NodePath.join(first.directory, "known-good.exe");
  NodeFS.writeFileSync(artifact, "known good");
  const second = localBuildOutput(root, false, now);
  NodeAssert.notEqual(second.directory, first.directory);
  NodeAssert.equal(NodeFS.readFileSync(artifact, "utf8"), "known good");
  NodeAssert.equal(NodeFS.readdirSync(NodePath.join(root, "release")).length, 2);
});
