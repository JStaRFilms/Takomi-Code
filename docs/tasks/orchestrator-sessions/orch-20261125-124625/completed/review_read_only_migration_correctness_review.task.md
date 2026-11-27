# Read-only migration correctness review

## Objective
Find concrete introduced regressions in resolved merge against backup and upstream.

## Context
Read AGENTS.md, migration skill and /tmp/takomi-migration-20261125-integration.md. Backup backup/takomi-before-upstream-merge-20261125-124625 at e59a0faf; upstream cef38e408d. No unresolved paths; merge staged/uncommitted. Concurrent coder fixes lint/translations only.

## Scope
Review narrow fork conflict resolutions for desktop stable-only feed/identity/state, remote host distribution updates, Pi session continuity/private/Vault replies vs upstream prompt acknowledgement and activation, mobile identifiers/gates, local build patches. Distinguish inherited disabled terminal release/orphaned backpressure helper from new defects. Prioritize correctness/security, not unrelated refactors.

## Definition Of Done
Source/index strictly read-only; no installs/builds/server/browser/live-state access or further delegation. Report concrete scenarios, file/line, minimal correction/test or evidence-based scoped approval. Do not require new inherited feature work.

## Expected Artifacts
/tmp/takomi-migration-20261125-review.md. Parent validates findings before commit.
