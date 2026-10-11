# Takomi Code distribution

The fork workflow is `.github/workflows/takomi-release.yml` in
`JStaRFilms/Takomi-Code`. It builds Windows x64 NSIS installers and self-contained
Windows x64, Linux x64, and macOS Apple Silicon ARM64 CLI archives on GitHub-hosted
runners. An independent Ubuntu job builds an arm64 Android APK for every numbered
stable release, using the same explicit release version. The Mac server builds and smoke-tests natively on `macos-15` using the
upstream Darwin packager. It does not support Intel Macs or build a Mac desktop
app or DMG. The Windows app embeds the Linux archive for its WSL backend. The
workflow does not build a Linux desktop, publish T3 services, or deploy a hosted web app.

Mac archives use upstream ad-hoc signing, which Apple Silicon requires to run
Mach-O binaries. No Apple account, certificate, signing secret, or notarization
setup is needed.

## Before the first push

Get approval before pushing this workflow or a release tag. A push to `Takomi-Code`
starts build jobs, which consume GitHub Actions minutes, but cannot publish. Build-only
versions have a `preview` suffix and no desktop update feed. Android build-only runs
produce a clearly named, debug-signed preview Actions artifact. They never receive
stable signing secrets, even when those secrets exist in the repository. There is no scheduled
publisher. After upstream merges, review and release deliberately, roughly weekly.

Confirm Actions are allowed in this repository and that `Takomi-Code` is available
in the manual workflow branch selector. GitHub only exposes manual workflows after
the workflow exists on the repository's default branch. The upstream `release.yml`
has a repository guard so fork tags do not run its publication graph. Other upstream
CI workflows remain unchanged. Review their triggers before pushing to other branches.

The public npm packages are:

- `takomi-code`
- `@johnsax/takomi-code-win32-x64`
- `@johnsax/takomi-code-linux-x64`
- `@johnsax/takomi-code-darwin-arm64`

These names have not been reserved or published by this local setup. Confirm availability
and access using the existing npm account and `@johnsax` scope. Do not rename that
account, create an organization, or change the existing `takomi` package.

For each of the four packages, configure an npm **GitHub Actions trusted publisher** with:

- Organization or user: `JStaRFilms`
- Repository: `Takomi-Code`
- Workflow filename: `takomi-release.yml`
- Environment: leave blank, because the publish job has no GitHub environment

Trusted publishing needs an existing package and npm 11.5.1 or newer on the runner.
For packages that do not exist yet, the owner must authorize a one-time bootstrap
publish first. Build a non-publishing run and download its three CLI artifacts. Stage
that run's exact preview version with `scripts/build-npm-platform-packages.ts`, passing
`--archives-dir`, `--version`, `--output-dir`, and `--allow-missing`.
Publish the three platform tarballs before the launcher tarball with `--tag bootstrap`
using an interactive, 2FA-protected npm login on the owner's machine. Do not use `latest`
for this preview bootstrap. Then register the trusted publishers and remove the bootstrap
login or token. Do not put npm tokens in repository secrets. The preview version cannot
be overwritten. Suggested first stable workflow version: `0.1.0`.

The workflow uses OIDC and provenance for normal npm releases. Its dry run checks
package layout but is not proof that trusted-publisher authentication will succeed.
If publication fails partway through, inspect npm before retrying. Published versions
are immutable; do not blindly rerun the publisher.

## Build and release

A manual run defaults to `publish=false`. Select `Takomi-Code`. An optional plain
`X.Y.Z` version sets the base of its preview build; it still cannot publish.
To verify production Android signing without publishing, also select `android_signed=true`
and supply an explicit version. The Android artifact uses that stable version and the signing
secrets; Windows and server artifacts remain previews. Both publishers remain disabled.

For a deliberate stable release, choose one of these after approval:

1. Run **Takomi build and release** on `Takomi-Code`, enter an explicit version such
   as `0.1.1`, and set `publish=true`. The release creates `v0.1.1` on that run's commit.
2. Tag the reviewed commit `v0.1.1` and push that tag. A plain `vX.Y.Z` tag is an explicit
   publication request. Preview and nightly tags are not supported by this fork workflow.

Check the version is newer than the installed desktop version and has not already
been published. Do not bump workspace manifests just to release. The existing version
helper aligns manifests only in the runner checkout; the workflow never commits or
pushes version changes back to the branch.

All three CLI archives are smoke-tested through the upstream scripts. The verified Android
artifact must succeed before either publisher runs. Missing stable Android credentials fail
closed before npm publication. The workflow stages npm tarballs from the CLI archives only,
publishes the platform packages before `takomi-code`, and only then publishes the GitHub
release. The release includes the Windows EXE, blockmap, `latest.yml`, all three server
archives, `Takomi-Code-X.Y.Z-android-arm64-v8a.apk`, and `SHA256SUMS`. Only the npm job gets
`id-token: write`; only the GitHub release job gets `contents: write`.

