import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { hydratePosixHome, resolveBaseDir } from "./os-jank.ts";

it.layer(NodeServices.layer)("Takomi server home", (it) => {
  it.effect("defaults to Takomi's directory without overriding explicit homes", () =>
    Effect.gen(function* () {
      assert.equal(
        yield* resolveBaseDir(undefined),
        NodePath.join(NodeOS.homedir(), ".takomi-code"),
      );
      assert.equal(yield* resolveBaseDir("  "), NodePath.join(NodeOS.homedir(), ".takomi-code"));
      assert.equal(
        yield* resolveBaseDir("~/custom-server"),
        NodePath.join(NodeOS.homedir(), "custom-server"),
      );
    }),
  );
});

it("hydrates HOME for minimal service environments from the user account", () => {
  const env: NodeJS.ProcessEnv = {};

  hydratePosixHome(env);

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("hydrates HOME independently of a blank process HOME", () => {
  const originalHome = process.env.HOME;
  const env: NodeJS.ProcessEnv = { HOME: " " };

  try {
    process.env.HOME = " ";
    hydratePosixHome(env);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("preserves an explicitly configured HOME", () => {
  const env: NodeJS.ProcessEnv = { HOME: "/custom/home" };

  hydratePosixHome(env, () => {
    throw new Error("HOME lookup should not run");
  });

  assert.equal(env.HOME, "/custom/home");
});
