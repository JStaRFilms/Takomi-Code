# Audit update channels, visible branding and signing

## Objective
Explain why stable Takomi0.1.1 shows Nightly, upstream copy and Unknown publisher, and identify the smallest valid corrections.

## Scope
Read-only settings/updater contracts and default/migration paths across desktop/web/mobile; server update/relaunch messaging; remaining user-visible Takomi-owned branding; Windows packaging/signing and product metadata. User explicitly leaves all CLI commands/install aliases unchanged. Distinguish real connected upstreamT3 server identity and T3Connect.

## Completion criteria
Source-backed diagnosis of update tracks and old persisted nightly handling, proposed minimal implementation file list/tests, accurate signing prerequisite and no costly/external changes. No invented telemetry/privacy policy.

## Deliverables
Concise audit result with paths, decisions, focused checks recommended and any approval needed. No source or artifact writes. Parent uses findings for one implementation pass.

## Constraints
No commits/push/build/release/deployment/browsers/live userdata access mutation or other worktrees. No new full-build feature without concrete user requirements.
