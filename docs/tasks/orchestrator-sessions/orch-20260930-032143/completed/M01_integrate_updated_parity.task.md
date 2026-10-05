# M01: Integrate the user's updated parity branch

## Setup

Sole writer in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next, feat/pi-parity-next. Read AGENTS.md, nested instructions, takomi-upstream-migration and unslop. Read .repos/effect-smol/LLMS.md before Effect changes. Use the existing file-based orchestration session. No native board writes to the live checkout.

## Pinned targets and authorization

User merged upstream into local feat/pi-takomi-parity and explicitly authorized incorporating it here, resolving clashes, re-scoping and continuing parity. Source0720935fda86295cd76d428535dbbcee5e3cb2de, parents7d4d07a2d26dac5bd5ff9a17db19303080c6805b and5cc99e1c23980d7995a13c47f969b47cb68ed1be. Upstream tracking ref is that second parent. Our original HEAD0d80793570d634ef9bf87a6510c941525a4d5b0a; common basea3ac94d0c29673e3bbc5a1efc435f16ed48ad0f4.54 incoming commits,299 incoming files,65 local changed files,24 overlapping paths. Only our local session directory is untracked, with no incoming path collision. Both tracked checkouts clean before integration.

Merge ONLY this pinned source into the isolated branch. Do not fetch/merge a newer upstream or origin independently, modify/push/merge the live branch, touch dormant feat/pi-debrand, reset/clean/stash, alter canonical/global install/auth/native/live state, or commit local plans. Parent creates a backup and initiates --no-commit merge before delegation. Read actual MERGE_HEAD and index state before changes; don't restart an in-progress merge.

## Objective and scope

Resolve textual AND semantic incompatibilities while preserving upstream architecture/stability/features and all reviewed local B01-B06 behavior. Local identity/branding/state paths remain Takomi-specific. Source includes preserved live transport/catalog changes; keep the narrowest correct combined implementation and delete superseded local work only when behavior/tests justify it.

For every conflict read full file, base/current/source versions, related types/tests. Ours means our eight isolated commits, theirs is the user's already-merged parity branch, not stock upstream. Never choose an entire side by label. Inspect nonconflicting overlap too, especially native runtime/ingestion/command settlement, ws transport/coalescing, schema/RPC/private flow, shared session-aware subscriptions, provider service/start/delete admission, latest UI state, active-owner support and web/mobile composer integration. Preserve source's changed generic provider semantics without global Pi exceptions.

Known B05 guarantees: direct ephemeral publication, one shared controller, actual wrapper identity, scoped publisher/process lease, first-effect start admission before queue/async work, deletion invalidation, valid adoption, wake-token latest-only stream, UTF8/JSON byte accounting, no durable widget journal/raw setter logging/title/draft mutation. B06 current plaintext statuses/widgets/subtitle and correct active owner gate must survive. B07 not implemented, failed fetch left no source changes; don't invent its completion.

## Verification and dependencies

Read package/lock/patch changes before testing. Run focused conflict/overlap/behavior tests and touched-package typechecks, owned lint/fmt/diff only. No repo-wide checks. Distinguish outdated installed dependency graph from source defects. Do not install/sync vendored refs, launch servers/browsers/Metro/native or release builds, execute real sessions/extensions/auth or kill processes. Report the exact dependency blocker if current node_modules cannot validate the merged graph.

Prior baseline exceptions apply only to specifically unchanged B01 lint and two Windows-Claude fixtures, independently verified before this new baseline. Re-attribute them if touched; no general waiver. No weakening tests/suppressions/production timeout changes. Existing hermetic fixtures allowed.

## Deliverables and completion

Write exact session-root M01.report.md listing conflict paths/resolution reasons, semantic overlap decisions, backup/source/original IDs, changed dependencies and exact check results/limits. Preserve all local plans. Parent reviews before completing the merge commit; writer may stage ONLY resolved merge files after inspecting index, but does NOT commit. Don't reset naturally staged incoming merge changes. No competing writer/subdelegation.

Done means conflicts resolved, intended source and local behavior retained, focused checks pass or an explicit dependency/user gate is recorded without claiming acceptance. Return synchronously. Parent records merge/audit, then re-scopes and resumes B07/remaining parity in dependency order.
