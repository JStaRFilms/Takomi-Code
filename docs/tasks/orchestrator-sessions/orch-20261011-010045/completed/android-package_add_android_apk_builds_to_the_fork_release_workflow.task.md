# Add Android APK builds to the fork release workflow

## Objective
Build Android arm64 APKs alongside the existing Windows desktop and three CLI archives. Stable releases use durable signing credentials, previews remain clearly debug signed. This is not a new npm package.

## Prime context
Read session master_plan.md and android-plan, .github/workflows/takomi-release.yml, scripts/local-build.ts Android build sequence, apps/mobile/app.config.ts and fingerprint.config.js, Expo/Gradle version catalogs and existing release tests, docs/features/takomi-desktop-and-android.md and docs/operations/takomi-release.md.

## Scope
Add a focused build helper and behavioral tests, clean prebuild in a disposable runner checkout, Linux Gradle with explicit compatible Java/SDK/NDK, embedded JS arm64 native APK, production package com.jstarstudios.takomicode for stable and existing .preview for previews. Disable Expo OTA only for these APK builds. Stage the release version literal and numeric versionCode in the runner without bumping source defaults or iOS/EAS behavior. Use a bounded monotonic SemVer scheme, validate numeric components, overflow and Android limit. Asset name Takomi-Code-X.Y.Z-android-arm64-v8a.apk. Android succeeds before npm and GitHub publish jobs. Stable secret decode only in runner temp, sign and verify package/version/certificate metadata before upload. Include APK in release checksums. Preview pushes need no stable credentials.

## Key handling
Proposed GitHub secrets TAKOMI_ANDROID_KEYSTORE_BASE64, TAKOMI_ANDROID_KEYSTORE_PASSWORD, TAKOMI_ANDROID_KEY_ALIAS, TAKOMI_ANDROID_KEY_PASSWORD. Missing stable credentials must fail before publication. No credentials provisioning, key generation, backup or secret value access in this task. Parent will handle private user-authorized provisioning after local review. Secrets never enter public Expo extra, logs, caches or artifacts. Preserve existing npm trusted publishers and OIDC scopes.

## Completion criteria
Scoped tests prove version/code boundaries, production versus preview config, fail-closed signing prerequisites, all release publication gates and asset checks. No unrelated Windows/Linux/Mac/server release changes. Typecheck/lint/format/diff clean within modified scope. Existing release docs describe native signing, APK download and distinct preview app storage. No false device-upgrade/runtime verification.

## Deliverables
Reviewed source/tests/workflow diff and updated existing release/feature guidance. Report exact authorized build command and private signing prerequisites. No builds, commits, pushes, publications, account mutations, secrets generation, installation or browser use in implementation.

## Dependencies and review
Wait for the active branding coder and parent integration before writing. Read-only Android architecture is complete. Parent performs one focused review and later authorizes actual build. Preserve Windows short-directory workarounds without applying them to Linux CI. Never remove or overwrite another worktree or live state.
