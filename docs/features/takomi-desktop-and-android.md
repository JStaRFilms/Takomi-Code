# Takomi Code desktop and Android builds

## Overview

Takomi Code can be built as a separately identified Windows desktop application and as an Android
remote client. The desktop/server host runs Pi and Takomi. Android connects to that host; Pi does
not run on the phone.

For the release checklist and versioning rules, see [`release/README.md`](../../release/README.md).

## Desktop identity

| Identity                  | Takomi value                 |
| ------------------------- | ---------------------------- |
| Product name              | `Takomi Code (Alpha)`        |
| Application ID            | `com.jstarfilms.takomicode`  |
| Production protocol       | `takomi-code://`             |
| Development protocol      | `takomi-code-dev://`         |
| Installer prefix          | `Takomi-Code-`               |
| Runtime data root         | `%USERPROFILE%\.takomi-code` |
| Electron user data        | `%APPDATA%\takomi-code`      |
| Development Electron data | `%APPDATA%\takomi-code-dev`  |

Internal package names and compatibility environment variables such as `@t3tools/*` and
`T3CODE_HOME` remain unchanged intentionally.

Primary identity sources include:

- `apps/desktop/package.json`
- `apps/desktop/src/app/DesktopEnvironment.ts`
- `apps/desktop/src/electron/ElectronProtocol.ts`
- `scripts/build-desktop-artifact.ts`
- `apps/web/src/branding.ts`
- `apps/mobile/app.config.ts`

Desktop, web, and mobile use the Takomi icon from `assets/takomi/takomi-icon-1024.png`. Derived
platform assets remain alongside their platform targets.

## Current versions and artifact names

The current source versions are:

- desktop: `0.0.45` from `apps/desktop/package.json`;
- mobile: `2.0.0` from `apps/mobile/app.config.ts`.

Each local attempt reserves a separate `release/local-<UTC-date>.<build-number>/` directory:

```text
Takomi-Code-<desktop-version>-preview.<UTC-date>.<build-number>-x64.exe
Takomi-Code-Preview-<mobile-version>-<sha>-<UTC-date>.<build-number>[-dirty].apk
```

Desktop previews embed the dated version and have no auto-update feed. Retrying does not overwrite
an earlier attempt or change the source package versions.

The local APK commit suffix comes from the current eight-character Git SHA. `-dirty` is appended
when tracked working-tree changes are included. GitHub stable releases instead stage their explicit
`X.Y.Z` version only in the build checkout and collect `Takomi-Code-X.Y.Z-android-arm64-v8a.apk`.
Their version code is `1 + major * 1000000 + minor * 1000 + patch`, with minor and patch below 1000
and a maximum code of 2100000000. Source mobile and iOS/EAS numbering defaults do not change.
Build-only Actions runs use descriptive, debug-signed preview APK names, not stable upgrade names.

## Build commands

Run from the repository root on Windows.

Build both applications:

```powershell
vp run dist:local
```

Build only the Windows x64 NSIS installer:

```powershell
vp run dist:local:desktop
```

Build only the standalone Android preview APK:

```powershell
vp run dist:local:android
```

Use `vp run dev:desktop` for desktop development. The dev runner chooses available ports; use the
printed URLs rather than assuming a fixed port.

## Windows desktop notes

