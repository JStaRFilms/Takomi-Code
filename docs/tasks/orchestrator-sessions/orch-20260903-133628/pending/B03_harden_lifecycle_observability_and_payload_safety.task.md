# B03 — Harden lifecycle, observability, and payload safety

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B02

## Upstream reuse gate
Before implementation, read `Upstream_Strategy_and_Resilience_Addendum.md` and compare the task against upstream PR #7211 (`upstream/pr-7211`). Reuse or contribute focused upstream-safe work where architectures align; do not duplicate completed behavior, import Takomi into generic Pi code, or cherry-pick the incompatible provider stack wholesale.

## Objective
Fix the existing adapter risks before adding new parity features.

## Required changes
- Accept and write the native event logger using the established Codex/Claude pattern.
- Add session generation and stopped-context fences before normalizing any stdout record.
- Give every malformed-record diagnostic a unique identity.
- Bound/allowlist tool args, partial results, results, and presentation data before canonical persistence, not only before websocket projection.
- Decode presentation envelopes at the boundary and preserve explicit truncation metadata.
- Settle pending RPC/UI waiters exactly once on abort, EOF, start failure, and scope close.
- Preserve the user's existing uncommitted Pi/mobile/web changes; inspect and reconcile them before editing.

## Tests
Late tool/message after stop, superseded process output, multiple malformed lines, oversized extension payload, logger receives each native record, pending UI cancellation, abrupt EOF, and no duplicate settlement.

## Definition of done
A stopped or superseded process cannot mutate a thread, persisted payload size is bounded, and native failures are independently diagnosable.
