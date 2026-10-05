# R05: Review bounded native extension state and its actual ownership path

## Setup

Read-only reviewer, explicit cwd C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next, baseline1233584a8d. Model Sol High. Read AGENTS.md, .repos/effect-smol/LLMS.md, A03.plan.md, A02.plan.md, B05.scope-revision.md and B05.report.md in this session. Use unslop. No writes/commits/subdelegation/install/native session/auth data/dev servers/browser/release build. Existing hermetic tests are allowed. Return inline; parent persists exact R05.review.md.

## Objective and scope

One focused correctness/security/regression pass on the 34 owned source/test/package/doc files listed in B05.report.md. No style/future-proofing cleanup. B06/B07 UI rendering/draft actions are intentionally not implemented. Read actual diff and new source; don't assume the writer's report proves properties.

Selected architecture is direct adapter-boundary ephemeral publication, not runtime-event ingestion. Required new controller and fixture graphs are approved by user. Verify concrete factory/credential-guard wrapper association/current registry identity, one service instance, reservation/process lease authority, startup before persisted routing, live adoption, failed startup/binding, same-instance/cross-provider replacement, deletion races/terminal subscribers, retired/old open/write/end and scope/natural-exit cleanup. Existing native model/turn/session flows must remain correct.

## Review checkpoints

- Publisher/reservation/lease checks cannot be bypassed by old contexts or queued async starts. Failed old start/close cannot invalidate a replacement. Recovery/live adoption preserves lease. Per-thread start serialization doesn't deadlock or leave ever-visited-thread locks. New service layer graph shares identity across factory/start/deletion/RPC, no hidden default/noop.
- Atomic initial snapshot and subsequent latest reads. Capacity-one wake-token queues only; no snapshot backlog or unbounded upstream. Check end-to-end RPC flow control, subscription/drop/end/delete cleanup, and retained maps including association/locks/reservations. No historical tombstone/cache growth after threads/scopes end.
- Exact-key replace/clear/empty/default placement/invalid arrays; Unicode/terminal controls, individual/aggregate/serialized bounds. Controller doesn't retain mutable references that alter a captured snapshot. Overflow/truncation remains bounded and honest. Identical updates suppressed appropriately.
- Handler admits fire-and-forget setters before request-ID/raw-log path. No private Vault answer/transfer/archive/raw native payload in state. Native title stays runtime subtitle, no manual/native/global rename or automatic draft mutation/send. B04/B02 durable/lifecycle paths unchanged. Do not claim universally secret-safe generic UI strings; ordinary OAuth notify owner contract remains later.
- RPC requires orchestration-read and existing nondeleted thread, authenticated environment scope, no caller-controlled instance/process/environment. Optional Pi support marker is true only for the implemented path; old/unknown/non-Pi unsupported behavior is truthful.
- Shared atom uses ScopedThreadRef and current tagged supervisor session, rejects old snapshots AND old error/finalizer callbacks, clears inactive generations, treats disconnect/stale separately, and cleans idle state. No older-environment unguarded RPC calls or consumer type regressions.
- Required tests exercise behavior, not callback wiring. Verify focused checks/source claims, no weakened valid tests/suppression/production timeout changes.

## Baseline failures and warnings

Builder reported 328 selected passes and TWO failures in Claude reset fixtures. Review exact .plans/b05-regression.txt and B05.report.md details. Tests are `refreshes Claude usage after redeeming a reset` and `reports Claude's answer when a claim changed nothing and the re-probe fails`; pre-claim expected usage100/receivedundefined after PlatformError with HostProcessPlatform forced linux on Windows. Builder says corrected HEAD-copy repro matches. Independently inspect unchanged baseline source/harness and reproduction log to confirm actual attribution; failed setup attempts aren't proof. Do not fix unrelated fixtures or waive failures; parent/user decide acceptance. Report any B05 contribution if found.

Owned lint exits zero with25 unchanged warnings in server.test.ts; builder says separate HEAD-copy diff reproduced exact lines/rules/messages after142 inserted lines. Independently verify no new warning/error/suppression. B01's exception is not applicable.

Run narrow discriminating tests/checks as needed, not repo-wide. Three affected package typechecks were builder-reported passes; check whether public RPC/package export changes require web/mobile consumer typechecks too and say why. No integrated-client claim.

## Deliverable and completion

Inline report with confirmed blockers (paths/lines/repro/minimal correction), reviewed test commands/results, independently supported baseline attribution and residual limits. If source is sound, approve requested B05 scope conditional only on actual existing baseline failures, not full parity/client verification. Parent uses same coder conversation for confirmed corrections and then records acceptance/commit after relevant gates. No recursive style review.
