import { useEffect, useRef, useState } from "react";

import { SettingsRow } from "../settings/components/SettingsRow";
import {
  checkForAndroidApkUpdate,
  openAndroidApkDownload,
  showAndroidUpdateNotice,
} from "./android-apk-updates";
import type { AndroidUpdateResult } from "./android-releases";

type CheckState = AndroidUpdateResult | { readonly status: "idle" | "checking" | "failed" };

export function AndroidAppUpdateRows() {
  const [state, setState] = useState<CheckState>({ status: "idle" });
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ status: "checking" });
    try {
      const result = await checkForAndroidApkUpdate();
      if (!mounted.current) return;
      setState(result ?? { status: "idle" });
      if (result?.status === "available") showAndroidUpdateNotice(result.release, true);
    } catch {
      if (mounted.current) setState({ status: "failed" });
    } finally {
      inFlight.current = false;
    }
  };
  const statusLabel =
    state.status === "checking"
      ? "Checking…"
      : state.status === "current"
        ? "Up to date"
        : state.status === "no-release"
          ? "No Android release available"
          : state.status === "failed"
            ? "Check failed. Tap to retry."
            : state.status === "available"
              ? `Takomi Code ${state.release.version} is available`
              : undefined;

  return (
    <>
      <SettingsRow
        icon="arrow.clockwise"
        label="Check for updates"
        value={statusLabel}
        disabled={state.status === "checking"}
        onPress={() => {
          void check();
        }}
      />
      {state.status === "available" ? (
        <SettingsRow
          icon="arrow.down.circle"
          label="Download APK"
          value={state.release.version}
          onPress={() => {
            void openAndroidApkDownload(state.release);
          }}
        />
      ) : null}
    </>
  );
}
