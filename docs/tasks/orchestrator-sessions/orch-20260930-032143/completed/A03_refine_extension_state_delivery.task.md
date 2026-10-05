# A03: Resolve extension-state ownership and delivery against actual source

## Setup

Read-only architect. Explicit cwd `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`, baseline 1233584a8d. Read AGENTS.md, `.repos/effect-smol/LLMS.md`, A02.plan.md, D01.design.md and relevant narrow source sections. Use unslop. Return inline under 1400 words; parent persists your recommendation. No writes, tests/install/build/servers/browser/native session/extension/credential execution, commits or subdelegation. Do not read real auth/secret/session data.

## Objective

Turn A02's selected bounded ephemeral state design into a concrete, reviewable B05 backend/shared-runtime implementation packet. Resolve ownership/startup races and latest-state delivery before a writer changes code. Do not redesign the product or replace existing transport/state architecture.

## Actual source anchors

- Contracts providerRuntime.ts:203-218 already has optional providerInstanceId. Runtime UI setter native fields are documented in A02.
- PiAdapter eventBase at1678-1697 stamps options.instanceId and includes bounded raw native record ONLY when passed a message. New state must use no raw record. Context generation is numeric. Inspect context creation/registration, stdout reader, startSession/stopContext fences and relevant adapter tests, using offsets rather than dumping the entire large file.
- ProviderService Layers/Services, ProviderAdapterRegistry and ProviderInstanceRegistry manage live instances/session routes. Runtime ingestion has serialized worker, persisted read-model owner checks and progress paths. Inspect where route authority exists before native session.started and how old forwarders/events are retired.
- Existing ProviderAuthService is a snapshot-first owner-scoped stream pattern. ws.ts:427 onward makeBoundedDurableLiveStream drains upstream while overflow resynchronizes. Reuse an appropriate bounded/coalescing design, not durable widget activity replay.
- Shared runtime rpc/client.ts subscription method union, state/threadDetail.ts ScopedThreadRef atoms and connection supervision are the client patterns. Contracts rpc.ts/server.ts, RpcAuthorization and ws wiring must remain truthful for older servers/other providers.
- Known canonical read-only source is C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite. OAuth commands.ts:277-303 emits RPC string widget reports with one replacement key; usage/account metadata is distinct from oauth-flow.ts authorization URL/device-code notify. Read actual producer call sites narrowly to identify any NEW status/widget/editor secret exposure. Don't claim all generic UI strings are universally secret-safe. No source-suite changes here.

## Decisions needed

1. Specify the simplest correct source ownership path. A02 proposed typed begin/update/end runtime events routed before ingestion persistence. Verify old queued begin/update/end cannot reintroduce retired process state, including same-instance replacement, and startup widgets are admitted before persisted session.started. Identify the exact authoritative route/generation API. If actual source makes direct ephemeral service publication at the adapter boundary simpler/safer than runtime-event ingestion, explain the concrete reason and exact dependency wiring, not a speculative abstraction. Do not invent source APIs. Avoid storing widgets in durable events.
2. Specify snapshot-first atomic subscription and latest-only bounded slow-consumer behavior. No unbounded SubscriptionRef/PubSub snapshot queue hiding behind another bounded queue. Keep memory bounded by live contexts/subscribers, not all threads ever visited. Existing-key replacement/clear must still work at key capacity. Describe end/delete/reconnect cleanup and how old transport generations are ignored.
3. Provide exact minimal file groups for B05 contracts/normalizer/reducer/service/adapter/wire/shared client, with verification examples. Identify optional public support metadata needed to avoid new clients lying on older environments or non-Pi providers. Keep new UI rendering and draft actions out of B05.
4. Check producer privacy. Known private Vault responses/archive/one-use transfers must never enter snapshots/raw logging. If a known canonical widget/status/editor producer emits authorization secrets, state the exact blocker and smallest safe dependency instead of silently projecting it. Unmarked generic OAuth notify privacy is already a later task; do not broaden this into an auth redesign.

## Constraints

A02's required behavior remains: exact-key status/widget replace/clear; string arrays only; above/below-editor placement; runtime subtitle not manual/global window title; latest unsent editor suggestion, never automatic draft replacement/send. Shared proposed bounds:32 statuses,16 widgets,100 lines/widget,2KiB/line,16KiB/status, existing title4096 code points/16KiB, editor512KiB, aggregate status/widget/subtitle128KiB. Reject overlong keys without truncation/collisions. Unicode-safe text truncation and terminal escape removal, explicit bounded overflow/truncation, suppress identical updates. Same-generation turn settlement does not clear UI; end/replacement does. Authoritative environment scope comes from authenticated connection, not native payload.

No production/live/canonical/global mutation, native execution, accounts/auth credentials, deployment or source cleanup. The live checkout now has unrelated edits; never copy/merge them into this isolated baseline. File-based orchestration stays local.

## Completion and deliverable

A short implementable recommendation with exact owner APIs/lifecycle location, queue mechanism, file groups, focused proof and real privacy/architecture blockers. No tests/source changes or integrated proof claims. Parent chooses B05 scope and authors its complete packet before a single synchronous writer starts.
