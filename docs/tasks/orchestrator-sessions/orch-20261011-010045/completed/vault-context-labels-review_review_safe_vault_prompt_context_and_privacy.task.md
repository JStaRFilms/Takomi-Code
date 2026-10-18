# Task 25: Review safe Vault prompt context

## Objective
One focused read-only review of Task24's label fix. User's live A-D checks passed after the native stdout guard repair, but the form only showed Vault secret. User explicitly asked for useful field/service/host/purpose labels without exposing entered values.

## Prime context
Read AGENTS, Task24 and .t3/vault-code-backups/round3-labels/result.md and exact diffs. Inspect current adapter/tests, native fixture, approved installed tools.ts/secret-input.ts and relevant shared question renderers. Prior first repair failed actual RPC because of stdout takeover; native notify correction passed113 current tests and live A-D. Do not undo that correction.

## Scope
Review optional additive display metadata derived only from actual registered execute request arguments before entry. Metadata should match each field/service/host/purpose and fit existing bounds/envelope. Invalid/missing context safely generic. Accept context only after live ownership admission; no raw native title, entered values, stored credentials, suggested labels, nonce/owner/session data as visible UI context. Existing web/mobile fields should render useful labels without UI redesign or contracts. Public request context can persist as intended; private transport and input remain excluded.

Review masking/private answers, capability/version compatibility, once correlations/lifecycle/answer-time checks and slash/import/TUI unchanged. Scope is label correction, not grant/storage/model/provider redesign. Trusted local extensions/process remain the threat boundary.

## Definition Of Done
Pass or confirmed correctness/privacy/requirement blockers with exact lines and minimal correction. Read native conformance test using real installed runRpcMode/outputguard/tool source with strict persistence mocks: distinct two-field context, later service/host/no purpose, invalid/oversized metadata fallback, deliberately malicious private title excluded, private value/owner IDs not in client/model/history/events or stdout/stderr. Coder113/no skips passed; parent reruns independently. No duplicate test/build needed from reviewer. Verify real evidence, not only a summary.

## Expected Artifacts
Read-only report, no files written. State any real live-rendering/source-selection limitation. No style/refactor/speculative suggestions or new abstraction work.

## Constraints
No edits, real SDK/Vault/auth/model/session queries, private state/settings/env/signing/.npmrc, network/accounts/popups, server/provider/browser/device/app launch/restart, builds, commits/push/publication or agents. Do not touch apps/server/dist or .t3/vault-rpc-preview-r2/server. Only source and code-only snapshots/diffs/logs may be read.

## Dependencies and checkpoint
Task24 source complete but acceptance pending. Parent checks and this review precede a new separate output, never overwriting a live runtime. User still must validate actual labels in the client.
