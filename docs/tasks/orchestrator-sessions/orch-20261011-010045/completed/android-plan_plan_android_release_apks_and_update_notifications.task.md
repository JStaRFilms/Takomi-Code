# Plan Android release APKs and update notifications

## Objective
Add Android to the same deliberate GitHub stable release workflow, with an app notification that opens a newer APK download and uses Android's normal installation confirmation.

## User decisions
Notify and download approved. Dedicated long-lived release signing key approved for preparation. APKs belong on GitHub, not npm. No Play Store, silent installation or new Expo OTA deployment. Existing debug preview may require a one-time reinstall.

## Prime context
Read docs/operations/takomi-release.md, release/README.md, scripts/local-build.ts and local-build-android.ts, scripts mobile build/signing configuration and apps/mobile app configuration. Inspect existing in-app native/OTA update entry points and contracts. Existing task fix writes branding/update files, so this audit is read-only.

## Scope
Explain minimal Android CI packaging with same deliberate release version, APK artifact collection and release checksums. Find package ID/versionCode/minSdk/build variant/signing configuration. Reuse existing settings and release lookup patterns for native APK update notification and download, including offline/no-update behavior. Define version comparison and stable feed independently from desktop track. Trace Android credentials without reading secret values.

## Deliverables
Source-backed implementation plan, exact files, scoped tests, UI wording and existing component choice, secure key creation/backup and GitHub secret names. Enumerate steps requiring user interaction and signing migration risk.

## Constraints
No source or artifact writes, keystore generation, secrets access, account changes, GitHub mutations, commits, builds, deployment, installations, browsers or live userdata modifications. Do not touch other worktrees. No blanket Play Store claims or silent install capability. Do not change Windows/npm compatibility. Existing brand coder remains sole writer.

## Completion criteria
Plan handles Windows local path constraints and Linux CI toolchains, durable signing upgrades, immutable released versions, versionCode monotonicity, narrow native update interaction and later local verification. Stop on significant ambiguity and return decisions for parent. Parent builds only after integrating preceding branding fixes.
