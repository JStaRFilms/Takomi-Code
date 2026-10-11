import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cliReleaseIndexPageUrl } from "@t3tools/shared/cliRelease";

import {
  androidStableVersionCode,
  androidUpdateInstallation,
  androidUpdateResult,
  fetchAndroidRelease,
} from "./android-releases";

function release(version: string, overrides: Record<string, unknown> = {}) {
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: `Takomi-Code-${version}-android-arm64-v8a.apk`,
        size: 1234,
        browser_download_url: "https://untrusted.example/installer",
      },
    ],
    ...overrides,
  };
}

function response(data: unknown) {
  return new Response(JSON.stringify(data));
}

const metadata = {
  platform: "android",
  development: false,
  executionEnvironment: "bare",
  variant: "production",
  applicationId: "com.jstarstudios.takomicode",
  nativeVersion: "0.1.2",
  nativeBuildVersion: "1003",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Android native release eligibility", () => {
  it("uses the native version and code, requiring a production Android installation", () => {
    expect(androidUpdateInstallation(metadata)).toEqual({ version: "0.1.2", versionCode: 1003 });
    for (const overrides of [
      { platform: "ios" },
      { platform: "web" },
      { development: true },
      { executionEnvironment: "storeClient" },
      { variant: "preview" },
      { variant: "development" },
      { variant: undefined },
      { applicationId: "com.jstarstudios.takomicode.preview" },
      { applicationId: undefined },
      { nativeVersion: null },
      { nativeVersion: "2.0.0-preview.20261011.1" },
      { nativeBuildVersion: null },
      { nativeBuildVersion: "01003" },
      { nativeBuildVersion: "2100000001" },
    ])
      expect(androidUpdateInstallation({ ...metadata, ...overrides })).toBeNull();
  });

  it("matches the packager's versionCode and plain stable version limits", () => {
    expect(androidStableVersionCode("0.1.2")).toBe(1003);
    expect(androidStableVersionCode("2.0.0")).toBe(2_000_001);
    expect(androidStableVersionCode("2099.999.999")).toBe(2_100_000_000);
    for (const version of [
      "01.2.3",
      "1.02.3",
      "1.2.03",
      "v1.2.3",
      "1.2",
      "1.2.3-preview.1",
      "1.2.3+meta",
      "1.2.3/evil",
      "1.1000.0",
      "1.0.1000",
      "2100.0.0",
      "9007199254740992.0.0",
    ])
      expect(androidStableVersionCode(version)).toBeNull();
  });

  it("ignores release0.1.1 without an APK and requires an exact nonempty asset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          release("0.1.1", { assets: [] }),
          release("1.0.0", {
            assets: [{ name: "Takomi-Code-1.0.0-android-arm64-v8a.apk", size: 0 }],
          }),
          release("1.0.1", {
            assets: [{ name: "Takomi-Code-1.0.1-android-arm64-v8a.apk", size: "12" }],
          }),
          release("1.0.2", {
            assets: [{ name: "Takomi-Code-Preview-1.0.2-android-arm64-v8a-debug.apk", size: 12 }],
          }),
        ]),
      ),
    );
    const found = await fetchAndroidRelease();
    expect(found).toBeNull();
    expect(androidUpdateResult(found, { version: "0.1.0", versionCode: 1001 })).toEqual({
      status: "no-release",
    });
  });

  it("rejects drafts, prereleases, malformed tags and incomplete records", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response([
            null,
            [],
            {},
            release("8.0.0", { draft: true }),
            release("8.0.1", { prerelease: true }),
            release("8.0.2", { draft: undefined }),
            release("8.0.3", { prerelease: undefined }),
            release("8.0.4-preview.1"),
            release("08.0.5"),
            release("8.0.6+metadata"),
            release("8.0.7/../../"),
            release("8.0.8", { assets: null }),
            release("8.0.9", { tag_name: 8 }),
          ]),
        ),
    );
    expect(await fetchAndroidRelease()).toBeNull();
  });

  it("constructs a trusted download URL and compares native versions numerically", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response([release("0.2.9"), release("0.2.10"), release("0.1.20")])),
    );
    const found = await fetchAndroidRelease();
    expect(found).toEqual({
      version: "0.2.10",
      versionCode: 2011,
      downloadUrl:
        "https://github.com/JStaRFilms/Takomi-Code/releases/download/v0.2.10/Takomi-Code-0.2.10-android-arm64-v8a.apk",
    });
    expect(androidUpdateResult(found, { version: "0.2.9", versionCode: 2010 }).status).toBe(
      "available",
    );
    for (const installed of [
      { version: "0.2.10", versionCode: 2011 },
      { version: "2.0.0", versionCode: 3 },
      { version: "0.2.9", versionCode: 2012 },
    ])
      expect(androidUpdateResult(found, installed)).toEqual({ status: "current" });
  });

  it("chooses the highest eligible APK across all three bounded pages", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response([release("0.5.2"), ...Array.from({ length: 99 }, () => ({}))]),
      )
      .mockResolvedValueOnce(
        response([release("0.10.1"), ...Array.from({ length: 99 }, () => ({}))]),
      )
      .mockResolvedValueOnce(
        response([release("0.8.0"), ...Array.from({ length: 99 }, () => ({}))]),
      );
    vi.stubGlobal("fetch", fetch);
    expect((await fetchAndroidRelease())?.version).toBe("0.10.1");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      cliReleaseIndexPageUrl(1),
      cliReleaseIndexPageUrl(2),
      cliReleaseIndexPageUrl(3),
    ]);
  });

  it("deduplicates simultaneous checks and permits a fresh check after completion", async () => {
    let finish: (value: Response) => void = () => {
      throw new Error("Not initialized");
    };
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);
    const first = fetchAndroidRelease();
    const second = fetchAndroidRelease();
    expect(first).toBe(second);
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(response([release("0.1.2")]));
    await Promise.all([first, second]);
    await fetchAndroidRelease();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports offline, HTTP and malformed-index failures and allows retry", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(new Response("", { status: 403 }))
      .mockResolvedValueOnce(response({ message: "not a release index" }))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchAndroidRelease()).rejects.toThrow("Offline");
    await expect(fetchAndroidRelease()).rejects.toThrow("Could not check");
    await expect(fetchAndroidRelease()).rejects.toThrow("Invalid");
    expect(await fetchAndroidRelease()).toBeNull();
  });

  it("bounds a stalled lookup with a timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
          }),
      ),
    );
    const check = expect(fetchAndroidRelease()).rejects.toThrow("Aborted");
    await vi.advanceTimersByTimeAsync(20_000);
    await check;
    expect(vi.getTimerCount()).toBe(0);
  });
});
