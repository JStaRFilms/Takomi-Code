#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off -- Synchronous native release packaging, like local-build.ts.

import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";

export const ANDROID_TOOLCHAIN = {
  gradle: "9.4.1",
  java: "17",
  compileSdk: "37",
  targetSdk: "36",
  buildTools: "37.0.0",
  ndk: "27.1.12297006",
} as const;

const signingNames = [
  "TAKOMI_ANDROID_KEYSTORE_BASE64",
  "TAKOMI_ANDROID_KEYSTORE_PASSWORD",
  "TAKOMI_ANDROID_KEY_ALIAS",
  "TAKOMI_ANDROID_KEY_PASSWORD",
] as const;

type Environment = Readonly<Record<string, string | undefined>>;
type Channel = "stable" | "preview";

export function androidReleasePlan(version: string, channel: Channel) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-preview\.(\d{8})\.(0|[1-9]\d*))?$/u.exec(version);
  if (!match || (channel === "stable" ? Boolean(match[4]) : !match[4])) {
    throw new Error(
      `Expected ${channel === "stable" ? "plain X.Y.Z" : "X.Y.Z-preview.YYYYMMDD.N"} Android version.`,
    );
  }
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (![major, minor, patch].every(Number.isSafeInteger) || minor >= 1000 || patch >= 1000) {
    throw new Error("Android versions require safe integers and minor/patch below 1000.");
  }
  const versionCode = 1 + major * 1_000_000 + minor * 1000 + patch;
  if (!Number.isSafeInteger(versionCode) || versionCode > 2_100_000_000) {
    throw new Error("Android versionCode exceeds 2100000000.");
  }
  return {
    version,
    versionCode,
    channel,
    variant: channel === "stable" ? "production" : "preview",
    packageId: `com.jstarstudios.takomicode${channel === "stable" ? "" : ".preview"}`,
    artifactName:
      channel === "stable"
        ? `Takomi-Code-${version}-android-arm64-v8a.apk`
        : `Takomi-Code-Preview-${version}-android-arm64-v8a-debug.apk`,
    prebuildArgs: ["exec", "expo", "prebuild", "--clean", "--platform", "android", "--no-install"],
    updatesArgs: ["app:createReleaseUpdatesResources", "--max-workers=1", "--no-daemon"],
    gradleArgs: [
      "app:assembleRelease",
      "-x",
      "lint",
      "-x",
      "test",
      "--no-daemon",
      "--max-workers=2",
      "-PreactNativeArchitectures=arm64-v8a",
      `-Pandroid.compileSdkVersion=${ANDROID_TOOLCHAIN.compileSdk}`,
      `-Pandroid.targetSdkVersion=${ANDROID_TOOLCHAIN.targetSdk}`,
      `-Pandroid.buildToolsVersion=${ANDROID_TOOLCHAIN.buildTools}`,
      `-Pandroid.ndkVersion=${ANDROID_TOOLCHAIN.ndk}`,
    ],
  };
}
type ReleasePlan = ReturnType<typeof androidReleasePlan>;

/** Stage literals only in the disposable build checkout, preserving iOS/EAS defaults. */
export function stageAndroidReleaseConfig(source: string, plan: ReleasePlan): string {
  if (
    (source.match(/^ {2}version: "[^"]+",$/gmu) ?? []).length !== 1 ||
    (source.match(/^ {4}versionCode: \d+,$/gmu) ?? []).length !== 1
  ) {
    throw new Error("Cannot locate unique mobile version/versionCode literals.");
  }
  return source
    .replace(/^ {2}version: "[^"]+",$/mu, `  version: "${plan.version}",`)
    .replace(/^ {4}versionCode: \d+,$/mu, `    versionCode: ${plan.versionCode},`);
}

export function androidBuildEnvironment(env: Environment, plan: ReleasePlan): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(env).filter(([name]) => !name.startsWith("TAKOMI_ANDROID_")),
    ),
    APP_VARIANT: plan.variant,
    T3CODE_MOBILE_UPDATES_ENABLED: "0",
    EXPO_NO_DOTENV: "1",
    EXPO_NO_GIT_STATUS: "1",
    NODE_ENV: "production",
  };
}

export function requireAndroidSigning(env: Environment): void {
  const missing = signingNames.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new Error(`Missing stable Android signing credentials: ${missing.join(", ")}`);
  if (!env.RUNNER_TEMP) throw new Error("RUNNER_TEMP is required for private signing files.");
}

/** The Expo template signs release builds with its debug key unless explicitly overridden. */
export function androidSigningOverride(channel: Channel): string {
  return channel === "stable"
    ? "\nandroid.buildTypes.release.signingConfig = null\n"
    : "\nandroid.buildTypes.release.signingConfig = android.signingConfigs.debug\n";
}

