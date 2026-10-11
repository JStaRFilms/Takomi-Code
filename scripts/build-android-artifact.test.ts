// @effect-diagnostics nodeBuiltinImport:off -- Reads the actual mobile configuration for staging regression coverage.
import * as NodeFS from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import {
  ANDROID_TOOLCHAIN,
  androidBuildEnvironment,
  androidReleasePlan,
  androidSigningOverride,
  requireAndroidSigning,
  stageAndroidReleaseConfig,
  verifyAndroidApk,
} from "./build-android-artifact.ts";

describe("Android release versions", () => {
  it("keeps React Native compile API separate from the published platform package", () => {
    expect(ANDROID_TOOLCHAIN.compileSdkPackage).toBe("37.0");
    expect(androidReleasePlan("0.1.2", "stable").gradleArgs).toContain(
      "-Pandroid.compileSdkVersion=37",
    );
  });

  it("orders stable upgrades across patch, minor, and major boundaries", () => {
    const versions = ["0.0.0", "0.1.2", "0.999.999", "1.0.0", "2099.999.999"];
    const codes = versions.map((version) => androidReleasePlan(version, "stable").versionCode);
    expect(codes).toEqual([1, 1003, 1_000_000, 1_000_001, 2_100_000_000]);
    expect(codes.every((code, index) => index === 0 || code > (codes[index - 1] ?? 0))).toBe(true);
  });

  it.each([
    "01.2.3",
    "1.1000.0",
    "1.0.1000",
    "2100.0.0",
    "9007199254740992.0.0",
    "1.2.3-beta.1",
    "1.2.3+build",
    "v1.2.3",
    "-1.2.3",
  ])("rejects unsafe or non-stable version %s", (version) => {
    expect(() => androidReleasePlan(version, "stable")).toThrow();
  });

  it("keeps debug-signed previews separate from production upgrades", () => {
    const preview = androidReleasePlan("0.1.2-preview.20261011.4", "preview");
    const stable = androidReleasePlan("0.1.2", "stable");
    expect(preview.packageId).not.toBe(stable.packageId);
    expect(preview.artifactName).toBe(
      "Takomi-Code-Preview-0.1.2-preview.20261011.4-android-arm64-v8a-debug.apk",
    );
    expect(stable.artifactName).toBe("Takomi-Code-0.1.2-android-arm64-v8a.apk");
    expect(() => androidReleasePlan(preview.version, "stable")).toThrow();
    expect(() => androidReleasePlan(stable.version, "preview")).toThrow();
    expect(androidSigningOverride("stable")).toContain("signingConfig = null");
    expect(androidSigningOverride("preview")).toContain("signingConfigs.debug");
  });

  it("stages literals for Expo and fingerprinting without changing iOS or source defaults", () => {
    const source = NodeFS.readFileSync(
      new URL("../apps/mobile/app.config.ts", import.meta.url),
      "utf8",
    );
    const staged = stageAndroidReleaseConfig(source, androidReleasePlan("0.1.2", "stable"));
    expect(staged.match(/^ {2}version: "(\d+)\./mu)?.[1]).toBe("0");
    expect(staged).toContain("    versionCode: 1003,");
    expect(
      staged
        .replace('  version: "0.1.2",', '  version: "2.0.0",')
        .replace("    versionCode: 1003,", "    versionCode: 3,"),
    ).toBe(source);
    expect(() =>
      stageAndroidReleaseConfig(
        source.replace("versionCode: 3", "versionCode: readCode()"),
        androidReleasePlan("0.1.2", "stable"),
      ),
    ).toThrow("unique");
  });
});

describe("Android signing isolation", () => {
  const credentials = {
    RUNNER_TEMP: "/runner/temp",
    TAKOMI_ANDROID_KEYSTORE_BASE64: "private-test-placeholder",
    TAKOMI_ANDROID_KEYSTORE_PASSWORD: "store-test-placeholder",
    TAKOMI_ANDROID_KEY_ALIAS: "release-test-placeholder",
    TAKOMI_ANDROID_KEY_PASSWORD: "key-test-placeholder",
  };

  it("fails closed for each absent stable credential, including the temporary directory", () => {
    expect(() => requireAndroidSigning(credentials)).not.toThrow();
    for (const name of Object.keys(credentials)) {
      expect(() => requireAndroidSigning({ ...credentials, [name]: undefined })).toThrow(name);
    }
  });

  it.each(["stable", "preview"] as const)(
    "keeps credentials out of %s prebuild/Gradle/bundle processes and disables OTA",
    (channel) => {
      const plan = androidReleasePlan(
        channel === "stable" ? "0.1.2" : "0.1.2-preview.20261011.4",
        channel,
      );
      const env = androidBuildEnvironment(
        {
          ...credentials,
          ANDROID_HOME: "/sdk",
          T3CODE_MOBILE_UPDATES_ENABLED: "1",
          APP_VARIANT: "development",
        },
        plan,
      );
      expect(Object.keys(env).some((name) => name.startsWith("TAKOMI_ANDROID_"))).toBe(false);
      expect(env.T3CODE_MOBILE_UPDATES_ENABLED).toBe("0");
      expect(env.APP_VARIANT).toBe(channel === "stable" ? "production" : "preview");
      expect(env.ANDROID_HOME).toBe("/sdk");
    },
  );
});

describe("Android APK collection", () => {
  const certificate = "ab".repeat(32);
  const valid = {
    plan: androidReleasePlan("0.1.2", "stable"),
    packageId: "com.jstarstudios.takomicode\n",
    version: "0.1.2\n",
    versionCode: "1003\n",
    minSdk: "24\n",
    targetSdk: "36\n",
    debuggable: "false\n",
    files:
      "/assets/index.android.bundle\n/lib/arm64-v8a/libhermes.so\n/lib/arm64-v8a/libreactnative.so\n",
    manifest:
      '<manifest><application><meta-data android:name="expo.modules.updates.ENABLED" android:value="false" /></application></manifest>',
    certificates: `Verified\nSigner #1 certificate SHA-256 digest: ${certificate}\n`,
    expectedCertificate: certificate,
  };

  it("accepts only the requested installable, embedded-JS, OTA-disabled, release-signed APK", () => {
    expect(() => verifyAndroidApk(valid)).not.toThrow();
  });

  it("accepts the SDK 37 V3.0 signer certificate label", () => {
    expect(() =>
      verifyAndroidApk({
        ...valid,
        certificates: `Verified\nV3.0 Signer: certificate SHA-256 digest: ${certificate}\n`,
      }),
    ).not.toThrow();
  });

  it.each([
    { packageId: "com.jstarstudios.takomicode.preview" },
    { version: "2.0.0" },
    { versionCode: "3" },
    { minSdk: "26" },
    { targetSdk: "35" },
    { debuggable: "true" },
    { files: "/lib/arm64-v8a/libhermes.so\n" },
    { files: `${valid.files}/lib/x86_64/libhermes.so\n` },
    { files: "/assets/index.android.bundle\n" },
    { manifest: valid.manifest.replace('android:value="false"', 'android:value="true"') },
    { manifest: "<manifest />" },
    { certificates: `Signer #1 certificate SHA-256 digest: ${"cd".repeat(32)}\n` },
    { certificates: `${valid.certificates}Signer #2 certificate SHA-256 digest: ${certificate}\n` },
    { certificates: "" },
    { certificates: `V4.0 Signer: certificate SHA-256 digest: ${certificate}\n` },
  ])("rejects mismatched metadata before collection: %j", (mismatch) => {
    expect(() => verifyAndroidApk({ ...valid, ...mismatch })).toThrow();
  });
});
