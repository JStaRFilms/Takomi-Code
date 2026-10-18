# Correct stable-only desktop updates and owned branding

## Objective
Make the fork's installed UI and updater match its numbered stable releases. Fix the remaining confirmed product copy without changing CLI commands or pretending remote upstream servers are Takomi.

## Prime context
Read this session master_plan.md and audit packet, apps/desktop/src/settings/DesktopAppSettings.ts, apps/desktop/src/updates/DesktopUpdates.ts and updateChannels.ts, apps/web/src/components/settings/SettingsPanels.tsx and NightlyMobileBeta.tsx, apps/web/src/routes/__root.tsx, ServerUpdateAction.tsx and nearby tests. Follow repository instructions and existing design system.

## Scope
Normalize saved Nightly to latest for Takomi desktop, prevent the updater setter from reactivating Nightly, ensure stable feed and prerelease/downgrade flags. Keep shared schema literals and version classification for genuine external upstream apps. Change desktop selector to a static stable row. Suppress upstream beta mobile advice for this desktop without claiming store mobile compatibility. Apply bounded owned branding corrections in onboarding, timeline author, Settings/About web/mobile and visible desktop errors. Remote server descriptions neutral. Privacy link explicitly attributed to upstream T3 Code. No telemetry behavior change.

## Constraints
All CLI commands, installation aliases, internal compatibility IDs, T3 Connect, providers, upstream attribution, product names, app IDs, profile directories and updater repository remain unchanged. No new remote distribution schema, full-build feature, certificate/secrets, live state modifications, unrelated fixes, commits, pushes, builds, publishing, app installs/launches or browser verification. Respect unrelated edits.

## Completion criteria
Meaningful behavioral tests cover legacy/explicit saved Nightly, setter normalization or rejection, updater flags and channel, unchanged CLI commands. Scoped lint/typechecks and focused tests pass. No global upstream Nightly disable. One implementation pass and one parent review, no snapshots/staticmarkup tests for mere text. Explain unresolved signer prerequisites.

## Deliverables
Narrow product/source/test diff, update existing user guidance only where needed, exact checks and limitations. Existing UI design applies; no separate visual design phase is needed for replacing the misleading selector with existing settings-row styling.

## Dependencies and review
Read-only audit is complete. Parent reviews the diff and reruns focused checks before declaring local completion.