export function verifyAndroidApk(input: {
  plan: ReleasePlan;
  packageId: string;
  version: string;
  versionCode: string;
  minSdk: string;
  targetSdk: string;
  debuggable: string;
  files: string;
  manifest: string;
  certificates: string;
  expectedCertificate: string;
}): void {
  const { plan } = input;
  if (
    input.packageId.trim() !== plan.packageId ||
    input.version.trim() !== plan.version ||
    input.versionCode.trim() !== String(plan.versionCode) ||
    input.minSdk.trim() !== "24" ||
    input.targetSdk.trim() !== ANDROID_TOOLCHAIN.targetSdk ||
    input.debuggable.trim() !== "false"
  ) {
    throw new Error("APK manifest does not match the requested Android release.");
  }
  const files = input.files.split(/\r?\n/u).map((line) => line.trim().replace(/^\//u, ""));
  const libraries = files.filter((file) => /^lib\/[^/]+\/[^/]+\.so$/u.test(file));
  if (
    !files.includes("assets/index.android.bundle") ||
    libraries.length === 0 ||
    libraries.some((file) => !file.startsWith("lib/arm64-v8a/"))
  ) {
    throw new Error("APK must contain embedded JavaScript and only arm64 native libraries.");
  }
  const updatesTag = input.manifest.match(
    /<meta-data\b[^>]*android:name="expo\.modules\.updates\.ENABLED"[^>]*\/?\s*>/u,
  )?.[0];
  if (!updatesTag || !/android:value="false"/u.test(updatesTag)) {
    throw new Error("GitHub APK must disable Expo OTA updates.");
  }
  const digests = [
    ...input.certificates.matchAll(/Signer #\d+ certificate SHA-256 digest: ([a-f\d:]+)/giu),
  ].map((match) => match[1]?.replaceAll(":", "").toLowerCase());
  if (digests.length !== 1 || digests[0] !== input.expectedCertificate.toLowerCase()) {
    throw new Error("APK signing certificate does not match the signing keystore.");
  }
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  capture = false,
): Buffer {
  // Never include signing subprocess output or environment in exceptions.
  try {
    return (
      NodeChildProcess.execFileSync(command, args, {
        cwd,
        env,
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
        maxBuffer: 16 * 1024 * 1024,
      }) ?? Buffer.alloc(0)
    );
  } catch {
    throw new Error(`Android packaging command failed: ${NodePath.basename(command)}`);
  }
}

function build(root: string, outputDir: string, plan: ReleasePlan): void {
  const env = process.env;
  if (plan.channel === "stable") requireAndroidSigning(env);
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error("ANDROID_HOME is required.");
  const buildEnv = androidBuildEnvironment(env, plan);
  const mobile = NodePath.join(root, "apps/mobile");
  const android = NodePath.join(mobile, "android");
  const config = NodePath.join(mobile, "app.config.ts");
  const tools = NodePath.join(sdk, "build-tools", ANDROID_TOOLCHAIN.buildTools);
  const analyzer = NodePath.join(sdk, "cmdline-tools/latest/bin/apkanalyzer");
  for (const file of ["apksigner", "zipalign"]) {
    if (!NodeFS.existsSync(NodePath.join(tools, file))) throw new Error(`Missing Android ${file}.`);
  }
  if (!NodeFS.existsSync(analyzer)) throw new Error("Missing Android apkanalyzer.");
  const catalog = NodeFS.readFileSync(
    NodePath.join(mobile, "node_modules/react-native/gradle/libs.versions.toml"),
    "utf8",
  );
  for (const [name, value] of [
    ["compileSdk", ANDROID_TOOLCHAIN.compileSdk],
    ["targetSdk", ANDROID_TOOLCHAIN.targetSdk],
    ["buildTools", ANDROID_TOOLCHAIN.buildTools],
    ["ndkVersion", ANDROID_TOOLCHAIN.ndk],
    ["agp", "9.2.1"],
  ]) {
    if (!catalog.includes(`${name} = "${value}"`))
      throw new Error(`React Native ${name} changed; review the Android toolchain.`);
  }
  NodeFS.writeFileSync(
    config,
    stageAndroidReleaseConfig(NodeFS.readFileSync(config, "utf8"), plan),
  );
  run("vp", plan.prebuildArgs, mobile, buildEnv);
  const wrapper = NodeFS.readFileSync(
    NodePath.join(android, "gradle/wrapper/gradle-wrapper.properties"),
    "utf8",
  );
  if (!wrapper.includes(`gradle-${ANDROID_TOOLCHAIN.gradle}-bin.zip`)) {
    throw new Error("Expo Gradle wrapper changed; review the Android toolchain.");
  }
  const gradle = NodePath.join(android, "gradlew");
  const gradleVersion = run(
    gradle,
    ["--version", "--no-daemon"],
    android,
    buildEnv,
    true,
  ).toString();
  if (
    !gradleVersion.includes(`Gradle ${ANDROID_TOOLCHAIN.gradle}`) ||
    !new RegExp(`Launcher JVM:\\s+${ANDROID_TOOLCHAIN.java}[.\\s]`, "u").test(gradleVersion)
  ) {
    throw new Error(
      `Android release requires Gradle ${ANDROID_TOOLCHAIN.gradle} on Java ${ANDROID_TOOLCHAIN.java}.`,
    );
  }
  NodeFS.appendFileSync(
    NodePath.join(android, "app/build.gradle"),
    androidSigningOverride(plan.channel),
  );
  // Match the working local sequence: Expo generates update resources serially before assembly.
  run(gradle, plan.updatesArgs, android, buildEnv);
  run(gradle, plan.gradleArgs, android, buildEnv);
  const apk = NodePath.join(
    android,
    "app/build/outputs/apk/release",
    plan.channel === "stable" ? "app-release-unsigned.apk" : "app-release.apk",
  );
  if (!NodeFS.existsSync(apk) || NodeFS.statSync(apk).size === 0)
    throw new Error("Gradle produced no APK.");
  const temp = NodeFS.mkdtempSync(NodePath.join(env.RUNNER_TEMP ?? android, "takomi-android-"));
  NodeFS.chmodSync(temp, 0o700);
  try {
    const stable = plan.channel === "stable";
    const keystore = stable
      ? NodePath.join(temp, "release.keystore")
      : NodePath.join(android, "app/debug.keystore");
    if (stable) {
      NodeFS.writeFileSync(
        keystore,
        Buffer.from(env.TAKOMI_ANDROID_KEYSTORE_BASE64 ?? "", "base64"),
        { mode: 0o600, flag: "wx" },
      );
    }
    const signingEnv = {
      ...buildEnv,
      TAKOMI_ANDROID_KEYSTORE_PASSWORD: stable ? env.TAKOMI_ANDROID_KEYSTORE_PASSWORD : "android",
      TAKOMI_ANDROID_KEY_PASSWORD: stable ? env.TAKOMI_ANDROID_KEY_PASSWORD : "android",
    };
    const alias = stable ? (env.TAKOMI_ANDROID_KEY_ALIAS ?? "") : "androiddebugkey";
    const certificate = run(
      "keytool",
      [
        "-exportcert",
        "-keystore",
        keystore,
        "-alias",
        alias,
        "-storepass:env",
        "TAKOMI_ANDROID_KEYSTORE_PASSWORD",
      ],
      android,
      signingEnv,
      true,
    );
    const expectedCertificate = NodeCrypto.createHash("sha256").update(certificate).digest("hex");
    const aligned = NodePath.join(temp, "aligned.apk");
    const signed = stable ? NodePath.join(temp, "signed.apk") : apk;
    if (stable) {
      run(
        NodePath.join(tools, "zipalign"),
        ["-P", "16", "-f", "4", apk, aligned],
        android,
        buildEnv,
      );
      run(
        NodePath.join(tools, "apksigner"),
        [
          "sign",
          "--ks",
          keystore,
          "--ks-key-alias",
          alias,
          "--ks-pass",
          "env:TAKOMI_ANDROID_KEYSTORE_PASSWORD",
          "--key-pass",
          "env:TAKOMI_ANDROID_KEY_PASSWORD",
          "--out",
          signed,
          aligned,
        ],
        android,
        signingEnv,
        true,
      );
    }
    run(NodePath.join(tools, "zipalign"), ["-c", "-P", "16", "4", signed], android, buildEnv, true);
    const certificates = run(
      NodePath.join(tools, "apksigner"),
      ["verify", "--verbose", "--print-certs", signed],
      android,
      buildEnv,
      true,
    ).toString();
    const analyze = (...args: string[]) =>
      run(analyzer, [...args, signed], android, buildEnv, true).toString();
    verifyAndroidApk({
      plan,
      expectedCertificate,
      certificates,
      packageId: analyze("manifest", "application-id"),
      version: analyze("manifest", "version-name"),
      versionCode: analyze("manifest", "version-code"),
      minSdk: analyze("manifest", "min-sdk"),
      targetSdk: analyze("manifest", "target-sdk"),
      debuggable: analyze("manifest", "debuggable"),
      files: analyze("files", "list"),
      manifest: analyze("manifest", "print"),
    });
    NodeFS.mkdirSync(outputDir, { recursive: true });
    NodeFS.copyFileSync(
      signed,
      NodePath.join(outputDir, plan.artifactName),
      NodeFS.constants.COPYFILE_EXCL,
    );
    process.stdout.write(`[android-release] Verified ${plan.artifactName}\n`);
  } finally {
    NodeFS.rmSync(temp, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const { values } = NodeUtil.parseArgs({
      options: {
        version: { type: "string" },
        channel: { type: "string" },
        "output-dir": { type: "string", default: "release-android" },
        "build-checkout": { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
      },
    });
    if (!values.version || (values.channel !== "stable" && values.channel !== "preview")) {
      throw new Error("Pass --version and --channel stable|preview.");
    }
    const plan = androidReleasePlan(values.version, values.channel);
    if (values["dry-run"]) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    } else {
      if (!values["build-checkout"] || HostProcessPlatform.defaultValue() !== "linux") {
        throw new Error(
          "Use --build-checkout only in a disposable Linux checkout. This stages mobile config and cleans generated Android files.",
        );
      }
      const root = NodeURL.fileURLToPath(new URL("..", import.meta.url));
      build(root, NodePath.resolve(root, values["output-dir"]), plan);
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Android release packaging failed."}\n`,
    );
    process.exitCode = 1;
  }
}
