# Local Takomi releases

The `release/` directory holds locally built installers and APKs. Generated artifacts stay out of
Git. Upload the selected files to the [Takomi Code releases](https://github.com/JStaRFilms/Takomi-Code/releases).

## Current release notes

### Takomi Code 0.1.0 preview 1

[Download this preview](https://github.com/JStaRFilms/Takomi-Code/releases/tag/takomi-v0.1.0-preview.1).
Built from commit `23c210b12f72330d9be8b98393b0c4c8b5e536de`. The release tag points to that
build commit; publishing instructions were added afterward.

- `Takomi-Code-0.0.42-x64.exe`: Windows x64 installer with the Pi/Takomi provider and the upstream
  changes included in the audited merge.
- `Takomi-Code-Preview-1.2.1-23c210b1.apk`: standalone Android arm64 preview with the Takomi launch splash.

This is a sideloading preview, not a store release. The Android APK is debug-signed and uses
`com.t3tools.t3code.preview`, which can conflict with another app using that package ID. The
Windows installer is unsigned and its packaged WSL backend is unavailable. Neither app has had a
live install smoke test. No desktop auto-update metadata ships with this preview; install later
builds manually.

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
      node scripts/update-release-package-versions.ts 0.0.42
     ```

     Replace `0.0.42` with the intended new version. Do not reuse a published version for a
     materially different public build.

   - **Mobile:** update `version` in `apps/mobile/app.config.ts`, for example from `1.2.1` to
     `1.2.2`. The local APK uses that value in its filename. Do not manually change Android
     `versionCode` or iOS `buildNumber` for EAS production builds: EAS owns those remote build
     numbers and increments them through `apps/mobile/eas.json`.

4. Review public configuration in the repository-root `.env` or `.env.local` when the build needs
   T3 Connect, Clerk, or relay configuration. Never commit secrets.

The current source versions are desktop `0.0.42` and mobile `1.2.1`.

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
does not require Metro. If Gradle owns a locked generated directory, stop its daemon with
`C:\takomi-local-build\apps\mobile\android\gradlew.bat --stop`; do not kill Java or Gradle by broad
process matching.

## Windows desktop build troubleshooting

The desktop build verifies the packaged server from an isolated temporary directory. If the build
reports that a user-level directory such as `C:\Users\<username>\node_modules` is visible from the
probe directory, use a temporary directory outside the user profile and rerun the build in the
same PowerShell session:

```powershell
New-Item -ItemType Directory -Force C:\t3code-tmp | Out-Null
$env:TEMP = "C:\t3code-tmp"
$env:TMP = "C:\t3code-tmp"
$env:TMPDIR = "C:\t3code-tmp"
vp run dist:local:desktop
```

This can happen even when the command is launched from T3 Code and the working directory is the
repository. Windows chooses the probe location from the temporary-directory environment variables,
not from the terminal's working directory. The variables above affect only the current PowerShell
session.

The warning about a missing WSL `node-pty` prebuild does not fail the build, but the packaged WSL
backend will remain unavailable until a Linux `pty.node` is bundled.

## Publish a local preview

Use a distinct `takomi-v...` tag. The inherited upstream release workflow listens for `v*.*.*`
tags; a fork-specific tag avoids starting its store and registry publishing jobs. GitHub Actions
is not needed to upload local builds.

1. Build from committed source and run the checks below. Note the full build commit and confirm
   that the APK filename contains its short SHA, with no `-dirty` suffix. Install each artifact on
   a test device if you intend to call the release tested. Do not publish a dirty build.
2. Update the current release notes above with the new tag, files, build commit, and limitations.
   Commit the guide and push the branch. The tag should still point to the commit that produced the
   binaries, not to a later documentation-only commit.
3. Authenticate with `gh auth login`. Check that the tag and release do not already exist. From
   the repository root in PowerShell, replace the tag, commit, title, and file names below with
   those of your build:

   ```powershell
   $tag = "takomi-v0.1.0-preview.1"
   $buildCommit = "23c210b12f72330d9be8b98393b0c4c8b5e536de"
   $notes = [regex]::Match((Get-Content release/README.md -Raw), '(?ms)^## Current release notes\r?\n.*?(?=^## Before building)').Value.Trim()
   if (-not $notes) { throw "Missing current release notes" }
   gh release create $tag `
     release/Takomi-Code-0.0.42-x64.exe `
     release/Takomi-Code-Preview-1.2.1-23c210b1.apk `
     --repo JStaRFilms/Takomi-Code --target $buildCommit `
     --title "Takomi Code 0.1.0 preview 1" --notes $notes --prerelease --draft
   ```

4. Inspect the draft release, check both uploaded asset sizes against the local files, and then
   publish it with `gh release edit $tag --repo JStaRFilms/Takomi-Code --draft=false`. Link to the
   tag-specific release page from the website. Prereleases do not appear at `/releases/latest`.

Only upload the two installables. The local `latest.yml` and blockmap are not a tested update feed
for this preview.

## What stays in GitHub/EAS

The local Android APK is **not Play Store uploadable**. A GitHub release can distribute it for
sideloading, but production signing, EAS build numbers, native fingerprints, OTA updates, and store
submission still require the protected EAS workflow.

## Verification

Before sharing an artifact, run the focused checks relevant to the changes. At minimum:

```powershell
vp run --filter t3 typecheck
vp run --filter @t3tools/web typecheck
vp run --filter @t3tools/mobile typecheck
```

Install and open the APK or desktop installer on a test device before treating it as a release.