## Android signing and build prerequisites

Prepare one dedicated, long-lived Android release keystore on an owner-controlled machine.
Keep encrypted backups of the keystore, alias, and passwords in separate protected locations.
Test that a backup can be restored before relying on it. Losing this signing key prevents
upgrades to existing production installs. Do not rotate it for each release or use the
preview debug key as the release key.

After explicit authorization, provision these repository secrets privately:

- `TAKOMI_ANDROID_KEYSTORE_BASE64`
- `TAKOMI_ANDROID_KEYSTORE_PASSWORD`
- `TAKOMI_ANDROID_KEY_ALIAS`
- `TAKOMI_ANDROID_KEY_PASSWORD`

Base64 is transport encoding, not encryption. Never commit it, paste passwords into command
arguments, or upload a keystore as an artifact. The stable job decodes the keystore only under
`RUNNER_TEMP`, signs with password environment references, verifies the certificate against
the certificate exported from that keystore, and removes its temporary files. Expo prebuild,
Gradle, and the JavaScript bundler receive no signing credentials. The helper overrides Expo's
default debug release signing, aligns the unsigned APK, then signs it with `apksigner`.

CI uses Java 17, Gradle 9.4.1 from the Expo/React Native sources, compile SDK 37, target SDK 36,
build tools 37.0.0, and NDK 27.1.12297006. It clean-prebuilds Android in the disposable runner
checkout. Generated `apps/mobile/android` files are not maintained release sources. Windows
local-build short-path workarounds are unchanged and do not apply to Linux CI.

Only the runner checkout stages the mobile version literal and Android version code. Source
mobile `2.0.0`, Android code `3`, iOS build number, and EAS numbering defaults stay unchanged.
Stable Android codes use `1 + major * 1000000 + minor * 1000 + patch`, so `0.1.2` is code `1003`.
Minor and patch must each be below 1000; components must be safe integers and the resulting
code must not exceed 2100000000. Choose an unused version newer than the previous stable
release. Preview codes are not a stable upgrade sequence.

These GitHub APKs embed JavaScript and force Expo OTA off, even if an Expo project is configured.
They need no Expo account, Play Store account, or Android npm package. The helper verifies the
APK signature, package ID, version, code, SDK metadata, embedded bundle, arm64-only native
libraries, and disabled OTA before collecting the artifact. The first Linux build and a real
device upgrade still need verification; unit tests do not establish either.

For an authorized build in a disposable Linux checkout with dependencies and the listed SDK
packages installed:

```sh
node scripts/build-android-artifact.ts --version 0.1.2-preview.20261011.1 --channel preview --build-checkout
```

For stable packaging, privately supply the four signing variables and `RUNNER_TEMP`, then run
`node scripts/build-android-artifact.ts --version 0.1.2 --channel stable --build-checkout`.
Both commands stage the checkout and clean generated Android files. Do not run them in a
working source checkout. Add `--dry-run` to inspect the plan without building or staging.

## Install and update

After an authorized publication:

```sh
npx takomi-code@latest serve
```

Or install `takomi-code` globally and run `takomi-code serve`. The launcher exposes no
`t3` global alias, so it does not replace another globally installed CLI. Node runs the
npm launcher; the packaged server includes its runtime and native dependencies.
On Apple Silicon Macs, npm selects `@johnsax/takomi-code-darwin-arm64`. Run npm
with a native ARM64 Node installation, not an x64 Node under Rosetta. Intel Macs
have no supported CLI package. Mac support is server-only; use a browser as the client.

Download the Windows EXE from
<https://github.com/JStaRFilms/Takomi-Code/releases>. Install this first fork release
manually to replace an older or feedless build. Subsequent stable builds use the
existing bottom-left desktop updater with the explicit `JStaRFilms/Takomi-Code` feed.
Preview builds stay feedless. This is the local desktop updater, not an updater for a
remote browser or hosted product.

Download the stable Android APK from the same GitHub release and compare its checksum with
`SHA256SUMS`. Android asks you to authorize the download source and confirm installation;
there is no silent installer. Production uses `com.jstarstudios.takomicode`. The current preview
uses `com.jstarstudios.takomicode.preview`, so both can stay installed with separate app storage.
Keep the preview until you have verified the production connection and settings. A historical
preview with another package ID or certificate is not an in-place production upgrade. Later
production APKs retain the package ID and signing key and use increasing version codes.
In-app APK update notification is a separate client task, not part of this packaging change.

Windows downloads are unsigned. SmartScreen may warn or block them according to local
policy. Verify the repository and checksum before choosing to run an installer.

Internal `@t3tools` names, `T3CODE_*` variables, state directories, MCP identifiers,
T3 Connect identifiers, `t3` executable/archive names, and `dist/bin.mjs` remain compatible.
The archive installers and CLI self-update resolve downloads from the fork. Archive
installers retain their existing `t3` shim behavior; use npm for the public `takomi-code`
command without that alias.
