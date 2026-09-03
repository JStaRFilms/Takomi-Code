# Local Takomi releases

The `release/` directory is the single output folder for locally built desktop installers and
standalone Android APKs. Generated artifacts remain ignored by Git; this guide is the only tracked
file in the directory.

## Before building

1. Make sure the checkout contains exactly the code you want to ship:

   ```powershell
   git status --short
   ```

   Uncommitted tracked changes are included. The artifact name ends in `-dirty` when they exist.

2. Compare this checkout with both the Takomi fork and upstream T3 Code:

   ```powershell
   vp run dist:local:status
   ```

   This only fetches and reports status. It never merges or resets. Do not update from upstream
   immediately before a release unless you are prepared to resolve and retest Takomi-specific
   behavior.

3. Choose the application versions.

   - **Desktop:** update `version` in `apps/desktop/package.json`. Keep the corresponding release
     package versions aligned by running:

     ```powershell
     node scripts/update-release-package-versions.ts 0.0.39
     ```

     Replace `0.0.39` with the intended new version. Do not reuse a published version for a
     materially different public build.

   - **Mobile:** update `version` in `apps/mobile/app.config.ts`, for example from `1.0.4` to
     `1.0.5`. The local APK uses that value in its filename. Do not manually change Android
     `versionCode` or iOS `buildNumber` for EAS production builds: EAS owns those remote build
     numbers and increments them through `apps/mobile/eas.json`.

4. Review public configuration in the repository-root `.env` or `.env.local` when the build needs
   T3 Connect, Clerk, or relay configuration. Never commit secrets.

## Build both applications

From the repository root on Windows:

```powershell
vp run dist:local
```

This produces:

- `release/Takomi-Code-<desktop-version>-x64.exe`
- the matching desktop blockmap/update metadata
- `release/Takomi-Code-Preview-<mobile-version>-<sha>[-dirty].apk`

## Build one application

Desktop only:

```powershell
vp run dist:local:desktop
```

Android only:

```powershell
vp run dist:local:android
```

The Android build requires Java and the Android SDK. It uses the managed short paths
`C:\takomi-local-build` and `C:\tp` to avoid Windows React Native/CMake path failures. The output is
a standalone arm64 preview APK, signed with the generated debug key for direct installation. It
does not require Metro.

## What stays in GitHub/EAS

The local Android APK is deliberately **not Play Store uploadable**. GitHub/EAS remains responsible
for production credentials, remote build-number auto-increment, Linux-consistent native
fingerprints, fingerprint-gated OTA updates, and store submission. Use the local build for your own
devices and release verification; use the protected EAS workflow for store distribution.

## Verification

Before sharing an artifact, run the focused checks relevant to the changes. At minimum:

```powershell
vp run --filter t3 typecheck
vp run --filter @t3tools/web typecheck
vp run --filter @t3tools/mobile typecheck
```

Install and open the APK or desktop installer on a test device before treating it as a release.
