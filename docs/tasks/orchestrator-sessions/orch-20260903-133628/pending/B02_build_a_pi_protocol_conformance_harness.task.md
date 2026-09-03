# B02 — Build a Pi protocol conformance harness

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B01

## Upstream reuse gate
Before implementation, read `Upstream_Strategy_and_Resilience_Addendum.md` and compare the task against upstream PR #7211 (`upstream/pr-7211`). Reuse or contribute focused upstream-safe work where architectures align; do not duplicate completed behavior, import Takomi into generic Pi code, or cherry-pick the incompatible provider stack wholesale.

## Objective
Create deterministic fixtures and focused tests that lock the integration to the installed/supported Pi protocol instead of undocumented assumptions.

## Read first
Pi `docs/rpc.md`, `docs/json.md`, `docs/session-format.md`, installed RPC declarations, current Pi adapter tests, Codex mock-peer fixtures, and T3 receipt-based async testing conventions.

## Implement
A mock Pi RPC peer and sanitized JSONL fixtures covering: out-of-order responses, all streaming deltas, tool updates, queue events, extension UI requests, compaction/retry events, session state/entries/tree, model/thinking changes, malformed records, unknown forward fields, graceful shutdown, abrupt EOF, and late events after abort. Include fragmented UTF-8, split LF/CRLF, U+2028/U+2029 inside JSON strings, multiple records per chunk, EOF remainder, and oversized unterminated-record cases. Include a compatibility probe that records exact resolved Pi/Takomi/pi-subagents paths, versions, integrity, and supported commands without requiring model network calls.

Never copy credentials or real private messages into fixtures. Generate minimal synthetic v3 JSONL with branches, custom entries, compaction, labels, model/thinking changes, and tool messages.

## Verification
Run only the fixture and Pi adapter/provider test files. The harness must fail loudly when a capability is advertised but absent from the probed protocol.

## Definition of done
Future Pi upgrades produce an actionable compatibility failure rather than silent behavior drift. A synthetic/copied fixture is also prompted once, its new entry parent linkage is checked, it is restarted, Takomi custom-state restoration is checked, and the source checksum plus reproducible command transcript are retained as evidence.
