# B08b: Read native Pi session statistics

## Setup

Sole synchronous coder in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next, feat/pi-parity-next. Baseline45f9b7902f7648b569a7c0548deac2ed981babd2, tracked clean and empty index before launch. Only this session's plans are untracked. Read AGENTS.md, unslop, .repos/effect-smol/LLMS.md, A08.plan.md including its second report correcting the first, G03, D01, B05-B07 acceptance and actual source. Do not reset Genesis or register a native board in another checkout.

## Objective

Complete request-driven, authenticated native Pi session statistics across web, desktop and native mobile. Reuse existing context details, menus, palette, native sheets and components. Add only small missing feature controls, not a dashboard or new visual language. Stats are read-only and must not start or recover a stopped provider.

## Hard boundary: compaction is not part of this implementation

A08 established that stock get_state followed by compact cannot guarantee idle-only behavior. Native compact aborts independent work, and adapter reservations do not close the child-process race. Do NOT add compact/abort controls or send /compact/native compact, fake turns, checkpoints or any new compaction command. Manual compaction remains blocked pending a separately approved native atomic-ownership change. Do not modify installed Pi or canonical suite. Stats do not need a mutation receipt or native runtime patch.

## Source and minimal implementation

Read packages/contracts/src/provider.ts, rpc.ts, server.ts; server provider Services/ProviderAdapter.ts, Services/ProviderService.ts, Layers/ProviderService.ts, Layers/PiAdapter.ts, Layers/PiProvider.ts; auth/RpcAuthorization.ts and ws.ts existing read-handler around3649. Reuse active binding resolution with allowRecovery:false and existing-thread validation. Trace registry wrapper ownership and protocol logging before implementing.

Installed public reference C:/Users/johno/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent is0.99.1. Read its relevant complete RPC/session docs, declarations and get_session_stats/get_state implementation. A08 found native session stats count ALL entries, including abandoned branches and compaction/tool usage. The0.84.4 replay fixture only lists the method and does not prove stats shape/provenance. Initially advertise sessions.stats only for verified0.99.1 semantics, with absent/unknown/older support truthfully unavailable. Do not reuse catalog-version allowlists as stats proof or invent a compatibility registry. Capture actual process/version evidence needed for support rather than substituting a future global provider selection.

Add narrow typed provider.getPiSessionStats read RPC, adapter optional native read and service route. Input threadId and expectedProviderInstanceId. Require existing thread, actual live Pi owner, correct expected instance, exact captured context/process generation, and revalidate before returning. No recovery, restart, session open, file read or arbitrary command. Use AuthOrchestrationReadScope; mutation scopes remain unchanged.

Return bounded DTO with threadId, owning instance, opaque process generation, fetchedAt, source pi-native, scope all-session-entries. Message counters user/assistant/toolCalls/toolResults/total, cumulative tokens input/output/cacheRead/cacheWrite/total, cost amount with currency USD and provenance native-reported. Native context is separate nullable contextUsage with nullable token/percent, positive contextWindow and provenance native-estimate. Validate safe nonnegative integer counts and finite nonnegative costs/percent. Preserve native zero and null distinctions; malformed required fields fail rather than become fabricated zeros. Choose field names from real native response and contracts; no broad casts or invented fields.

Exclude sessionFile, native IDs not needed by the client, raw model objects, credentials, summaries, details and conversation records. Ensure new native stats responses are not raw-logged or persisted before DTO redaction. Keep the existing1MiB JSONL ceiling and process/request fences. No unbounded history or parallel snapshots.

## Shared client and UI

Use existing rpc/client.ts and state/runtime.ts request machinery. A small state/piSessionStats.ts with focused tests may be added where reused. Capture environment/thread/current native owner/support/transport generation at intent and discard responses on source or transport changes. Active owner wins over future selected model/provider. Fetch on opening details or explicit Refresh, and once on reconnect only if details remain open. Coalesce repeated in-flight reads; no polling, periodic background scan or per-render network request. Last-known disconnected output must be labeled stale and cannot authorize other controls.

Web/desktop reuse ContextWindowMeter.tsx details, ChatView/composer thread actions and CommandPalette where applicable. Native mobile reuse ThreadComposer/ThreadDetailScreen/ThreadRouteScreen and current command-menu/sheet primitives. Provide the same stats details and refresh behavior, with native accessibility/loading/error/unavailable states. If some existing entry is irrelevant, explain why rather than add a duplicate control.

Show cumulative session counters/cost separately from current context. Never feed cumulative totals to the meter or show unknown context as zero. Native-reported cost is not invoice/account quota or a router quota estimate. Scope label must make all-session-entries versus active branch clear. Do not redesign generic account-usage/settings pages or change existing provider context derivation beyond the required stats display.

## Verification and deliverables

Meaningful focused tests of real server routing, native controlled responses and shared request/state behavior. Cover malformed/native zero/null/oversize, excluded private/path fields and raw logging, orchestration-read allow/mutation deny, stopped owner with no recovery, wrong/replaced instance/process and stale transport/navigation, identical ThreadId across environments, coalesced refresh, disconnect/reconnect while details open, and cumulative-versus-context display. Test real feature behavior, not static props/callback wiring. Use controlled effects/Deferred barriers and drains, never sleeps/polling or relaxed deadlines.

Anchors PiAdapter.test.ts, ProviderService.test.ts, PiProvider.test.ts, RpcAuthorization.test.ts, focused server.test.ts RPC cases, shared rpc/state tests, web ContextWindowMeter.logic/test and native composer command-menu/detail tests. Additional fixture graphs only as genuinely needed for the new interface; stop for expanded unrelated scope. No whole-repository checks. Run affected package types and owned lint/format/diff. Independently attribute inherited diagnostics; no new warnings/suppressions or generalizing the accepted Windows Claude fixtures.

Update concise existing feature/user guidance only where usage or contract assumptions change. Write exact session-root B08b.report.md with owned paths, version/ownership/privacy/DTO/UI decisions, actual commands/counts, skipped/baseline cases and limits. Return synchronously for one focused parent review and confirmed corrections through the same conversation. Do not stage or commit.

No subdelegation, install/prepare/builds, dev servers/Metro/browser/computer use, native/real sessions/auth, canonical/live/global mutation, release/push/PR or changing unrelated providers. Existing hermetic fixtures allowed. No installed-client or integrated claim from unit/native helper tests. Full parity, safe manual compaction and runtime delivery remain open.
