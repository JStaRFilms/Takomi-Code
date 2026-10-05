# B01: Restore a truthful Pi compatibility-test baseline

## Agent setup

Working directory: `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`, branch `feat/pi-parity-next`. Read root AGENTS.md, this packet, session master_plan.md, G01.report.md, G02.report.md, and completion_strategy.md's first Build scope. Follow Build workflow and load unslop for any human-facing text. Read relevant source and tests before editing. For any Effect implementation, first read `.repos/effect-smol/LLMS.md`; this slice should not require provider behavior changes.

The parent authorizes this bounded code slice. You are the sole code writer in this checkout. D01 concurrently returns design findings inline and cannot write. Native board tools are unavailable in subprocesses; use this file-based packet, and leave status/commit operations to the parent. No subdelegation or commits. Return your conversation identifier if available for corrections.

## Objective

Separate frozen Pi 0.84.4 protocol fixtures from installed-native Pi 0.99.1 integration expectations, preserve meaningful compatibility assertions, and reproduce a green focused baseline without changing provider behavior.

## Prime source context

- `apps/server/src/provider/Layers/PiProtocolConformance.test.ts`, especially installed declaration and SessionManager tests around lines 375-481.
- `PiProtocolConformance.ts`: `probePiProtocol`, `assertPiRpcOperations`, fixture validation and package provenance.
- `apps/server/src/provider/testFixtures/pi-v0.84.4-rpc.json`, `pi-v0.84.4-session.v3.jsonl`, `piMockPeer.mjs`, `piSessionManagerConformance.mjs`.
- `PiProvider.ts`: actual advertised RPC operations.
- `packages/takomi-pi-host/src/sessionCatalog.ts` version gate and `docs/operations/pi-compatibility.md`.
- Public installed metadata/docs/declarations at `C:/Users/johno/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent`; current target is 0.99.1. Read full relevant native .md pages when needed.

## Allowed changes

Prefer changing the conformance test. Add a minimal, clearly attributed 0.99.1 declaration expectation or fixture only if needed; preserve old fixture provenance and contents. A small conformance helper is allowed only if necessary for separation and tested behavior. Do not modify PiAdapter, runtime capability declarations, catalog allowlist, shared contracts, suite source, dependencies, generic UI or unrelated tests.

Do not turn the catalog allowlist into proof of all native behavior. Do not accept arbitrary unknown versions, delete assertions, add sleeps/timeouts without an observed cause, or disguise a native skip as verification success. No native install, global agent changes, live session access, auth, model invocation, servers, browsers or release builds. Disposable test copies of the synthetic fixture are authorized; their source checksum must stay unchanged.

## Requirements

- The synthetic framing/event replay tests remain attributed to unchanged 0.84.4 fixtures.
- Installed-native checks identify the actual configured/resolved package version/path and preserve metadata/declaration hash evidence and operation-union checking. Current supported target 0.99.1 must not fail merely because the replay fixture is old.
- Keep deliberate missing-method rejection and the distinction between slash-command discovery and RPC operation availability.
- If more than one native target is supported, use explicit version-attributed expectations rather than an unbounded range or tautological assertion against itself. Preserve 0.84.4 evidence; unsupported target behavior must be explicit.
- Preserve public SessionManager open/append/reopen proof on disposable copies, custom-entry/branch state and stable source checksums. The eight-file run previously had a fixture failure that passed standalone. Investigate only if it repeats and capture actual error before proposing a cause.
- State what the checks prove and what they do not prove. No claim of prompted model continuation, whole-provider compatibility or client verification from these tests.

## Verification

Run standalone first:
`vp test run apps/server/src/provider/Layers/PiProtocolConformance.test.ts`

Then reproduce the exact original focused set:
`vp test run apps/server/src/provider/Layers/PiAdapter.test.ts apps/server/src/provider/Layers/PiProtocolConformance.test.ts apps/server/src/provider/Layers/PiResources.test.ts apps/server/src/provider/Layers/PiProvider.test.ts apps/server/src/provider/Layers/PiSessionAttach.test.ts apps/server/src/provider/Layers/PiSessionSync.test.ts apps/server/src/provider/Layers/PiHistoryHydration.test.ts apps/web/src/components/piContinue/piContinue.logic.test.ts`

Run changed-file lint/format, `vp run --filter t3 typecheck` for the server scope if the test types change, and `git diff --check`. No repo-wide tests/typecheck/check. Record exact commands, counts, skips and failures. Keep failures open; do not mark the slice complete if verification is red.

## Expected artifacts

- Narrow source/test diff within the allowed slice.
- `docs/tasks/orchestrator-sessions/orch-20260930-032143/B01.report.md` with root cause, per-file change rationale, exact checks/results, remaining blockers and review notes.
- An inline return naming changed files and evidence. No source commit; parent commits after independent review.

## Definition of done

Frozen/native attribution is correct, nontrivial compatibility assertions survive, both focused runs and relevant type/lint/format checks pass, disposable source stays untouched, unrelated work is preserved, and the report exists. Any reproducible native SDK issue stays an explicit blocker, not a weakened test.

## Dependencies and review

Depends on completed G01/G02 evidence. This is a non-UI foundation independent of D01's pending interaction design. A read-only reviewer checks spec fidelity and assertions before the parent commits. Return verified defects to this same conversation, not a new implementer.
