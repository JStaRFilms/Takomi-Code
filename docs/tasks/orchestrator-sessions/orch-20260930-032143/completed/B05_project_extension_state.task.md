# B05: Deliver bounded ephemeral extension state and reconnect transport

## Setup

Sole writer in `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`, branch feat/pi-parity-next, baseline1233584a8d. Follow Build/unslop. Read applicable AGENTS.md and `.repos/effect-smol/LLMS.md` before Effect changes. Read narrow source sections/function outlines, not entire giant files.

Prime context under docs/tasks/orchestrator-sessions/orch-20260930-032143: A03.plan.md, A02.plan.md, D01.design.md, B04.acceptance.md, B01.acceptance.md, master_plan.md. Read existing docs/features/takomi-pi-provider.md. Read installed native Pi rpc-extension-ui.md and linked relevant docs completely, and actual request type/producer in C:/Users/johno/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent. Actual source wins over proposed API names.

## Objective

Pi's supported setStatus, string-array setWidget, setTitle and set_editor_text become bounded current state that an authorized reconnecting client can recover. Capture startup state before persisted session.started. Old processes/adapters cannot resurrect or clear replacement state. Do not journal widget refreshes or mutate drafts/thread titles. B06/B07 add UI rendering and explicit local editor actions later.

## Selected architecture

A03 selects direct ephemeral publication at the Pi adapter boundary, replacing A02's proposed runtime-event/ingestion route. Native runtime queues are unbounded and persisted routing arrives after startup. Keep B04 durable notifications unchanged. No new runtime-event union or ingestion/persistence dispatch for extension state.

Introduce one shared server service with scoped publisher ownership and per-process leases. Proposed names in A03 are NOT existing source APIs. Associate the publisher with the exact adapter identity resolved by the registry, including any existing wrappers. ProviderService alone reserves ownership for a start, checking the currently registered adapter and serializing competing starts for that thread. A non-Pi replacement invalidates old Pi UI too.

After Pi sessions.set and before stdout forks, open a lease with an opaque service-issued generation. Existing isLiveContext plus current lease fence every write. Close the matching lease on fence/stop/natural exit after stdout drain/failed startup; retire publisher on adapter scope finalization. Late old open/write/end cannot reacquire or clear a new owner. Failed startup leaves inactive empty state. Verified adoption of an existing live context must RETAIN its lease, including recovery. Do not blindly wipe it merely because startSession returns that existing context. Read actual normal/recovery call paths before implementing reservation semantics.

Thread deletion invalidates ownership before stop cleanup, even when stopping fails. A pending start's old reservation cannot reopen after deletion. Snapshot setup verifies thread existence using existing projection queries. Avoid native-model lifecycle changes unrelated to UI ownership.

The service is below ProviderInstanceRegistryHydrationLive in the shared server layer graph and available to PiDriver/factories, ProviderService, deletion and ws without a cycle. Verify consumers share ONE instance. Add only necessary real dependency/test-fixture wiring; no silent noop/default fallback solely to avoid fixture changes. If correct wiring fans out materially beyond the listed groups, report concrete conflict before expanding.

## Snapshot and mutation rules

Typed contract contains thread, owning instance, opaque process generation, revision, active/inactive state, update time, exact-key statuses/widgets with placement, nullable runtime subtitle and nullable latest editor suggestion ID/text, plus truncation/overflow. Environment is the authenticated connection scope. No PID, reservation capability, raw native record, private answer/archive or credentials in DTO.

- Shared bounds:32 statuses,16 widgets,100 lines/widget,2KiB/line,16KiB/status, title4096 code points/16KiB, editor512KiB and aggregate status/widget/subtitle128KiB. Use UTF-8 accounting, Unicode-safe truncation and an explicit bounded overflow/truncation signal. Check serialized transport bounds too; do not assume decoded character counts bound wire bytes.
- Keys preserve exact identity. Reject empty/overlong/invalid keys without trimming/truncating into collisions. Existing-key replacement/clear remains possible at capacity.
- Missing statusText/widgetLines clears. Empty strings/arrays are valid. Placement defaults aboveEditor; preserve belowEditor. Accept string arrays, not arbitrary widget factories/objects.
- Strip terminal escapes/control sequences while preserving meaningful line breaks. Plain text only; no link opening or OS notifications.
- Suppress identical normalized updates. A new editor setter gets a generation-scoped suggestion ID; it is never applied or sent here.
- Model turn completion does not clear same-process state. Replacement/end erases it. Runtime subtitle never renames the manual/native thread, global Electron window or app.
- Recognize setter methods before interactive request-ID validation, because fire-and-forget setters must not depend on a dialog ID. Intercept before raw native logging and use no raw runtime-event payload.

