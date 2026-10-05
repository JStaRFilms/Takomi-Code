# B09b: Submit explicit native steering and follow-up input

## Agent setup

You are the sole coder in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next on feat/pi-parity-next. Baseline is496f7f409d681be51c127325a134588b68963dfb. The index and tracked tree are clean; orchestration plans are untracked. Recheck ownership before mutations. No staging or commit by the coder.

Follow Build, not Genesis. Read AGENTS and more-specific instructions, unslop, .repos/effect-smol/LLMS.md and relevant native markdown completely. Prime context is this packet plus A09b.decisions.md, A09b.plan.md, A09.plan.md, D01.design.md, B02/B05/B06/B07/B08b/B09a acceptance and R09a.followup.md in this session. Read actual source and tests before implementation. Global native references are read-only. Recheck installed version and captured launch-version behavior without executing a real native session.

## Objective and approved scope

Deliver explicit native steer and follow-up actions across web, inherited desktop and mobile using the existing composer controls and timeline. The user approved labeled authored-submission history entries rather than ordinary user-message rows. Full text, image, file and structured-context support is approved now. Do not downgrade to text-only or silently drop composer content. Native acceptance must not create a fake model turn.

Use one implementation pass and one focused review. If storage or native constraints force a material design change, stop and report it rather than inventing a larger framework.

## Typed history and persistence

Add a feature-specific typed entry with request/thread/instance/process-generation identity, steer or follow-up intent, original authored text, normalized ChatAttachment references, optional message context, creation/update time and outcome. Outcomes are unconfirmed, queued, handled, not-submitted, rejected and unknown. Public reasons are bounded allowlisted codes. Original text and uploaded references are genuine GUI-authored history. Do not persist expanded host-path prompts, inline base64, raw native errors or extension-owned queue contents.

Use feature-specific server-only record/resolve commands and matching events. Record is the live execution intent; resolve never starts execution. Project to one stable activity identity derived from thread/request with kind pi.input-submission and null turnId. Initial outcome is unconfirmed. Updates preserve immutable content, owner, creation time and original timeline sequence. Only unconfirmed resolves; conflicting terminal resolutions fail rather than rewrite history.

Do NOT use thread.message.user.append. The architect confirmed that it changes latest-user timestamps, settled/snooze state, other-device send acknowledgments, response grouping and PiSessionSync text matching. deferredTurn does not survive hydration. This submission row must not become a normal user-message boundary, fake turn/checkpoint, title input, spinner or native-consumption claim.

Reuse existing ProjectionThreadActivities payload_json upsert, projector and shared reducer replacement by activity ID. A direct typed lookup by thread/stable activity ID/exact kind must drive durable deduplication and resolution through OrchestrationEngine before the pure decider. Startup snapshots omit activities and running command snapshots retain500, so decider array searches are not sufficient. Resolution emits the complete updated entry and original sequence. Keep original createdAt so paginated history rows remain in place with their current status. Do not pin all entries or depend on scanning separate activity pages.

Extend ProjectionPipeline attachment retention through revert/pruning/bootstrap cleanup for these entries. Preserve thread deletion cleanup. No SQL table/migration is expected from the inspected storage. Stop before changing real data or introducing a necessary new schema without explaining it. Update the existing feature document for this approved persistent data flow and usage, not a new file catalog.

## Operate RPC and durable delivery

Add provider.submitPiQueuedInput with requestId, threadId, expected owning instance and opaque generation, steer|follow-up intent, original text, existing upload/attachment union and optional context. Operate scope is required; read-only scope denies it. Return request identity and recorded sequence to acknowledge durable recording, not native acceptance. Actual status follows existing authenticated thread events.

Use deterministic command identity and durable command receipts. Duplicate requests return the original entry/receipt without another execution event. Reused identity with different immutable submitted content conflicts. Ensure duplicate normalization cannot leave new claimed copies or invalidate the original entry's references. Never replay on reconnect, outbox drain, provider recovery or startup.

