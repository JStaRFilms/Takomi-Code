# Integrate current upstream without disturbing running test

## Objective
Merge upstream cef38e408d45b74a02f99da0ed3d400d97fd4182 into Takomi-Code while preserving narrow fork behavior and the existing running test server.

## Setup
Read AGENTS.md, .agents/skills/takomi-upstream-migration/SKILL.md, weekly-prompt.md and this session master plan. Verify clean preflight state except session artifacts. Backup backup/takomi-before-upstream-merge-20261125-124625 preserves e59a0faf285fe969626ab64573bc46c2e3431511. No merge started yet. Sole worktree writer.

## Scope
Start normal no-commit merge, inspect full conflicting versions plus focused tests. Preserve upstream improvements and narrow Takomi identity, stable updater, mobile config, Pi continuity/private input, distribution-aware updates and local build source. Audit maintained docs without rewriting history. Bootstrap dependency/tooling only as necessary and safe.

## Definition Of Done
All conflicts resolved and reviewed; focused tests, authored-file lint and package-scoped typechecks pass or blockers documented honestly. Product changes staged, no commit. No blanket resolutions, exact Pi version allowlist, repo-wide checks, push, release build, browser/server, process kills, live-state writes, reset/stash/discard, other worktrees or further delegation. Do not rebuild or overwrite ignored dist assets used by the running server. Keep orchestration files unstaged.

## Expected Artifacts
Resolved product index and /tmp/takomi-migration-20261125-integration.md with exact refs, rationale, command results and remaining limitations. Parent receives handoff for independent review and final commit.

## Verification checkpoint
Parent inspects staged diff and report, reviews source safety and only then commits. Existing .t3/production-test is in use, never start against it.
