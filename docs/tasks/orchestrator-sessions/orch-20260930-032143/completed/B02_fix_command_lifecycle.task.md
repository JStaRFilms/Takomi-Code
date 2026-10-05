# B02: Correct command completion without losing native agent work

## Agent setup

Working directory `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`, branch `feat/pi-parity-next`. Read root AGENTS.md, `.repos/effect-smol/LLMS.md`, this packet, master_plan.md, G01/G02 reports and D01.design.md section 1. Follow Build workflow and load unslop. You are the sole active writer. B01's two conformance files contain reviewed but uncommitted work; preserve them byte-for-byte. Native board access is unavailable; the parent owns file-based status, reviews and commits. No subdelegation or commits.

## Objective

Fix Pi 0.99.1 extension/input-handler commands that finish without a model run but leave a T3 turn marked running. Distinguish command acceptance/outcome from actual native agent execution, including commands that start independent work before or after their acknowledgement. Preserve at-most-one durable terminal transition and existing private Vault semantics.

## Prime source context

- `apps/server/src/provider/Layers/PiAdapter.ts`: PiSessionContext, sendTurn, prompt response handling, handleMessage, completeTurn, startSession/stopContext, request IDs, generation fencing, Vault prompt/error handling.
- `PiAdapter.test.ts`: process-path fake peer fixture, Deferred/Queue receipt wait helpers, Vault commands/UI/transfer tests and restart/superseded-generation tests.
- ProviderAdapter/ProviderService contracts and runtime ingestion/decider/projector handling of turn.started/turn.completed/session state. Check how unsolicited native runs and active-turn identity are represented; do not assume the projector supports reopening a completed turn.
- Canonical suite read-only `takomi-runtime/commands.ts`: `/takomi-status` only notifies; routing review calls pi.sendUserMessage and may start independent model work. No suite source changes in this slice.
- Installed Pi 0.99.1 docs `rpc.md`, `rpc-commands.md`, `json.md`; source `dist/modes/rpc/rpc-mode.js` and `dist/core/agent-session.js` for prompt disposition ordering, agent_start/agent_settled, extension_command_error/extension_error behavior and extension input-handler handling. Native docs must be read completely when used.

## Allowed files and boundaries

Prefer only PiAdapter.ts and PiAdapter.test.ts, including their existing fake-peer string fixture. Touch a focused ingestion/service test or minimal typed contract only if current runtime cannot correctly represent native work that starts independently; first establish that need from the source and report the exact decision in your output. No new general command bus/SDK host, widgets/severity UI, routing controls, queue product features, dependency changes, native installs or auth. Do not touch B01's conformance files or historical artifacts. No live sessions or private contents; use synthetic controlled peers.

## Behavioral requirements and test matrix

1. Idle general extension command returning handled with no run: original user submission is settled exactly once, session becomes usable, no fabricated assistant output or hanging indicator.
2. Input-handler-consumed non-slash prompt returning handled: same no-run settlement; do not restrict the fix to slash-name heuristics.
3. Handled command with native run already started BEFORE acknowledgement: preserve that run through its actual settlement; a successful command response cannot terminate it early.
4. Handled command whose independent native work starts AFTER acknowledgement: no ignored tools/text or orphaned turn. Correctly represent the new native run using supported canonical lifecycle; never reopen a terminal turn or emit duplicate terminal transitions. Derive ordering from native APIs, not an arbitrary grace-period sleep. Use authoritative state queries only where they really resolve a race.
5. Command issued during an existing run: settles its own submission without prematurely completing or replacing the existing run. Ordinary active-run prompt steering remains unchanged.
6. Started/queued dispositions: acknowledgement alone is not model completion; await actual native settlement. Duplicate/out-of-order acknowledgements must not create/finish unrelated turns.
7. Rejection/associated extension failure: report failed outcome rather than marking successful handled completion; use actual available correlation and do not blame an unrelated active command for an uncorrelated notice.
8. Stopped/replaced/superseded generations and late native responses: no resurrection, stale projection or double completion. Bound any new correlation collections and clear them on teardown.
9. Private Vault command/UI/export/import existing tests still pass. Never leak secret values into new correlation logs, runtime events or synthetic assistant text. Do not weaken one-use response fences.
10. Legacy responses without disposition preserve established behavior and private handling; document the unverified legacy general-command limit rather than infer unlimited compatibility. Current target is 0.99.1; do not widen version gates.

Use focused tests that traverse the real adapter process/runtime mapping. Wait on receipts/Deferreds/worker drains, not sleeps or polling. A negative absence assertion must follow an explicit controlled peer receipt/drain, not a timeout chosen to make it pass. Native settlement, not arbitrary response timing, is the source of truth.

## Implementation discipline

Start by demonstrating the no-run command regression in a failing focused test. Inspect both native lifecycle order and T3 ingestion before selecting state representation. Keep state as small as the actual necessary distinction; avoid a speculative framework. Any new helper should own a meaningful invariant rather than cast/forward. If new independent-run representation requires a broad architecture change beyond this slice, stop with that concrete blocker and an interface recommendation instead of silently widening scope.

## Verification

Run `vp test run apps/server/src/provider/Layers/PiAdapter.test.ts` first. Then the exact focused set from B01 if appropriate, plus only relevant ingestion/service tests changed for independent-run behavior. Run server typecheck, changed-file lint/format and git diff --check. Do not run repo-wide checks, build/release/client servers, or make private/native model calls. Record exact commands/counts/skips/failures; distinguish unchanged baseline lint from new diagnostics without suppressing either.

## Expected artifacts

- Narrow source/tests implementing the proven lifecycle correction.
- `docs/tasks/orchestrator-sessions/orch-20260930-032143/B02.report.md` with root cause, state/ordering rationale, explicit change scope, tests, legacy limits, private handling and any blocker.
- Inline changed-file/result summary. Parent independently reviews and commits accepted owned files only.

## Definition of done and review

Required matrix is covered by meaningful focused adapter tests, actual command completion and native-run behavior are correct, no terminal re-open/double settlement occurs, Vault/generation behavior survives, typecheck/format and all changed-code lint pass, and no blocking regression remains. Existing unrelated baseline errors must be reported explicitly, not fixed or silently waived. Real-client commands will still need integrated verification later; unit tests do not complete the full parity ledger.

Depends on G01/G02/D01. B01 native-test behavior is green but its lint acceptance remains open; this independent slice may proceed without changing that work. Reviewer checks the state machine and meaningful tests. Revisions reuse this writer's conversation.
