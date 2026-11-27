# Correct confirmed migration regressions

## Objective
Confirm and fix the six reported issues before committing the November migration.

## Scope
Use /tmp/takomi-migration-20261125-review.md and verification handoff. Check the latest staged source, fix only confirmed migration regressions, and cover the changed behavior with focused tests. Keep stable Android release planning separate from EAS workflow fixes; do not access credentials or trigger GitHub. Investigate ChatView lint timeout with bounded resources and report any tooling blocker.

## Definition Of Done
Each finding has evidence, a minimal fix and check, or a concrete reason it does not apply. Stage product only; no commit, release build, push, live-state or route changes.

## Expected Artifacts
Resolved staged changes; exact checks and remaining limitations in /tmp/takomi-migration-20261125-fixes.md.
