# B18 — Close utility-generation and documentation gaps

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B12, B13, B14, B15, B16, B17

## Upstream reuse gate
Before implementation, read `Upstream_Strategy_and_Resilience_Addendum.md` and compare the task against upstream PR #7211 (`upstream/pr-7211`). Reuse or contribute focused upstream-safe work where architectures align; do not duplicate completed behavior, import Takomi into generic Pi code, or cherry-pick the incompatible provider stack wholesale.

## Objective
Remove remaining first-party product gaps and publish accurate user/internal documentation.

## Implement
Add optional Pi-backed utility text generation for thread titles, branch names, commit messages, and PR content using an isolated no-session or dedicated utility session so the active conversation is not polluted. Respect provider/model configuration, cancellation, timeouts, and auth errors.

Update `docs/user/` for install, session import/resume/handoff, commands/skills, Run Details, remote-host paths, and unavoidable TUI limitations. Update `docs/internals/` with protocol ownership, bridge/versioning, resume cursor/reconciliation, single-writer safety, extension trust, and the capability ledger. Update operations docs for diagnostics and upgrades. Reconcile or replace the existing Takomi feature docs so stale claims do not remain.

## Tests
Utility generation success/failure/cancel/no-session pollution plus documentation link/command validation where available.

## Definition of done
Pi no longer fails generic utility requests, and users/maintainers can distinguish exact parity, canonical approximation, and unsupported terminal behavior.
