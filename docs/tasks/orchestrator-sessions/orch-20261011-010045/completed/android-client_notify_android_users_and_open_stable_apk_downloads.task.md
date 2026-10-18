# Notify Android users and open stable APK downloads

## Objective
Approved Android update flow checks GitHub releases and offers a newer stable APK download. Android handles installation confirmation. No silent installation, npm package or Expo OTA deployment.

## Prime context
Read session master_plan.md and android-plan, prior android-package helper and asset convention, apps/mobile/src/features/updates/app-updates.ts, App.tsx, HomeRouteScreen.tsx, SettingsAboutRouteScreen.tsx, existing PermissionUpdateNotice patterns and packages/shared/src/cliRelease.ts.

## Scope
Implement a small tested native Android release lookup using the existing fork GitHub release index. Validate unknown JSON, plain vX.Y.Z stable tags, non-draft/non-prerelease records, matching nonzero Takomi-Code-X.Y.Z-android-arm64-v8a.apk assets and numeric comparison against the installed native version. No available APK for release0.1.1 means no Android release, not a broken download. Bound requests and deduplicate simultaneous checks. Stable production Android only, independent of Updates.isEnabled. Keep iOS OTA and previews unchanged. Reuse existing Alert.alert and Linking.openURL conventions and settings-row styling. Manual check states distinguish checking, up-to-date, no Android release and check failure. Automatic offline errors stay quiet. Dismissed-version notice must not repeatedly reopen. Download opens a fixed trusted GitHub asset URL, no extra Android install permission or false installed/download-complete status.

## Completion criteria
Behavior tests cover valid/missing assets, semantic version order, drafts/prereleases, native version comparison, offline/manual failure, concurrent checks, dismissal and failed URL opening. No static markup/snapshot text-only tests. Focused lint/typecheck/tests pass. Keep shared contracts/backend/CLI/update tracks unchanged.

## Deliverables
Narrow client implementation/tests and update existing docs/features/takomi-desktop-and-android.md with client-to-GitHub flow and no new database schema. Explain side-by-side stable/preview storage and durable key requirement, do not recommend deleting preview data. No test devices/app launch/installation/build/browser, commit, push or publication.

## Dependencies and review
Wait for Android packaging to establish the exact asset/version convention. Parent reviews once, handles signing and authorizes actual APK build. Use existing UI components, no separate visual redesign.
