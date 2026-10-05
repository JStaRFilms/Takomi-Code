# G01: Reconcile app parity and establish the completion ledger

## Agent setup

Working directory MUST be `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`. Read `../2026-07-22_t3code` only if comparing the live baseline; write nothing there. Load `agent-engineering`, `unslop`, and the Genesis workflow. Read this repository's AGENTS.md, this session's master_plan.md, and the writing-for-agents/spawn-task guides referenced by agent-engineering before drafting agent-facing recommendations. Prime by inspecting branch/status, relevant contracts, provider architecture and existing feature documents.

This is architecture and evidence collection, not UI/UX Design or implementation. No subdelegation, code edits, builds, servers, browsers, dependency installation, external requests or commits. You own only this session's documentation and board artifacts in this worktree. Another worker independently examines the canonical suite and returns an inline report; do not edit that suite.

## Objective

Produce a current, exhaustive Pi/Takomi functional parity ledger, source-grounded completion strategy and precise first Build-slice recommendation. Convert the existing audit into measurable requirements without treating historical tasks as current facts.

## Scope

Read native Pi 0.99.1 references at `C:/Users/johno/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/docs/`, plus relevant installed public API declarations/source if necessary. Compare current app code under `apps/server/src/provider`, `apps/server/src/orchestration`, `apps/web`, `apps/mobile`, `apps/desktop`, `packages/contracts`, `packages/client-runtime`, and `packages/takomi-pi-host`. Read `docs/features/takomi-code-handoff.md`, `takomi-pi-provider.md`, `takomi-tool-call-ui-audit.md`, provider internals and the historical session `orch-20260903-133628` for intent only. Compare Claude/Codex implementation patterns for capabilities, lifecycle, compaction, menus, questions and client presentation rather than copying provider-specific semantics.

Cover all 13 groups in master_plan.md. Enumerate native RPC operations and extension UI methods individually, not just one row saying 'Pi supported'. Distinguish all-client behavior and remote/instance/workspace scope. Verify existence with source references. A discovered tool renderer is not a deterministic control; a file-prefix fork is not native branch navigation. Find original brief omissions and real correctness gaps, not optional cleanup.

## Board registration

Parent already authored this session's master_plan.md and G01/G02 packets. Before investigation, use `takomi_board init_session` HERE with sessionId `orch-20260930-032143`, title 'Finish Pi and Takomi functional parity', the complete master plan as masterPlanMarkdown, and both complete task packets as taskMarkdown. Use canonical role/stage/workflow fields, meaningful objective/scope/definitionOfDone/expectedArtifacts. G01 is architect, Genesis, in-progress, Sol high, write-docs. G02 is worker, Genesis, in-progress, Luna high, read-only. Do not create another session or invoke the board in the live checkout. Reuse this session if it is already initialized; inspect rather than overwrite authored content. Keep your G01 status in-progress after returning so the parent can verify artifacts before completion. G02 also stays in-progress until the parent receives its report.

## Required ledger structure

For each capability: stable ID, native source/version, app source file/location, web status, desktop status, mobile status, boundary required (RPC/SDK/extension), unit/integration evidence, real-client evidence, target behavior, blocking prerequisite, task grouping, and unavoidable limitation/alternative if applicable. Use implemented/verified/partial/missing/native-limited, with proof separated from existence. Include capabilities currently implemented so later writers do not rebuild them.

Record the user's successful Continue test as user-reported manual evidence. Release/CLI/GUI sync remains pending. Do not claim full client or release readiness.

## Specific correctness investigations

1. General `prompt` handled/queued/started lifecycle on Pi 0.99.1: adapter only special-cases Vault command acknowledgements. Trace `/takomi-status` and any command that starts independent model work. Recommend failing focused tests and a robust settlement contract; do not propose blanket completion on any handled response.
2. `PiProtocolConformance.test.ts` hard-codes installed version 0.84.4 while the catalog supports 0.99.1. Identify which tests are reproducible fixtures vs installed-native integration and the minimum truthful repair. One native fixture test failed in a multi-file run but passed standalone; report that observation without inventing its cause.
3. Determine how much branch/active-leaf/high-water state is represented now, and what the native public APIs actually permit. Sequential attach is authorized. Concurrent writers remain unsupported; the historical clone-only rule is superseded.
4. Determine whether a managed public-SDK host exists beyond capability-probe scaffolding. Do not assume the old planned SDK superset was implemented.
5. Identify test/device/tool availability requirements for final verification. Parent currently lacks the built-in Browser tools; do not schedule fake browser substitutes.

## Deliverables

Write only under this session folder:

- `parity_ledger.md`: exhaustive current matrix with evidence and uncovered requirements.
- `completion_strategy.md`: dependency-ordered vertical slices, per-repository ownership, minimal proposed interfaces, decisions that need design, first task scope and checks.
- `G01.report.md`: findings, exact baseline, blocking gaps, unresolved questions and the board initialization result.

Do not write placeholder Build packets. Give the parent the material to author them. Preserve the master plan and original packets except for board-managed movement/status.

## Definition of done

All native RPC commands and extension UI methods are accounted for, every major original requirement has a client-specific row, the first implementation task has measurable acceptance criteria and source/test references, and blocked verification is explicit. Reports exist on disk and no application code or unrelated work changed. Return artifact paths and a concise synthesis. No implementation or compatibility claims beyond evidence.
