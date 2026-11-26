import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra;
const projectId: unknown = extra?.eas?.projectId;
const relayUrl: unknown = extra?.relay?.url;
const appVariant: unknown = extra?.appVariant;

function loadObserve() {
  if (typeof projectId !== "string" || projectId.trim() === "") return undefined;
  try {
    // Android requires a project ID during module evaluation. Load synchronously so configured
    // builds still install the SDK's JS error handler before the rest of the app runs.
    const { Observe } = require("expo-observe") as typeof import("expo-observe");
    return Observe;
  } catch (error) {
    console.warn("[observe] could not initialize crash reporting", error);
    return undefined;
  }
}

const observe = loadObserve();

export const crashReportingAvailable =
  observe !== undefined && typeof relayUrl === "string" && relayUrl.trim() !== "";

export function reportCrashError(error: unknown) {
  try {
    observe?.reportError(error);
  } catch (cause) {
    console.warn("[observe] could not record the error", cause);
  }
}

interface PromiseRejectionTracker {
  readonly enablePromiseRejectionTracker?: (options: {
    readonly allRejections: boolean;
    readonly onUnhandled: (id: number, rejection: unknown) => void;
  }) => void;
}

// React Native tracks unhandled rejections only in development, for LogBox; Observe has no hook.
if (observe && !__DEV__) {
  try {
    const hermes: PromiseRejectionTracker | undefined = Reflect.get(globalThis, "HermesInternal");
    hermes?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, rejection) => reportCrashError(rejection),
    });
  } catch (error) {
    console.warn("[observe] could not track unhandled promise rejections", error);
  }
}

let latestConfiguration = 0;

// While sending is off, a dispatch pass drops what it finds, so one runs before turning it back on.
// Best effort: Observe skips the pass while it is backing off from a failed send.
export async function setCrashReportsEnabled(enabled: boolean) {
  if (!observe) return;
  const configuration = ++latestConfiguration;
  const dispatchingEnabled = crashReportingAvailable && enabled;
  if (dispatchingEnabled) {
    await observe.dispatchEvents();
    if (configuration !== latestConfiguration) return;
  }
  observe.configure({
    dispatchingEnabled,
    ...(typeof appVariant === "string" ? { environment: appVariant } : {}),
  });
}

function restoreCrashReportSetting() {
  if (!crashReportingAvailable) return setCrashReportsEnabled(false);

  // Observe keeps its last configuration across launches; configuring it off while the setting
  // loads would drop the last session's native crash. Imported lazily so the persistence graph
  // never runs ahead of the imports `index.ts` orders first.
  return import("../../persistence/imperative")
    .then(({ loadPreferences }) => loadPreferences())
    .then(
      (preferences) =>
        latestConfiguration === 0
          ? setCrashReportsEnabled(preferences.crashReportsEnabled !== false)
          : undefined,
      // Observe keeps the last choice it was given, which stands in for the unreadable one.
      (error: unknown) => console.warn("[observe] could not read the crash report setting", error),
    );
}

if (observe) {
  void restoreCrashReportSetting().catch((error: unknown) => {
    console.warn("[observe] could not apply the crash report setting", error);
  });
}
