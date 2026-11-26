import * as NodeModule from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  constants: {
    expoConfig: {
      extra: { appVariant: "preview" } as {
        appVariant: string;
        eas?: { projectId: string };
        relay?: { url: string };
      },
    },
  },
  registerRootComponent: vi.fn(),
  loadObserve: vi.fn(),
  observe: {
    configure: vi.fn(),
    dispatchEvents: vi.fn<() => Promise<void>>(),
    reportError: vi.fn(),
  },
  loadPreferences: vi.fn(),
  enablePromiseRejectionTracker:
    vi.fn<(options: { onUnhandled: (id: number, rejection: unknown) => void }) => void>(),
}));

vi.mock("expo", () => ({ registerRootComponent: mocks.registerRootComponent }));
vi.mock("expo-constants", () => ({ default: mocks.constants }));
vi.mock("expo-observe", () => mocks.loadObserve());
vi.mock("react-native-gesture-handler", () => ({}));
vi.mock("react-native", () => ({ ScrollView: "ScrollView", View: "View", LogBox: {} }));
vi.mock("react-native-screens", () => ({ featureFlags: { experiment: {} } }));
vi.mock("./src/i18n/intl-polyfills", () => ({}));
vi.mock("./src/persistence/imperative", () => ({ loadPreferences: mocks.loadPreferences }));
vi.mock("./src/components/ui/AppText", () => ({ AppText: "Text" }));
vi.mock("./src/components/ui/Button", () => ({ Button: "Button" }));
vi.mock("./src/lib/copyTextWithHaptic", () => ({ copyTextWithHaptic: vi.fn() }));
// Keep the real render boundary in the entry graph without loading every app screen in Node.
vi.mock("./src/App", async () => ({
  default: (await import("./src/components/RenderErrorBoundary")).RenderErrorBoundary,
}));

const nodeRequire = NodeModule.createRequire(import.meta.url);
const observePath = nodeRequire.resolve("expo-observe");
const originalObserve = nodeRequire.cache[observePath];

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("HermesInternal", {
    enablePromiseRejectionTracker: mocks.enablePromiseRejectionTracker,
  });
  mocks.loadObserve.mockReturnValue({ Observe: mocks.observe });
  mocks.constants.expoConfig.extra = { appVariant: "preview" };
  // Metro's conditional require bypasses Vitest's ESM mock.
  const observeModule = new NodeModule.Module(observePath);
  observeModule.loaded = true;
  Object.defineProperty(observeModule, "exports", { get: mocks.loadObserve });
  nodeRequire.cache[observePath] = observeModule;
});

afterEach(() => {
  if (originalObserve) nodeRequire.cache[observePath] = originalObserve;
  else delete nodeRequire.cache[observePath];
  vi.unstubAllGlobals();
});

it.each([undefined, { url: "https://relay.example.test" }])(
  "registers the preview app without evaluating Expo Observe when the project ID is missing (relay: %j)",
  async (relay) => {
    mocks.constants.expoConfig.extra.relay = relay;
    mocks.loadObserve.mockImplementation(() => {
      throw new Error("Project ID is required to send observability metrics.");
    });

    await import("./index");
    const { crashReportingAvailable, setCrashReportsEnabled } =
      await import("./src/features/observability/observe");

    expect(mocks.registerRootComponent).toHaveBeenCalledOnce();
    expect(crashReportingAvailable).toBe(false);
    await setCrashReportsEnabled(true);
    expect(mocks.loadObserve).not.toHaveBeenCalled();
    expect(mocks.loadPreferences).not.toHaveBeenCalled();
    expect(mocks.enablePromiseRejectionTracker).not.toHaveBeenCalled();
  },
);

it("loads Expo Observe and disables dispatch before registration when there is no relay", async () => {
  mocks.constants.expoConfig.extra.eas = { projectId: "test-project" };

  await import("./index");
  const { crashReportingAvailable } = await import("./src/features/observability/observe");

  expect(crashReportingAvailable).toBe(false);
  expect(mocks.observe.configure).toHaveBeenCalledWith({
    dispatchingEnabled: false,
    environment: "preview",
  });
  expect(mocks.observe.configure).toHaveBeenCalledBefore(mocks.registerRootComponent);
  expect(mocks.observe.dispatchEvents).not.toHaveBeenCalled();
  expect(mocks.loadPreferences).not.toHaveBeenCalled();
});

it("honors the stored opt-out with a relay and drains before enabling dispatch", async () => {
  mocks.constants.expoConfig.extra.eas = { projectId: "test-project" };
  mocks.constants.expoConfig.extra.relay = { url: "https://relay.example.test" };
  mocks.loadPreferences.mockResolvedValue({ crashReportsEnabled: false });
  const configured = Promise.withResolvers<void>();
  mocks.observe.configure.mockImplementationOnce(() => configured.resolve());

  const { crashReportingAvailable, setCrashReportsEnabled } =
    await import("./src/features/observability/observe");
  await configured.promise;

  expect(crashReportingAvailable).toBe(true);
  expect(mocks.observe.configure).toHaveBeenLastCalledWith({
    dispatchingEnabled: false,
    environment: "preview",
  });
  const rejection = new Error("Unhandled rejection");
  mocks.enablePromiseRejectionTracker.mock.calls[0]?.[0].onUnhandled(1, rejection);
  expect(mocks.observe.reportError).toHaveBeenCalledWith(rejection);

  const dispatched = Promise.withResolvers<void>();
  mocks.observe.dispatchEvents.mockReturnValueOnce(dispatched.promise);
  const enabling = setCrashReportsEnabled(true);
  expect(mocks.observe.dispatchEvents).toHaveBeenCalledOnce();
  expect(mocks.observe.configure).toHaveBeenCalledOnce();
  dispatched.resolve();
  await enabling;
  expect(mocks.observe.configure).toHaveBeenLastCalledWith({
    dispatchingEnabled: true,
    environment: "preview",
  });
});

it("still registers the app if Expo Observe fails to initialize in a configured build", async () => {
  mocks.constants.expoConfig.extra.eas = { projectId: "test-project" };
  mocks.constants.expoConfig.extra.relay = { url: "https://relay.example.test" };
  const failure = new Error("ExpoObserve unavailable");
  mocks.loadObserve.mockImplementation(() => {
    throw failure;
  });
  using warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  await import("./index");
  const { crashReportingAvailable } = await import("./src/features/observability/observe");

  expect(mocks.registerRootComponent).toHaveBeenCalledOnce();
  expect(crashReportingAvailable).toBe(false);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("[observe]"), failure);
});