Preflight verifies existing thread and current supported owner before recording. The record event enters ProviderCommandReactor's existing hot stream, not replay or bootstrap history. Use current worker/drain architecture. Bound in-flight work and reject competing input rather than another native send queue or unbounded child fibers. Add a settled receipt only after resolution persistence for controlled test synchronization. Receipts are not the user-visible completion authority.

## Exact ownership and submission uncertainty

The original expected instance/generation and captured native0.99.1 support are authoritative. Capture original binding, exact wrapper, context, process and B05 lease. Finish preparation, routing, thread and liveness awaits before the final R09a-style captured check. Immediately before admission to that captured context's stdin queue, synchronously recheck local context identity and exact current lease. Register the correlated Deferred before admission. No awaited clock/schema/filesystem/routing operation after the final local checks. Never validate or submit to a replacement owner.

Call native steer or follow_up, never sendTurn or fake thread.turn.start. Do not recover/start a provider, change model/thinking/settings, create pendingPrompts, or settle independent model work.

Admission is the conservative uncertainty boundary. Queue.offer does not prove bytes reached native stdin. After admission, write failure, timeout, cancellation, process replacement or lost transport is unknown unless a valid correlated acknowledgment already established the outcome. A later owner change cannot turn known queued/handled into definite not-submission. Resolution persists once. Persistence failure leaves unconfirmed and must not trigger replay.

Use one pending native-input slot per context and the existing30-second acknowledgment deadline. No indefinite detached waiter, historical request-ID tombstones, automatic retry or reconnect replay. queued means acceptance, not current membership or imminent execution. handled means input hooks consumed it, not that independent work completed. Direct native queueing does not start idle work; a run can end while hooks await. The UI must say this truthfully.

## Existing attachments and context

Extract the current Normalizer attachment block narrowly. Preserve input/count/byte limits, duplicate-ID handling, upload claims, size/type validation, inline-image decoding, context-ID remapping and cleanup. Ordinary turn/input-response normalization must use the same extraction with unchanged behavior. Do not create a fake turn command to gain normalization.

Reuse web start/await/get uploaded-attachment preparation and mobile prepareTurnAttachments. Reuse projectComposerContextForProvider. Extract current ProviderService provider-text preparation, including file attachment path instructions and captured accessibility data, without losing existing semantics. Host paths are transient native transport only. Enforce authored and expanded-input bounds.

PiAdapter reads normalized images and sends native image blocks. Native direct queueing skips foreground resizing/normalization. Current Pi model declarations do not advertise image support and hooks may change routing, so do not invent client support guarantees or discard images. Report actual outcomes. All original and latest local attachment/context state must remain recoverable after rejection or unknown outcomes.

## Privacy and lifecycle

Preserve stats-first, then queue-state ID interception. Add a unique t3-pi-input namespace before setters, logging and generic dispatch regardless of claimed type/command. Validate exact ID/type/command/success/disposition. Malformed acknowledgments mean unknown. Native error text can echo private input and must not enter public reasons/logs. Discard unowned/late records without retained ID history. Direct-input response fallbacks must not leak. Keep raw queue_update suppression and the JSONL ceiling unchanged.

Genuine B05 setters, extension questions and independent agent_start/model events still work. Queue outcomes must not retag originating turns, settle B02 independent work or fabricate assistant/tool/checkpoint activity.

## Actual clients and draft safety

Add small feature-specific submission rows to the existing web/mobile timeline. Reuse plaintext/context/attachment previews and current UI components. Show intent, recoverable authored content and status. Unknown/unconfirmed has no endless model spinner or automatic Retry. Any explicit resubmission warns it may duplicate native work; do not add unrequested recovery tooling.