## Atomic bounded subscription

Complete replacement snapshots, not history replay. Follow A03's critical-section design: scoped subscriber attached atomically with initial immutable snapshot; capacity-one dropping queue holds WAKE TOKENS only. Emit captured initial state first; later take a token and read latest state under the same lock used for mutation/wake publication. Repeated writes coalesce; a write after capture queues another wake. No unbounded PubSub/SubscriptionRef snapshot queue upstream.

Memory is bounded by live process state and active subscribers, not all visited threads. End clears content/wakes inactive; subscriber finalization removes subscriber-only records. Delete sends empty terminal state/completes. Keep end-to-end RPC delivery bounded under a slow consumer using existing transport behavior, not polling/sleeps or a second hidden snapshot queue.

Expose a thread-only streaming RPC using observeRpcStream and AuthOrchestrationReadScope. Resolve instance/process ownership server-side. Optional explicit support metadata in ServerProviderCapabilities is advertised for implemented Pi support; absent means legacy/unknown, not supported. Other providers/older servers do not falsely advertise this feature.

Shared client-runtime adds the typed subscription and environment/thread-scoped state using existing ScopedThreadRef/atom patterns and zero idle TTL. Use subscribeDynamicWithSession/tagged-current supervisor identity to reject stale connection callbacks. Distinguish unsupported, disconnected/stale and empty current state. No UI rendering/draft mutation yet. Update required existing web/mobile RPC glue only if the shared API needs it.

## Source groups

Contracts rpc.ts/server.ts/capability schema/exports and bounded snapshot schema/tests; new server-local normalizer/reducer/service/layer/tests; PiAdapter.ts/tests; Drivers/PiDriver.ts and tests; ProviderService.ts/tests; ThreadDeletionReactor and focused tests; server.ts layer wiring; PiProvider.ts capability wiring/tests; ws.ts and RpcAuthorization/tests; shared rpc/client/state/connection integration and focused tests; existing feature doc for the ephemeral data flow/reason. No database migration, runtime-event ingestion change, new dependency or suite/global code change.

## Tests and checks

Use red-first meaningful behavior where current omissions can be exercised. Deterministic Deferred/barrier/drain coordination, no sleeps/polling. Cover:

1. Real factory/service/controlled Pi process startup widget before session.started, idle updates, normal/live recovery adoption, failed start, same-instance reconstruction, cross-instance/non-Pi switch, scope finalization, deletion during startup and late old open/write/end. Do not substitute callback-wiring assertions.
2. Exact keys/replace/clear/empty/placement, capacity replacement/clear, ANSI/control removal, Unicode/UTF-8/aggregate/wire limits, overflow signal and identical suppression. Private Vault input/transfer values never enter snapshots/logs; unrelated model run/turn and manual names unchanged.
3. Atomic initial snapshot vs update, slow-consumer coalescing, cleanup/terminal delete, bounded retained state and no durable dispatch.
4. Auth denial/missing thread, truthful Pi/legacy/non-Pi capability, shared reconnect/session/environment fences and inactive vs disconnected vs unsupported states.

Run explicit changed/relevant test files, affected package typechecks only, owned lint/format/diff. No repo-wide checks. Hermetic existing test fixtures are allowed; no standalone dev server, browser, Metro, install, native/release build or real native session/extension/credential/account operations. Native SDK fixture proof already exists and need not be repeated for this slice unless directly required.

## Preservation and privacy

Live checkout has unrelated edits; do not copy, merge, edit or reset it. Canonical suite/source/user-global install unchanged. No push/PR/deploy. B01's inherited lint exception applies ONLY to its unchanged two files, not new diagnostics. Preserve all reviewed commits and owned local plans. No commits or subdelegation by writer.

A03 inspected canonical report producers and found no new explicit widget/editor credential blocker; report-ui sanitizes recognizable secrets. This is not universal string safety. Ordinary OAuth authorization URL/device-code notify is a separate known open producer task; do not expand this slice into auth redesign or claim secrets universally safe. Never read actual auth/secret stores or values.

## Completion and artifacts

Full backend/shared-state path works with focused checks, actual lifecycle/capability/ownership proof and no unresolved confirmed regression. B06/B07 remain explicitly pending. Write ROOT B05.report.md with exact owned files, ownership/dependency choices, red-first/final commands/counts, bounds/backpressure proof and limitations. Return synchronously. Parent runs one independent focused review, routes confirmed corrections through this conversation and stages only accepted owned files for one commit.

If an architecture requirement cannot be met with actual APIs, report the exact conflict rather than silently dropping generation/privacy/backpressure checks or inventing control proof.
