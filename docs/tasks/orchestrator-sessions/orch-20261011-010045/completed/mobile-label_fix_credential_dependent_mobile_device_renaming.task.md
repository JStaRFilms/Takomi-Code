# Fix credential-dependent mobile device renaming

## Objective
Let a connected mobile device be renamed without needing its saved bearer token. The user sees 'The saved bearer credential is unavailable' when saving LABEL from JOHNSAX to Takomi.

## Prime context
Read apps/mobile/src/features/connection/ConnectionEnvironmentRow.tsx, useConnectionController.ts and state/use-remote-environment-registry.ts, packages/client-runtime/src/connection/onboarding.ts and its focused tests, EnvironmentRegistry service and storage/credential abstractions. Preserve existing uncommitted branding changes, especially mobile SettingsEnvironmentDetailRouteScreen.tsx.

## Known trace
useConnectionController.updateEnvironment always calls updateBearer with label and displayUrl. onboarding.updateBearerConnection selects the first BearerConnectionTarget route and retrieves credentials before prepareBearerConnectionUpdate checks missing credential. A connected session or another active route does not prove that first route still has a saved bearer token. Confirm this against the registry before implementing.

## Scope
A label-only edit should update local metadata through existing registry/profile persistence without requiring a bearer secret, re-registering authentication or changing routes. Validate trimmed nonempty label. Preserve LAN/Tailscale URLs, active route, connection IDs, credentials, sessions, enabled state and environment identity. Actual URL edits must keep existing validation/authentication safeguards and report failure without partial label changes. Prefer existing registry update utilities, no broad identity/credential refactor.

## Completion criteria
Focused behavior tests cover label-only edits with missing saved bearer, multiple routes and active route distinct from first direct route, persistence/reload, unchanged credentials, and actual URL editing/validation. No static-markup or callback wiring tests. Scoped typecheck/lint/format/tests pass. Report relevant pre-existing failures separately.

## Deliverables
Small source/test diff with proven root cause and exact check results. Do not touch unrelated Windows/Android release files, docs catalogs, signing, CLI commands or other worktrees.

## Safety and handoff
Local edits/tests only. No commits, pushes, builds, publication, live state modifications, connection re-pairing/deletion, browser/device/app launch or secrets values access. Parent review once before Android packaging. Earlier branding/channel work is reviewed and must remain intact.
