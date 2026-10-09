import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopLegacyLocalStorage from "./DesktopLegacyLocalStorage.ts";

// Checksummed LevelDB records: a manifest naming log 2, then a WriteBatch with
// Takomi's draft/theme and a stock-origin item that must not be imported.
const manifest = Buffer.from("63453c67060001020203030403", "hex");
const log = Buffer.from(
  "30eea98e7d0001010000000000000003000000" +
    "01195f74616b6f6d692d636f64653a2f2f617070000164726166740d0154616b6f6d69206472616674" +
    "01195f74616b6f6d692d636f64653a2f2f61707000017468656d6505016461726b" +
    "01195f7433636f64653a2f2f617070000173746f636b2d6f6e6c790b016e6f742054616b6f6d69",
  "hex",
);

const writeProfile = Effect.fn(function* (directory: string, name: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const storage = path.join(directory, name, "Local Storage", "leveldb");
  yield* fs.makeDirectory(storage, { recursive: true });
  yield* fs.writeFileString(path.join(storage, "CURRENT"), "MANIFEST-000001\n");
  yield* fs.writeFile(path.join(storage, "MANIFEST-000001"), manifest);
  yield* fs.writeFile(path.join(storage, "000002.log"), log);
});

const layerImporter = (directory: string) =>
  DesktopLegacyLocalStorage.layer.pipe(
    Layer.provide(
      DesktopEnvironment.layer({
        dirname: directory,
        homeDirectory: directory,
        platform: "win32",
        processArch: "x64",
        appVersion: "0.0.45",
        appPath: directory,
        isPackaged: true,
        resourcesPath: directory,
        runningUnderArm64Translation: false,
      }).pipe(Layer.provide(DesktopConfig.layerTest({ APPDATA: directory }))),
    ),
  );

it.effect.each(["Takomi Code (Alpha)", "takomi-code"])(
  "imports drafts and preferences from %s once, marking only after completion",
  (sourceName) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "takomi-local-storage-" });
      const destination = path.join(directory, "takomi-code-v2");
      const marker = path.join(destination, "v1-local-storage-imported");
      yield* fs.makeDirectory(destination);
      yield* writeProfile(directory, sourceName);
      const importer = yield* DesktopLegacyLocalStorage.DesktopLegacyLocalStorage.pipe(
        Effect.provide(layerImporter(directory)),
      );

      yield* importer.load(destination);
      assert.isFalse(yield* fs.exists(marker));
      assert.deepEqual(yield* importer.take, Option.some({ draft: "Takomi draft", theme: "dark" }));
      assert.deepEqual(yield* importer.take, Option.none());
      assert.isFalse(yield* fs.exists(marker));
      yield* importer.complete;
      assert.equal(yield* fs.readFileString(marker), "");
      assert.deepEqual(
        yield* fs.readFile(
          path.join(directory, sourceName, "Local Storage", "leveldb", "000002.log"),
        ),
        new Uint8Array(log),
      );

      const nextLaunch = yield* DesktopLegacyLocalStorage.DesktopLegacyLocalStorage.pipe(
        Effect.provide(layerImporter(directory)),
      );
      yield* nextLaunch.load(destination);
      assert.deepEqual(yield* nextLaunch.take, Option.none());
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("ignores stock T3 profiles and marks a launch with no Takomi source", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "takomi-local-storage-" });
    const destination = path.join(directory, "takomi-code-v2");
    yield* fs.makeDirectory(destination);
    yield* writeProfile(directory, "T3 Code (Alpha)");
    yield* writeProfile(directory, "t3code");
    const importer = yield* DesktopLegacyLocalStorage.DesktopLegacyLocalStorage.pipe(
      Effect.provide(layerImporter(directory)),
    );

    yield* importer.load(destination);
    assert.deepEqual(yield* importer.take, Option.none());
    assert.equal(yield* fs.readFileString(path.join(destination, "v1-local-storage-imported")), "");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
