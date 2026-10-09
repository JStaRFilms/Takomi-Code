import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { PI_PROVIDER_IDENTITY } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as TestClock from "effect/testing/TestClock";
import { resolvePiLaunchResources } from "./PiLaunchResources.ts";
import { piRecordString } from "./rpc.ts";
import { checkPiProviderStatus, discoverPiResources, MINIMUM_PI_VERSION } from "./status.ts";

const encoder = new TextEncoder();
const decodeJson = Schema.decodeSync(Schema.fromJsonString(Schema.Unknown));

function normalizeArgs(args: ReadonlyArray<string>): ReadonlyArray<string> {
  return args.map((arg) =>
    arg.startsWith('^"') && arg.endsWith('^"') ? arg.slice(2, -2).replace(/\^(.)/g, "$1") : arg,
  );
}

function processHandle(input: {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
}) {
  const bytes = (value: string | undefined) =>
    value === undefined || value.length === 0
      ? Stream.empty
      : Stream.succeed(encoder.encode(value));
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(900_000_001),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(input.exitCode ?? 0)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: bytes(input.stdout),
    stderr: bytes(input.stderr),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

function piProbeSpawner(version: string) {
  return ChildProcessSpawner.make((command) => {
    const args = ChildProcess.isStandardCommand(command) ? normalizeArgs(command.args) : [];
    return Effect.succeed(
      args.includes("--version")
        ? processHandle({ stdout: `pi ${version}\n` })
        : processHandle({ stderr: "RPC startup failed", exitCode: 1 }),
    );
  });
}

const settings = {
  enabled: true,
  binaryPath: "pi",
  homePath: "",
  suiteRoot: "",
  launchArgs: "",
  customModels: [],
} as const;

const makeRpcProbe = Effect.gen(function* () {
  const stdout = yield* Queue.unbounded<Uint8Array, Cause.Done>();
  const commandsRequested = yield* Deferred.make<void>();
  const spawned: ChildProcess.StandardCommand[] = [];
  let hangCommands = false;
  const spawner = ChildProcessSpawner.make((command) => {
    if (!ChildProcess.isStandardCommand(command)) return Effect.die("Unexpected pipeline");
    spawned.push(command);
    if (normalizeArgs(command.args).includes("--version")) {
      return Effect.succeed(processHandle({ stdout: "pi 0.84.3\n" }));
    }
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(900_000_001),
        exitCode: Effect.never,
        isRunning: Effect.succeed(true),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.forEach((chunk: Uint8Array) =>
          Effect.gen(function* () {
            const record = decodeJson(new TextDecoder().decode(chunk).trim());
            const type = piRecordString(record, "type");
            if (type === "get_commands") {
              yield* Deferred.succeed(commandsRequested, undefined);
              if (hangCommands) return;
            }
            const data =
              type === "get_state"
                ? { thinkingLevel: "high" }
                : type === "get_available_models"
                  ? {
                      models: [
                        { provider: "custom", id: "model", name: "Custom model", reasoning: true },
                      ],
                    }
                  : {
                      commands: [
                        { name: "task", source: "extension", description: "Run a task" },
                        {
                          name: "skill:review",
                          source: "skill",
                          path: "/private/skills/review/SKILL.md",
                          sourceInfo: { scope: "project" },
                        },
                      ],
                    };
            yield* Queue.offer(
              stdout,
              encoder.encode(
                `${JSON.stringify({
                  type: "response",
                  id: piRecordString(record, "id"),
                  command: type,
                  success: true,
                  data,
                })}\n`,
              ),
            );
          }),
        ),
        stdout: Stream.fromQueue(stdout),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      }),
    );
  });
  return {
    spawner,
    spawned,
    commandsRequested,
    hang: () => {
      hangCommands = true;
    },
  };
});

