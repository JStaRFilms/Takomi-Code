import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopConfig from "./DesktopConfig.ts";

const defaultInput = {
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "darwin",
  processArch: "arm64",
  appVersion: "0.0.22",
  appPath: "/Applications/T3 Code.app/Contents/Resources/app.asar",
  isPackaged: false,
  resourcesPath: "/Applications/T3 Code.app/Contents/Resources",
  runningUnderArm64Translation: false,
} satisfies DesktopEnvironment.MakeDesktopEnvironmentInput;

const makeEnvironmentLayer = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.layer({
    ...defaultInput,
    ...overrides,
  }).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest(env))));

const makeEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.DesktopEnvironment.pipe(Effect.provide(makeEnvironmentLayer(overrides, env)));

const normalize = (value: string) => value.replaceAll("\\", "/").replace(/^[A-Za-z]:/, "");
const normalizeOption = (option: Option.Option<string>) =>
  Option.map(option, (value) => normalize(value));

describe("DesktopEnvironment", () => {
  it.effect("derives state paths and development identity inside Effect", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          T3CODE_HOME: " /tmp/t3 ",
          T3CODE_COMMIT_HASH: " 0123456789abcdef ",
          T3CODE_PORT: "4949",
          VITE_DEV_SERVER_URL: "http://localhost:5173",
          T3CODE_DEV_REMOTE_T3_SERVER_ENTRY_PATH: " /remote/server.mjs ",
          T3CODE_OTLP_TRACES_URL: " http://127.0.0.1:4318/v1/traces ",
          T3CODE_OTLP_EXPORT_INTERVAL_MS: "2500",
        },
      );

      assert.equal(environment.isDevelopment, true);
      assert.equal(
        normalize(environment.appDataDirectory),
        "/Users/alice/Library/Application Support",
      );
      assert.equal(normalize(environment.baseDir), "/tmp/t3");
      assert.equal(normalize(environment.stateDir), "/tmp/t3/userdata");
      assert.equal(
        normalize(environment.desktopSettingsPath),
        "/tmp/t3/userdata/desktop-settings.json",
      );
      assert.equal(
        normalize(environment.clientSettingsPath),
        "/tmp/t3/userdata/client-settings.json",
      );
      assert.equal(
        normalize(environment.savedEnvironmentRegistryPath),
        "/tmp/t3/userdata/saved-environments.json",
      );
      assert.equal(normalize(environment.serverSettingsPath), "/tmp/t3/userdata/settings.json");
      assert.equal(normalize(environment.logDir), "/tmp/t3/userdata/logs");
      assert.equal(
        normalize(environment.browserArtifactsDir),
        "/tmp/t3/userdata/browser-artifacts",
      );
      assert.equal(normalize(environment.rootDir), "/repo");
      assert.equal(normalize(environment.appRoot), "/repo");
      assert.equal(normalize(environment.serverRoot), "/repo");
      assert.equal(normalize(environment.backendEntryPath), "/repo/apps/server/dist/bin.mjs");
      assert.equal(normalize(environment.backendCwd), "/repo");
      assert.equal(environment.appUserModelId, "com.jstarfilms.takomicode.dev");
      assert.equal(environment.linuxWmClass, "takomi-code-dev");
      assert.deepEqual(
        Option.map(environment.devServerUrl, (url) => url.href),
        Option.some("http://localhost:5173/"),
      );
      assert.deepEqual(environment.devRemoteT3ServerEntryPath, Option.some("/remote/server.mjs"));
      assert.deepEqual(environment.configuredBackendPort, Option.some(4949));
      assert.deepEqual(environment.commitHashOverride, Option.some("0123456789abcdef"));
      assert.deepEqual(environment.otlpTracesUrl, Option.some("http://127.0.0.1:4318/v1/traces"));
      assert.equal(environment.otlpExportIntervalMs, 2500);
    }),
  );

  it.effect("stores production state under userdata in an explicit home", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          T3CODE_HOME: "/tmp/t3",
        },
      );

      assert.equal(environment.isDevelopment, false);
      assert.equal(normalize(environment.stateDir), "/tmp/t3/userdata");
      assert.equal(normalize(environment.logDir), "/tmp/t3/userdata/logs");
      assert.equal(
        normalize(environment.browserArtifactsDir),
        "/tmp/t3/userdata/browser-artifacts",
      );
      assert.equal(normalize(environment.serverSettingsPath), "/tmp/t3/userdata/settings.json");
    }),
  );

  it.effect("uses the packaged Windows server sidecar as the backend root", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment({
        platform: "win32",
        isPackaged: true,
        appPath: "/install/resources/app.asar",
        resourcesPath: "/install/resources",
      });

      assert.equal(normalize(environment.appRoot), "/install/resources/app.asar");
      assert.equal(normalize(environment.serverRoot), "/install/resources/server.asar");
      assert.equal(
        normalize(environment.backendEntryPath),
        "/install/resources/server.asar/apps/server/dist/bin.mjs",
      );
    }),
  );

  it.effect("keeps implicit development state separate from production state", () =>
    Effect.gen(function* () {
      const development = yield* makeEnvironment(
        {},
        { VITE_DEV_SERVER_URL: "http://localhost:5173" },
      );
      const production = yield* makeEnvironment();

      assert.equal(normalize(development.stateDir), "/Users/alice/.takomi-code/dev");
      assert.equal(normalize(production.stateDir), "/Users/alice/.takomi-code/userdata");
    }),
  );

  it.effect("uses a configured app user model id override", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          T3CODE_DESKTOP_APP_USER_MODEL_ID: " com.jstarfilms.takomicode.dev.local ",
          VITE_DEV_SERVER_URL: "http://localhost:5173",
        },
      );

      assert.equal(environment.appUserModelId, "com.jstarfilms.takomicode.dev.local");
    }),
  );

  it.effect("resolves picker defaults without nullish sentinels", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment();

      assert.deepEqual(environment.resolvePickFolderDefaultPath(null), Option.none());
      assert.deepEqual(
        environment.resolvePickFolderDefaultPath({ initialPath: " " }),
        Option.none(),
      );
      assert.deepEqual(
        normalizeOption(environment.resolvePickFolderDefaultPath({ initialPath: "~" })),
        Option.some("/Users/alice"),
      );
      assert.deepEqual(
        normalizeOption(environment.resolvePickFolderDefaultPath({ initialPath: "~/project" })),
        Option.some("/Users/alice/project"),
      );
    }),
  );
});
