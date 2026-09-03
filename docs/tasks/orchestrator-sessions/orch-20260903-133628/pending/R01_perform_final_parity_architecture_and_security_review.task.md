# R01 — Final architecture, security, and parity review

**Role:** Reviewer
**Stage:** Build
**Depends on:** B19

## Objective
Independently decide whether Takomi Code may claim maximum-fidelity Pi/Takomi integration.

## Review requirements
Read the master plan, parity ledger, all implementation diffs, tests, protocol fixtures, user/internal docs, and current Pi/Takomi versions. Re-run the smallest checks for every high-risk invariant.

Verify:
- Pi remains session/execution authority and T3 never rewrites JSONL.
- Exclusive ownership is explicit; Clone remains safe default.
- Unsupported operations are rejected before side effects.
- Crash recovery cannot hide native context.
- Extension requests settle exactly once.
- Dynamic payloads are decoded, bounded, and redacted before persistence/projection.
- No arbitrary extension runs inside the T3 server process.
- Web, desktop, mobile, local, remote, and tunnel decisions are complete.
- Codex/Claude behavior and generic clients did not regress.
- Docs avoid claiming literal TUI parity.

## Deliverable
Act on / Consider / Noted / Dismissed findings, release blockers, residual risks, and a final exact-vs-approximate parity statement.

## Definition of done
Approval is evidence-based; unresolved safety, data-loss, hidden-transcript, or lying-capability issues block release.