describe("PiProvider", () => {
  it.effect("requires the first published Pi version with entries and settlement hooks", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkPiProviderStatus(settings).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, piProbeSpawner("0.80.3")),
      );
      assert.equal(snapshot.status, "error");
      assert.equal(snapshot.version, "0.80.3");
      assert.include(snapshot.message ?? "", `Pi ${MINIMUM_PI_VERSION} or newer`);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps compatible Pi selectable when optional discovery fails", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkPiProviderStatus(settings).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, piProbeSpawner("0.84.3")),
      );
      assert.equal(snapshot.status, "ready");
      assert.equal(snapshot.auth.status, "unknown");
      assert.deepEqual(
        snapshot.models.map((model) => model.slug),
        ["default"],
      );
      assert.include(snapshot.message ?? "", "could not refresh its models and commands");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps Takomi identity, V2 permission modes, and configured credentials", () =>
    Effect.gen(function* () {
      const probe = yield* makeRpcProbe;
      const snapshot = yield* checkPiProviderStatus(
        {
          ...settings,
          homePath: "/custom/agent",
          launchArgs: "--approve",
        },
        {},
      ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, probe.spawner));
      assert.equal(snapshot.displayName, PI_PROVIDER_IDENTITY.displayName);
      assert.deepEqual(snapshot.supportedRuntimeModes, [
        "approval-required",
        "auto-accept-edits",
        "full-access",
      ]);
      assert.equal(snapshot.auth.status, "authenticated");
      assert.deepEqual(
        snapshot.models.map((model) => model.slug),
        ["default", "custom/model"],
      );
      assert.isUndefined(snapshot.models[0]?.subProvider);
      assert.equal(snapshot.models[1]?.subProvider, "custom");
      const launch = probe.spawned[1];
      assert.equal(launch?.options.env?.PI_CODING_AGENT_DIR, "/custom/agent");
      assert.include(normalizeArgs(launch?.args ?? []), "--no-approve");
      assert.notInclude(normalizeArgs(launch?.args ?? []), "--approve");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("discovers cwd resources without exposing host paths", () =>
    Effect.gen(function* () {
      const probe = yield* makeRpcProbe;
      const discovery = yield* discoverPiResources(settings, "/workspace", {}).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, probe.spawner),
      );
      assert.equal(discovery.status, "available");
      if (discovery.status !== "available") return;
      assert.deepEqual(
        discovery.resources.slashCommands.map((command) => command.name),
        ["task"],
      );
      assert.equal(discovery.resources.skills[0]?.path, "pi-resource:1");
      assert.equal(probe.spawned[0]?.options.cwd, "/workspace");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("bounds a non-responsive resource probe", () =>
    Effect.gen(function* () {
      const probe = yield* makeRpcProbe;
      probe.hang();
      const fiber = yield* discoverPiResources(
        settings,
        "/workspace",
        {},
        { deadline: "100 millis" },
      ).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, probe.spawner),
        Effect.forkChild,
      );
      yield* Deferred.await(probe.commandsRequested);
      yield* TestClock.adjust("100 millis");
      assert.deepEqual(yield* Fiber.join(fiber), { status: "unavailable", reason: "deadline" });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "loads suite resources and companion extensions without duplicate global Takomi copies",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const homePath = path.join(root, "agent");
        yield* fs.makeDirectory(path.join(root, ".pi", "prompts"), { recursive: true });
        for (const name of [
          "takomi-runtime",
          "takomi-subagents",
          "oauth-router",
          "takomi-context-manager",
          "notify-sound",
          "antigravity-provider",
        ]) {
          const directory = path.join(root, ".pi", "extensions", name);
          yield* fs.makeDirectory(directory, { recursive: true });
          yield* fs.writeFileString(path.join(directory, "index.ts"), "");
        }
        const globalDirectory = path.join(homePath, "extensions", "takomi-runtime");
        yield* fs.makeDirectory(globalDirectory, { recursive: true });
        yield* fs.writeFileString(path.join(globalDirectory, "index.ts"), "");
        const companion = path.join(homePath, "extensions", "companion.ts");
        yield* fs.writeFileString(companion, "");
        const resources = yield* resolvePiLaunchResources({
          settings: { ...settings, homePath, suiteRoot: root },
          cwd: "/workspace",
          environment: {},
        });
        assert.deepEqual(resources.missingPaths, []);
        assert.include(
          resources.args,
          path.join(root, ".pi", "extensions", "takomi-runtime", "index.ts"),
        );
        assert.include(resources.args, companion);
        assert.notInclude(resources.args, path.join(globalDirectory, "index.ts"));
        assert.include(resources.args, path.join(root, ".pi", "prompts"));
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
