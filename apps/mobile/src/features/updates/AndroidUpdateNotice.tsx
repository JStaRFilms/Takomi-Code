import { useEffect } from "react";
import { AppState } from "react-native";

import {
  checkForAndroidApkUpdate,
  getAndroidUpdateInstallation,
  showAndroidUpdateNotice,
} from "./android-apk-updates";

const RECHECK_MS = 60 * 60 * 1000;

export function AndroidUpdateNotice() {
  useEffect(() => {
    if (!getAndroidUpdateInstallation()) return;
    let active = true;
    let lastCheckAt: number | undefined;
    const check = async () => {
      if (AppState.currentState !== "active") return;
      if (lastCheckAt !== undefined && Date.now() - lastCheckAt < RECHECK_MS) return;
      lastCheckAt = Date.now();
      try {
        const result = await checkForAndroidApkUpdate();
        if (!active) return;
        if (AppState.currentState !== "active") {
          // Recheck when returning if this result could not be shown.
          lastCheckAt = undefined;
          return;
        }
        if (result?.status === "available") showAndroidUpdateNotice(result.release);
      } catch {
        // Automatic checks are quiet offline. Settings offers an explicit retry.
      }
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    void check();
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return null;
}
