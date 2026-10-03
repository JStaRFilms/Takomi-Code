# B09 — Complete prompting, queue, compaction, retry, and bash controls

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B01, B03

## Upstream reuse gate
Before implementation, read `Upstream_Strategy_and_Resilience_Addendum.md` and compare the task against upstream PR #7211 (`upstream/pr-7211`). Reuse or contribute focused upstream-safe work where architectures align; do not duplicate completed behavior, import Takomi into generic Pi code, or cherry-pick the incompatible provider stack wholesale.

## Objective
Map the non-terminal behavioral controls already available in Pi RPC into typed T3 commands and state.

## Implement
- Steering and follow-up submission with visible queue identity/order.
- Steering/follow-up delivery-mode settings.
- Clear queue and dequeue-to-composer equivalent where possible.
- Escape-equivalent semantics: clear queued work before abort.
- Manual compact, auto-compaction setting/status, compaction failure.
- Auto-retry status/settings and abort retry.
- Direct bash request/update/result and Pi's session-wide `abort_bash` as an explicitly host-scoped advanced action; never label it per-command cancellation.
- Session name/stats and last-assistant-text where useful.

Avoid pretending terminal editor behaviors (`@` completion, clipboard paste-collapse, external editor) are provider controls; map them through existing T3 composer/file features.

## Tests
Queue while streaming, steering order, follow-up after settlement, clear+abort, client reconnect versus Pi-process restart versus T3-server restart, explicit queue-loss behavior across process death, compaction success/failure, retry abort, concurrent bash IDs, session-wide bash abort, authorization scope, and unsupported capability gating.

## Definition of done
Every advertised control has deterministic state, cancellation, and failure behavior across reconnects; no command is implemented by terminal keystroke simulation.
