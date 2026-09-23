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

- desktop: `0.0.42` from `apps/desktop/package.json`;
- mobile: `1.2.1` from `apps/mobile/app.config.ts`.

The maintained local workflow writes artifacts to `release/`:

```text
release\Takomi-Code-0.0.42-x64.exe
release\Takomi-Code-0.0.42-x64.exe.blockmap
release\Takomi-Code-Preview-1.2.1-<sha>[-dirty].apk
```

The APK commit suffix comes from the current eight-character Git SHA. `-dirty` is appended when
tracked working-tree changes are included.

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
- uses the preview application identity `com.t3tools.t3code.preview`;
- is signed with a generated debug key for direct installation only.

Visible app names are `Takomi Code Dev`, `Takomi Code Preview`, and `Takomi Code` by channel.
Package IDs, URL schemes, Expo owner/project/update settings, and Clerk relying-party configuration
remain upstream-compatible. They must move to Takomi-owned infrastructure before public store
release.

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

## Remaining distribution work

Before distributing the Android app publicly:

- migrate package IDs and URL schemes to Takomi-owned values;
- create a Takomi Expo owner/project and update URL;
- configure Takomi-owned Clerk/OAuth infrastructure or define a local-only path;
- create and protect release-signing credentials;
- verify pairing, Pi provider selection, questions, images, tools, and interruption on a device.
