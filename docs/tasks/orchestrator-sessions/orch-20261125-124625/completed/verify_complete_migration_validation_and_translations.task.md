# Complete migration validation and translations

## Objective
Finish the outstanding validation of the resolved November25 merge without expanding product scope.

## Context
Read AGENTS.md, migration skill, /tmp/takomi-migration-20261125-integration.md. Active merge cef38e408d into original e59a0faf, resolved product staged. Logs /tmp/takomi-nov25-*. No other product writer. Prior tests/package checks passed but final lint, mobile translation generation and last typecheck rerun incomplete.

## Scope
Finish authored-file lint, current mobile i18n generation/check, touched package typechecks including standalone takomi-pi-host package task compatibility. Fix only concrete migration breakages. Investigate stalled commands rather than endlessly increasing timeouts; bound worker/memory use and capture exit status. Run relevant regression tests for fixes.

## Definition Of Done
Outstanding checks pass or precise real blockers documented. Stage reviewed product-only changes. No commit/push, release or web builds, browsers/servers, live state, other worktrees, reset/discard or further delegation. Preserve running PID198905 dist assets, port8788/Tailscale9443 and .t3/production-test.

## Expected Artifacts
/tmp/takomi-migration-20261125-verification.md with exact commands/results, fixes and limitations. Parent reviews before local commit.
