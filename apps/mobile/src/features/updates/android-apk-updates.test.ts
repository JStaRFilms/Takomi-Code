import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  application: {
    applicationId: "com.jstarstudios.takomicode",
    nativeApplicationVersion: "0.1.2",
    nativeBuildVersion: "1003",
  },
  constants: {
    debugMode: false,
    executionEnvironment: "bare",
    // Deliberately not the installed version.
    expoConfig: { version: "2.0.0", extra: { appVariant: "production" } },
  },
  platform: { OS: "android" },
  requireModule: vi.fn(),
  openURL: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("expo", () => ({ requireOptionalNativeModule: mocks.requireModule }));
vi.mock("expo-constants", () => ({ default: mocks.constants }));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  Linking: { openURL: mocks.openURL },
  Platform: mocks.platform,
}));

import { checkForAndroidApkUpdate, getAndroidUpdateInstallation } from "./android-apk-updates";

beforeEach(() => {
  mocks.platform.OS = "android";
  mocks.constants.debugMode = false;
  mocks.constants.executionEnvironment = "bare";
  mocks.constants.expoConfig.extra.appVariant = "production";
  mocks.requireModule.mockReturnValue(mocks.application);
  vi.stubGlobal("__DEV__", false);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("native Android APK update runtime", () => {
  it("uses installed package metadata even when the manifest version is higher and OTA is disabled", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            tag_name: "v0.1.3",
            draft: false,
            prerelease: false,
            assets: [{ name: "Takomi-Code-0.1.3-android-arm64-v8a.apk", size: 1024 }],
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    expect(getAndroidUpdateInstallation()).toEqual({ version: "0.1.2", versionCode: 1003 });
    expect((await checkForAndroidApkUpdate())?.status).toBe("available");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never fetches for iOS, preview, development, Expo Go or unavailable native metadata", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    mocks.platform.OS = "ios";
    expect(await checkForAndroidApkUpdate()).toBeNull();
    expect(mocks.requireModule).not.toHaveBeenCalled();
    mocks.platform.OS = "android";
    mocks.constants.expoConfig.extra.appVariant = "preview";
    expect(await checkForAndroidApkUpdate()).toBeNull();
    mocks.constants.expoConfig.extra.appVariant = "production";
    mocks.constants.debugMode = true;
    expect(await checkForAndroidApkUpdate()).toBeNull();
    mocks.constants.debugMode = false;
    vi.stubGlobal("__DEV__", true);
    expect(await checkForAndroidApkUpdate()).toBeNull();
    vi.stubGlobal("__DEV__", false);
    mocks.constants.executionEnvironment = "storeClient";
    expect(await checkForAndroidApkUpdate()).toBeNull();
    mocks.constants.executionEnvironment = "bare";
    mocks.requireModule.mockReturnValue(null);
    expect(await checkForAndroidApkUpdate()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
