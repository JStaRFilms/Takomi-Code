# A09b: Plan explicit native steering and follow-up input

Read-only architect in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next, HEAD496f7f409d681be51c127325a134588b68963dfb. Read AGENTS, unslop, Effect reference, A09.plan.md, D01, B02/B05-B09a acceptance and R09a correction. User chose native queue controls first and continues work. No mode/global settings mutation, native patch or compaction is approved. Do not reset Genesis.

## Objective

Refine the first explicit native-input implementation packet using actual source. Reuse the current web/mobile composer send controls, prepared attachments and local draft guards. Native accepted steer/follow-up must remain distinct from local queued drafts, ordinary foreground input and outbox replay. Avoid a new visual system or separate invented chat dashboard.

## Source and decisions

Trace current PiAdapter sendTurn/requestRpc/input outcomes and B02 independent native starts, ProviderService, auth/ws and actual driver fixtures. Read native0.99.1 steer/follow_up handlers and SDK input hooks/skill-template expansion/image handling. Native commands reject registered slash commands; queued/handled is input disposition, not model completion. Direct queues do not start idle work, and a run can end while a handler awaits. Explain truthful outcome/UI behavior, not a promise that accepted input immediately starts a run.

Read web ChatView/ChatComposer/sendQueuedMessage/queuedMessageStore/composerDraftStore and native use-thread-composer-state/outbox drain/ThreadComposer/draft store/native revision guards. Identify the existing attachment preparation path that can safely support text/images/context in a specific authenticated submitPiQueuedInput RPC without recovering a process or inventing a thread.turn.start. Do not silently drop attachments. If a text-only first slice is necessary, specify honestly disabled attachment cases and a separately bounded follow-up, not a completed-parity claim.

Specify DTO input expected thread/instance/generation, steer|follow-up intent, existing input/attachment bounds and a request ID. Expected current owner/lease/version proof must survive all PRE-write awaits. Reuse R09a captured-validation pattern where appropriate, but don't treat a generation change AFTER native submission as definite rejection. Native write/ack timeout, transport cancellation or process replacement after bytes could mean outcome unknown. No automatic retry, reconnect/outbox replay or falsely safe resubmit. Bound any in-flight operation retention, prevent duplicate clicks and define native post-write outcome resolution without a request-ID history or generic gateway.

Follow correlation through malformed/wrong-type/late responses BEFORE logs/setters/runtime dispatch. Preserve stats-first and queue-read interception, rawqueue_update suppression and genuine B05 setters/input/model events. Submit must not log private queued text or emit fake durable turn/checkpoint/title. Read auth scope must deny it; operate scope plus exact owner is required.

Important history decision: ordinary queued user text is genuine input, but queue acceptance is not a T3 model turn. Explain how the user can see an accepted submission, how actual later native user-message/model events reconcile with existing T3 history, and which fidelity gap remains. Do not hide dropped input/history behind an ephemeral toast or fabricate a model response/turn. Use real native/T3 event semantics, not text matching. If authoritative history requires the later native-history slice, make that explicit and seek a meaningful decision rather than silently broadening B09b.

After a confirmed queued/handled result, consume only the original unchanged local text/attachments snapshot. Edits, navigation, native revision and attachment changes during await must preserve the current draft; no old-object overwrite or other-device mutation. Rejection/unknown keeps a recoverable local copy and no send loop. Actual native outcome handled may run independent work, so don't settle or retag that work.

## Deliverable and constraints

Return <=1400words inline with exact existing APIs/paths, narrow contract/ownership/outcome/history/image and UI decisions, meaningful controlled tests and any significant choice requiring approval. Parent persists A09b.plan.md and writes a self-contained writer packet. No writes/tests/installs/scripts/native execution/realCLI/session/auth/credentials/server/browser/build/live/canonical/global/git mutation/subdelegation. Source reads and fixture inspection only. No clear/list delivery/retry/bash/auth/session-tree/runtime-delivery scope unless a confirmed prerequisite is identified and reported.
