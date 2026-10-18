# Task 28: Review Vault readability changes

## Objective
Review Task27's narrow fix after user complained R3 labels still formed a blob. The real web card collapsed newlines. Source now separates instruction/destination/purpose/privacy and preserves paragraph breaks, without a new form schema or label API.

## Prime context
Read AGENTS, Task27, .t3/vault-code-backups/round4-readability/result.md/diffs and current adapter/web card/test/mobile card. Approved installed tools.ts changes are descriptions only; secret-input.ts unchanged. Actual RPC ownership/native guard repair and user A-D functionality must remain intact.

## Scope
Check clear instruction, unchanged authoritative identifiers/purpose, destination lines, privacy own paragraph and archive/legacy fallback. Web uses paragraphs with whitespace-preserving text and accessible header/description. Mobile Text preserves paragraph copy, only accessibility label changed. No raw native title/value/ownership exposure, no composer draft, masking/response/routing/lifecycle/grant changes. Tool descriptions ask plain-language purpose before opening where possible but cannot override exact user prompts or infer unknown values.

## Definition Of Done
Pass or confirmed correctness/privacy/requirement blockers with line and minimal fix. Check meaningful existing parent-panel behavioral test covers accessible field instructions, private submit/clear/pending/error handling; no false browser/pixel claim. Coder113native tests plus14client tests passed, source/types/lint/fmt logs available. Parent reruns checks; no duplicate tests/build needed. Verify no unrelated source cleanup or new abstractions. Code copy/privacy changes only; previous working flow must stay.

## Expected Artifacts
Read-only focused report; no edits/files. Mention actual browser/mobile rendering is unverified and requires user later. No style-only suggestions, speculative privacy redesign, broad tests or helper API proposals.

## Constraints
No source/settings/env/Vault/signing/.npmrc/data writes/reads outside source evidence. No real SDK/auth/model/session/Vault/network/install/accounts/browser/provider/server/device/app launch/restart, builds, commits/push/pub or agents. Protect apps/server/dist, apps/web/dist, R2/R3 server trees. Only code/diffs/test logs may be read.

## Dependencies and checkpoint
Implementation source completed. Parent checks and this review precede fresh isolated web+server builds; old client cannot be copied as it collapses whitespace. User manually verifies afterward, existing servers remain running.
