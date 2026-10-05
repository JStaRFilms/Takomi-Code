# R02: Review command submission and native-run lifecycle

## Agent setup

Read-only reviewer in `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`. Read root AGENTS.md, B02 packet/report, D01 section 1, actual owned-file diff against HEAD and relevant Pi 0.99.1 lifecycle/source plus T3 ingestion. Load unslop. B01 conformance changes are separate and not part of this review. No edits/commits/subdelegation/installs/browsers/live-session access or broad checks.

## Objective and owned scope

Review `PiAdapter.ts`, `PiAdapter.test.ts`, and `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts` for the exact B02 matrix. Verify command-only consumed/handled behavior, independent native work beginning before or after response, native work finishing before the handler acknowledgement, command during active run, rejection/associated failure versus uncorrelated notices, queued/started, duplicate/stale responses, bounded correlation state, teardown and Vault/privacy safety.

A new native run needs a fresh canonical turn ID if the submission already closed. Check projector/session activeTurnId/readThread/ProviderService paths, not just emitted events. An ingestion test must prove actual late native model output persists and active/terminal state is correct; trivial callback-wiring tests are not enough. Verify tests wait for explicit peer receipt/drain rather than sleeps or time-based absence.

## Required distinction

Handled is submission disposition, not a guarantee of native inactivity. Original submission outcome and model-run settlement must remain truthful if their order differs. Do not require a running model to fail just because an unrelated command fails. Determine whether late command errors and malformed dispositions can strand or mislabel work. Preserve exactly one durable terminal transition, no reopening IDs and no ignored late native run output.

## Evidence and definition of done

Builder reports red-first failures, 79 adapter tests, 135 across the exact eight-file set, 93 ingestion tests, server typecheck, owned-file lint/format/diff green and preserved B01 hashes. Independently inspect and rerun the narrowest meaningful checks as needed; record exactly what you did versus builder evidence. Return confirmed defects or explicitly no blocking findings under 1400 words. Skip style/speculative criticism and unchanged baseline debt. Expected artifact is inline focused review; parent persists it. No client or full-parity claim from adapter tests.
