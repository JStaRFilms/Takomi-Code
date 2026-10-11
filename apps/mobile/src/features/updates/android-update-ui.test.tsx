// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => {
  type Button = { readonly text?: string; readonly onPress?: () => void };
  const listeners = new Set<(state: string) => void>();
  return {
    state: { current: "active" },
    listeners,
    alert:
      vi.fn<
        (
          title: string,
          message?: string,
          buttons?: Button[],
          options?: { onDismiss?: () => void },
        ) => void
      >(),
    openURL: vi.fn<(url: string) => Promise<void>>(),
    foreground(state: string) {
      this.state.current = state;
      for (const listener of listeners) listener(state);
    },
  };
});

vi.mock("expo", () => ({
  requireOptionalNativeModule: () => ({
    applicationId: "com.jstarstudios.takomicode",
    nativeApplicationVersion: "0.1.2",
    nativeBuildVersion: "1003",
  }),
}));
vi.mock("expo-constants", () => ({
  default: { executionEnvironment: "bare", expoConfig: { extra: { appVariant: "production" } } },
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  Linking: { openURL: harness.openURL },
  Alert: { alert: harness.alert },
  AppState: {
    get currentState() {
      return harness.state.current;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      harness.listeners.add(listener);
      return { remove: () => harness.listeners.delete(listener) };
    },
  },
}));
vi.mock("../settings/components/SettingsRow", () => ({
  SettingsRow: (props: {
    label: string;
    value?: string;
    disabled?: boolean;
    onPress?: () => void;
  }) => (
    <button disabled={props.disabled} onClick={props.onPress}>
      {props.label}
      <span>{props.value}</span>
    </button>
  ),
}));

import { AndroidAppUpdateRows } from "./AndroidAppUpdateRows";
import { AndroidUpdateNotice } from "./AndroidUpdateNotice";

let root: Root | undefined;
let host: HTMLDivElement;
let patch = 10;
let version: string;

function response(nextVersion = version) {
  return new Response(
    JSON.stringify([
      {
        tag_name: `v${nextVersion}`,
        draft: false,
        prerelease: false,
        assets: [{ name: `Takomi-Code-${nextVersion}-android-arm64-v8a.apk`, size: 1024 }],
      },
    ]),
  );
}

async function mount(rows = false) {
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <>
        <AndroidUpdateNotice />
        {rows ? <AndroidAppUpdateRows /> : null}
      </>,
    ),
  );
}

async function pressCheck() {
  const button = host.querySelector("button");
  if (!button) throw new Error("Missing check action");
  await act(async () => button.click());
}

function noticeAction(label: string) {
  const buttons = harness.alert.mock.calls.at(-1)?.[2];
  const action = buttons?.find((button) => button.text === label)?.onPress;
  if (!action) throw new Error(`Missing alert action ${label}`);
  return action;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  version = `0.1.${patch++}`;
  harness.state.current = "active";
  harness.openURL.mockResolvedValue();
  vi.stubGlobal("__DEV__", false);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  // Close any outstanding native alert so another test can offer a different version.
  harness.alert.mock.calls.findLast((call) => call[3]?.onDismiss)?.[3]?.onDismiss?.();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Android APK update interactions", () => {
  it("checks from the app root, remembers Later for this launch and checks on foreground without polling", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response()));
    vi.stubGlobal("fetch", fetch);
    await mount();
    expect(harness.alert).toHaveBeenCalledTimes(1);
    noticeAction("Later")();
    act(() => {
      harness.foreground("background");
      harness.foreground("active");
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      harness.foreground("background");
      harness.foreground("active");
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(harness.alert).toHaveBeenCalledTimes(1);
    version = "0.2.0";
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await act(async () => {
      harness.foreground("background");
      harness.foreground("active");
    });
    expect(harness.alert).toHaveBeenCalledTimes(2);
  });

  it("keeps automatic failures quiet and offers a working manual retry", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(new Response("[]"))
      .mockResolvedValueOnce(response("0.1.2"));
    vi.stubGlobal("fetch", fetch);
    await mount(true);
    expect(harness.alert).not.toHaveBeenCalled();
    await pressCheck();
    expect(host.textContent).toContain("Check failed. Tap to retry.");
    await pressCheck();
    expect(host.textContent).toContain("No Android release available");
    await pressCheck();
    expect(host.textContent).toContain("Up to date");
    expect(host.querySelector("button")?.disabled).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("joins an in-flight launch check, shows progress and only opens a browser after Download APK", async () => {
    let finish: (response: Response) => void = () => {
      throw new Error("Not initialized");
    };
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    await mount(true);
    await pressCheck();
    expect(host.textContent).toContain("Checking…");
    expect(host.querySelector("button")?.disabled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => finish(response()));
    expect(harness.alert).toHaveBeenCalledTimes(1);
    expect(harness.openURL).not.toHaveBeenCalled();
    expect(host.textContent).toContain(`Takomi Code ${version} is available`);
    await act(async () => noticeAction("Download APK")());
    expect(harness.openURL).toHaveBeenCalledWith(
      `https://github.com/JStaRFilms/Takomi-Code/releases/download/v${version}/Takomi-Code-${version}-android-arm64-v8a.apk`,
    );
  });

  it("allows manual download after Later and reports a browser-opening failure without claiming installation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response())),
    );
    await mount(true);
    noticeAction("Later")();
    await pressCheck();
    expect(harness.alert).toHaveBeenCalledTimes(2);
    noticeAction("Later")();
    harness.openURL.mockRejectedValueOnce(new Error("No browser"));
    const download = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.startsWith("Download APK"),
    );
    if (!download) throw new Error("Missing manual APK download");
    await act(async () => download.click());
    expect(harness.alert.mock.calls.at(-1)?.[0]).toBe("Download failed");
    await act(async () => download.click());
    expect(harness.openURL).toHaveBeenCalledTimes(2);
    expect(harness.alert).toHaveBeenCalledTimes(3);
  });

  it("removes foreground listeners and ignores a lookup completing after unmount", async () => {
    let finish: (response: Response) => void = () => {
      throw new Error("Not initialized");
    };
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    await mount(true);
    await pressCheck();
    act(() => root?.unmount());
    root = undefined;
    expect(harness.listeners.size).toBe(0);
    await act(async () => finish(response()));
    harness.foreground("active");
    expect(harness.alert).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not offer a result behind the backgrounded app and rechecks on return", async () => {
    let finish: (response: Response) => void = () => {
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
      .mockImplementation(() => Promise.resolve(response()));
    vi.stubGlobal("fetch", fetch);
    await mount();
    harness.foreground("background");
    await act(async () => finish(response()));
    expect(harness.alert).not.toHaveBeenCalled();
    await act(async () => harness.foreground("active"));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(harness.alert).toHaveBeenCalledTimes(1);
  });
});