The desktop build uses the repository packaging script and verifies the packaged server from an
isolated temporary directory. If that probe can see a user-level `node_modules`, set `TEMP`, `TMP`,
and `TMPDIR` to `C:\t3code-tmp` as described in the
[release troubleshooting guide](../../release/README.md#windows-desktop-build-troubleshooting).

A missing WSL `node-pty` prebuild is a warning rather than a failed build. The packaged WSL backend
will be unavailable, but the normal Windows backend works. Local installers are unsigned and may
trigger Windows SmartScreen.

On Windows, Electron archive extraction uses PowerShell `Expand-Archive`; Python is not required
for that path.

## Android architecture and identity

`apps/mobile` is an Expo/React Native client with custom native modules, so Expo Go is unsupported.
The preview APK:

- connects to a reachable Takomi Code server over LAN, Tailscale, or another configured route;
- uses server provider snapshots, models, questions, and runtime events;
- is an arm64 standalone release build with an embedded JavaScript bundle;
- uses the preview application identity `com.jstarstudios.takomicode.preview`;
- is signed with a generated debug key for direct installation only.

Visible app names are `Takomi Code Dev`, `Takomi Code Preview`, and `Takomi Code` by channel.
Package IDs use the `com.jstarstudios.takomicode` namespace and URL schemes use `takomi-code`.
GitHub release APKs always disable Expo OTA and embed JavaScript. They need no Expo or Play Store
account. Other mobile build paths leave Expo updates disabled until `TAKOMI_EXPO_PROJECT_ID` is supplied; `TAKOMI_EXPO_OWNER`,
`TAKOMI_IOS_APPLE_TEAM_ID`, and `TAKOMI_CLERK_RELYING_PARTY` are optional configuration. No
upstream Expo account, Apple team, store app ID, or Clerk relying party is embedded. EAS workflows
also require `TAKOMI_MOBILE_RELEASE_ENABLED=true`, repository variable `TAKOMI_EXPO_PROJECT_ID`,
and secret `TAKOMI_EXPO_TOKEN`; setting these up is a separate release decision. Changing the public
website later does not require changing the mobile package IDs.

## Managed Android build workspace

The local build script uses:

```text
C:\takomi-local-build    managed detached Git worktree
C:\tp                    pnpm virtual store
```

The script verifies an ownership marker and Git worktree registration before modifying an existing
managed directory. It resets and cleans only that verified build worktree, overlays tracked files
from the source checkout (including tracked uncommitted changes), copies root `.env` and `.env.local`
when present, configures the short virtual store, prebuilds Android for the preview variant, and runs
the arm64 Gradle release assembly.

Both short paths are required to avoid React Native/CMake object-path limits and mixed-drive codegen
failures. Do not manually maintain a second helper script or edit the generated worktree as the
source of truth.

If Gradle owns a locked generated directory, stop its daemon cleanly:

```powershell
C:\takomi-local-build\apps\mobile\android\gradlew.bat --stop
```

Do not kill Java or Gradle processes by broad process-name or path matching.

## Historical build evidence

Earlier validation used a machine-local helper and a shorter temporary worktree. Those commands,
paths, versions, and artifact names are historical evidence only and are no longer supported build
instructions. The repository-owned `vp run dist:local*` commands above replaced them.

Validated characteristics that still apply to the current workflow include an embedded
`assets/index.android.bundle`, arm64 output, debug signing for local installation, and no Metro
requirement. A development-client APK produced by `expo run:android` is different and still expects
Metro.

## GitHub Android distribution

The fork release workflow runs `scripts/build-android-artifact.ts` in an independent Ubuntu job.
It stages mobile version literals in that disposable checkout, clean-prebuilds from Expo config,
and builds an arm64 APK with embedded JavaScript. Stable builds explicitly remove Expo's default
debug release signing, align the unsigned APK, and sign with the dedicated release keystore.
The helper checks its signature and certificate, package/version/SDK metadata, native architecture,
embedded bundle, and disabled OTA before artifact upload. npm and GitHub publication both depend
on this job, but the APK never becomes an npm dependency. No database schema changes are needed.

Production uses `com.jstarstudios.takomicode`; preview uses `.preview`. They have separate storage
and can remain installed side by side. Stable upgrades require the same production package and
certificate plus an increasing version code. An old debug preview is not a production upgrade.
The production Android client checks the fork's GitHub release index on app launch and foreground
return, at most once an hour automatically. Settings > About Takomi Code offers a manual check.
Only plain stable tags with the exact nonempty arm64 APK are eligible. The client checks up to
three index pages, selects the highest eligible version, and compares it with installed native
package metadata, not an Expo OTA manifest. SDK 58 exposes that metadata through the existing
ExpoApplication native module; missing metadata, preview, development, Expo Go and iOS skip
APK checks. These checks do not depend on Expo OTA being enabled.

An Alert offers Later or Download APK. Later suppresses that version's automatic notice for the
current app launch; a manual check can offer it again. Download opens a fixed GitHub asset URL in
the browser. The user opens the downloaded APK and confirms Android's installer, allowing the
browser to install unknown apps if asked. No extra installer permission, silent installation,
backend service or persistent data schema is added. Automatic failures are quiet; manual checks
show a retryable failure or distinguish no published Android APK from an up-to-date installation.
Release0.1.1 has no Android APK and is not offered as a download. iOS and preview retain their
existing Expo update behavior.

Before the first stable Android release, the owner must prepare and back up the dedicated key,
privately provision the four signing secrets listed in the
[release operations guide](../operations/takomi-release.md#android-signing-and-build-prerequisites),
then authorize a first Linux build and device verification. Check pairing, Pi provider selection,
questions, images, tools, and interruption on a device. Expo OTA/store setup is a separate decision,
not a prerequisite for GitHub sideloading.
