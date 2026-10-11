import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import { Alert, Linking, Platform } from "react-native";

import {
  androidUpdateInstallation,
  androidUpdateResult,
  fetchAndroidRelease,
  type AndroidRelease,
} from "./android-releases";

export function getAndroidUpdateInstallation() {
  if (Platform.OS !== "android") return null;
  // SDK 58 removed Constants.nativeAppVersion/nativeBuildVersion. This already
  // linked module reads PackageManager, not the current Expo/OTA manifest.
  const application = requireOptionalNativeModule<{
    readonly applicationId: unknown;
    readonly nativeApplicationVersion: unknown;
    readonly nativeBuildVersion: unknown;
  }>("ExpoApplication");
  const variant: unknown = Constants.expoConfig?.extra?.appVariant;
  return androidUpdateInstallation({
    platform: Platform.OS,
    development: (typeof __DEV__ !== "undefined" && __DEV__) || Constants.debugMode === true,
    executionEnvironment: Constants.executionEnvironment,
    variant,
    applicationId: application?.applicationId,
    nativeVersion: application?.nativeApplicationVersion,
    nativeBuildVersion: application?.nativeBuildVersion,
  });
}

export async function checkForAndroidApkUpdate() {
  const installed = getAndroidUpdateInstallation();
  if (!installed) return null;
  return androidUpdateResult(await fetchAndroidRelease(), installed);
}

const shownThisLaunch = new Set<string>();
let showing = false;

export function showAndroidUpdateNotice(release: AndroidRelease, manual = false) {
  if (showing || (!manual && shownThisLaunch.has(release.version))) return;
  showing = true;
  shownThisLaunch.add(release.version);
  const dismiss = () => {
    showing = false;
  };
  Alert.alert(
    "Android update available",
    `Takomi Code ${release.version} is available. Download the APK, then open it to confirm installation in Android. You may need to allow your browser to install unknown apps.`,
    [
      { text: "Later", style: "cancel", onPress: dismiss },
      {
        text: "Download APK",
        onPress: () => {
          dismiss();
          void openAndroidApkDownload(release);
        },
      },
    ],
    { cancelable: true, onDismiss: dismiss },
  );
}

export async function openAndroidApkDownload(release: AndroidRelease) {
  try {
    await Linking.openURL(release.downloadUrl);
  } catch {
    Alert.alert(
      "Download failed",
      "Could not open the APK download. Check your connection and try again from Settings > About Takomi Code.",
    );
  }
}