Use actual web ChatView/ChatComposer and native use-thread-composer-state/ThreadComposer paths, not a disconnected wrapper. Desktop inherits web. Current-owner capability precedes future selected model. The composer actions, keyboard/palette entrypoints where applicable, existing queues and mobile outbox need explicit decisions. Ordinary Send/alternate-send, Settings defaults, local waiting drafts and outbox behavior stay unchanged.

Capture originating draft/editor identity and revision, text, attachment/context state, route, owner/generation and transport. After confirmed queued/handled, consume only the unchanged originating snapshot. B07's actual editor/native-revision guards apply. Concurrent edits, attachments, navigation, disconnect/owner replacement and away-and-back must not clear a newer draft or write another device. Rejected/unknown keeps recoverable content and never enters automatic sending. Store settlement can arrive from another device; it must not consume that device's draft.

## Verification

Use actual controlled driver/registry/service and HTTP/WebSocket seams. Deferred barriers and worker drains, no sleeps/polling. Cover durable receipt deduplication beyond500activities, startup non-replay, conflicting IDs, cross-page resolution/stable order; upload claims/context remapping/cleanup/inline images/files/limits/revert retention; each pre-admission ownership await; post-admission timeout/cancel/replacement unknown; malformed-type/late privacy; native input hooks/idle acceptance/independent starts; unchanged settled/snooze/latest-user/ordinary-send/native-sync behavior. Exercise actual draft mutations and feature rows, not static-markup prop assertions. Verify local queue and native outbox are not rerouted.

Run focused relevant tests, affected contracts/client-runtime/server/web/mobile types and exact owned lint/format/diff with original deadlines and caps. Do not count interrupted calls as passes. Attribute existing diagnostics against exact HEAD spans; no new baseline waivers or suppressions. Existing recorded Claude fixture and B01 exceptions do not authorize new failures.

## Deliverables and boundaries

Write B09b.report.md with exact owned paths, architecture decisions, commands/results, corrected or excluded failures, privacy/ownership/history/attachment/draft evidence and genuine limitations. Put exact source/test/doc ownership in .plans/b09b-owned.json. Reports/plans remain uncommitted. Parent alone stages/commits owned paths after one focused reviewer; confirmed corrections return to this same conversation.

No dependency/install/prepare/release/native builds, dev servers/Metro/browsers/computer use, real CLI/session/auth/credentials, live/canonical/global mutation, reset/stash/discard, whole-repository checks, subdelegation or git staging/commit/push/PR. Disposable fixture I/O/process/HTTPWS tests are allowed. Do not claim installed-device, real remote/two-device/CLI or full-parity proof.

Excluded: queue-list delivery, clear/held recovery, mode/global settings writes, manual compaction/native patches, retry/bash/auth/session-tree/runtime delivery. B08b's analogous post-read shape is an unconfirmed separate finding, not an automatic cleanup task.

## Writer completion checkpoint

Implementation and controlled verification are complete across web, inherited desktop and mobile. Current source and evidence are documented in `B09b.report.md`, `B09b.recovery2.md` and `.plans/b09b-owned.json`. There are 888 distinct passing focused tests; five current affected typechecks and exact-owned lint/format/diff checks passed. The index is empty and HEAD is unchanged.

R09b reviewed the integrated implementation and confirmed one blocker, an unbounded local confirmation wait after resolution persistence fails. That correction is implemented and documented in `B09b.revision-report.md`, with red-first proof, 15 new clock/lifecycle cases, 152 current focused passes and five affected sequential typechecks. Ready for the same reviewer's original reproduction and focused follow-up, not another broad implementation/review or a writer-owned commit.

The unchanged reactor question-no-longer-pending failure independently reproduces against HEAD tests and relevant HEAD production code. R09b verified the isolation and the user accepted only this exact baseline fixture. Its full-file failure and explicit passing 73-test selection remain separate evidence. No assertion rewrite, source skip or general waiver was added. Real native/device/remote proof remains unauthorized and unclaimed.
