# Second Takomi upstream migration

## Context
User requests another upstream migration following the completed November 4 migration. Current checkout /home/dev/workspaces/Takomi-Code is clean on Takomi-Code, HEAD e59a0faf285fe969626ab64573bc46c2e3431511, no other worktrees or merge/rebase/cherry-pick operations. Immutable backup backup/takomi-before-upstream-merge-20261125-124625 points at original HEAD. Safely fetched upstream main cef38e408d45b74a02f99da0ed3d400d97fd4182 with 4377 new commits. Tag fetching used --no-prune and no force; fork v0.1.1/2/3 collisions rejected and preserved. Existing production browser test PID198905 listens on 127.0.0.1:8788, Tailscale9443; leave process, routes, dist assets and state untouched.

## Plan
1. Genesis/preflight completed: inspect checkout, active operations, remotes and worktrees; preserve backup before fetching. Use repository migration skill and weekly-prompt as procedure. Do not create a new product foundation.
2. Design/integration: one coder owns the shared merge index and product edits. Read both versions and tests per conflict. Prefer upstream architecture while preserving narrow Takomi/Pi intent. Single integration task intentionally keeps dependent merge resolutions under one writer, not concurrent domain writers.
3. Build/verification: normal no-commit merge, focused regression tests and package-scoped typechecks/lint; no repository-wide checks. Audit maintained fork docs. Do not modify ignored built assets because the existing test server uses them.
4. Review/finalize: parent reviews integration evidence and requests independent read-only focused review before committing. Only relevant confirmed regressions authorize corrective work. Preserve inherited hidden release-to-CLI limitation; no new release feature required. Confirm exact upstream merge base and clean tree after local merge commit.

## Constraints and risks
No push, release build, browser/dev server, existing-server restart/rebuild, live database/credential mutation, stash/reset/discard/rebase, other worktrees or duplicate migration. Existing test server must keep its original build. No exact Pi package-version allowlist. Preserve desktop identity/state and stable-only updater, mobile IDs/gated infrastructure, session ownership/v3 continuity/private input, host-authoritative updates and local build sources. Last migration had large architecture changes; avoid blind ours/theirs resolutions. Prior unused transport helper and disabled terminal release predate both migrations; report inherited limits without expanding scope. Tooling from prior migration may be reused if present, verify current engine/dependencies rather than assuming Node26 still matches.

## Routing
No installed routing policy was available in prior run; user explicitly instructed proceeding without routine setup questions. Use Takomi provider and an explicitly selected live-catalog model for the single writer, with no harness switch.

## Deliverables and acceptance
Product merge resolved and staged, external integration report with refs, per-domain reasoning, exact checks and real limitations. Parent owns merge commit after review. No orchestration artifacts in commits. Final report includes original/backup/upstream/merge refs, checks and optional build/serve commands without executing them. Warn .t3/production-test is already IN USE by PID198905 and cannot be reused concurrently.