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

## Implementation evidence

- Pi 0.84.4 package and RPC declaration paths, versions, and SHA-256 values are resolved read-only from the configured binary; advertised operations are checked against declaration-probed discriminants.
- The B00 host probe now reports manifest-selected Takomi, Pi, and pi-subagents paths, exact versions, and package.json integrity rather than ambient candidates.
- Exact synthetic RPC/session fixtures cover slash-command source provenance, full model/usage/tool/compaction/retry records, branches, labels, custom state, and persisted tool results. Final fixture SHA-256 values are `f0be496b186de2b6a8133675038bd6402e580c4bc50297783087f9c5fcd02e72` (RPC) and `3d10c902bbcd5b757c5a172447f48027ed679c40da54c50b3336a3ca0be1b59b` (session).
- The public `SessionManager` fixture probe verifies append linkage, branch leaf versus append high-water state, reopen behavior, tree shape, and custom-state restoration in a temporary directory.
- Mock-peer waits have deadlines, exit/error rejection, stderr diagnostics, captured-child termination, and cleanup; PiAdapter process-path tests cover fragmented UTF-8, malformed/oversized records, EOF flush ordering, and replacement-generation safety.
- Focused server tests: 30 passed. B00 host tests: 12 passed. Server and host typechecks passed; server emitted only pre-existing Effect suggestions.
