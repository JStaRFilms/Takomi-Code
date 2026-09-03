# B01 — Add a truthful provider capability contract

**Role:** Coder
**Stage:** Build
**Depends on:** B00, D01, D02, D03

## Objective
Evaluate and extend the leading upstream Orchestrator V2 capability contract rather than inventing a competing schema, then remove remaining driver-name inference and broad booleans needed by this fork.

## Read first
`Upstream_Strategy_and_Resilience_Addendum.md`; upstream PR #7211's `packages/contracts/src/orchestrationV2.ts`, `PiAdapterV2.ts`, and `CommandPolicy.ts`; then this branch's `packages/contracts/src/server.ts`, provider snapshot builders, Codex/Claude/Pi providers, web/mobile provider option and runtime-mode controls, `ProviderAdapterShape`, and compatibility decoding patterns.

## Implement
Model only capabilities clients need to gate behavior: supported runtime modes; interaction mode; model switching; prompt queues; compaction/retry/bash; session list/resume/fork/tree/import/export; command/skill discovery; extension input methods/custom UI fidelity; context/board/subagents; transcript fidelity. Keep fields finite and optional for backward compatibility. Empty/false means unsupported; discovery failure must be distinguishable from unsupported. For each new RPC action, define and test its required authorization scope in `RPC_REQUIRED_SCOPES`; do not assume an undefined generic admin scope.

The current fork must advertise only `full-access` until complete permission enforcement exists. If adopting #7211's public blocking `tool_call` hook, Supervised and Auto-accept edits may be advertised only after focused tests prove enforcement; Pi still does not advertise Auto review. Hide Plan unless a concrete adapter behavior enforces it. Add a rollback capability used before checkpoint side effects.

## Verification
Focused contract decode tests, provider snapshot tests, web/mobile mode-option tests, and checkpoint preflight tests. Confirm legacy snapshots still decode and Codex/Claude behavior is unchanged.

## Definition of done
No Pi action or safety mode is visible unless the server advertises and enforces it; unsupported rollback is rejected before filesystem mutation.
