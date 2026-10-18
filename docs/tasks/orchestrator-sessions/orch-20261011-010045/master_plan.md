# Takomi release channel and branding corrections

## Requested outcome
The installed 0.1.1 fork must describe the release channels it actually publishes and use Takomi branding in its visible UI without pretending connected upstream T3 servers are Takomi. Investigate the unsigned Windows publisher warning and explain the signing requirement.

## Scope
Audit settings and update selection on web/desktop/mobile, persisted nightly settings, desktop updater release feed, remote relaunch copy, remaining visible branding and Windows product metadata. Preserve CLI executables/install behavior and internal compatibility identifiers, T3 Connect, live userdata and all other worktrees. No speculative full-build feature.

## Plan
1. Genesis: read-only audit with source-backed minimal recommendations and signing facts.
2. Build: implement only confirmed copy and stable-channel defects, with focused behavioral tests. Obtain approval if the audit exposes a significant choice or external requirement.
3. Parent focused review and scoped checks. Report signing limitations without claiming a certificate can be replaced by copyright metadata.

## Release boundaries
No commits, pushes, npm publications, tags, workflow dispatch, certificate procurement, signing secrets, installation or app/browser launch without additional approval. Preserve successful release0.1.1. Work artifacts remain uncommitted.

## Done
Requested defects fixed locally, focused checks pass, no CLI/runtime identity or connection regression, signing options and unverified runtime checks clearly reported.