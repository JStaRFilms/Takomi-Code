# A08: Plan native compaction and session stats

## Setup

Read-only architect in C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next, feat/pi-parity-next. Baseline45f9b7902f7648b569a7c0548deac2ed981babd2. Read AGENTS.md, unslop, .repos/effect-smol/LLMS.md, this session's G03.rescope.md, D01.design.md and B05-B07 acceptance. Existing plans remain uncommitted and file-based. Do not restart Genesis.

## Objective

Define the smallest B08 implementation for Pi native manual compaction and session stats across web, desktop and mobile. User explicitly asks whether new UI is invented or existing UI reused. Reuse existing components, entry points and patterns. Only propose a small feature-specific control when required native behavior has no GUI equivalent. No new dashboard, visual style, generic arbitrary-RPC gateway or replacement composer.

## Source to inspect

apps/server/src/provider/Services/ProviderAdapter.ts defines ProviderCompaction native start or slash-command. Native adapters must emit compacted thread state. PiAdapter currently lacks this capability. Read PiAdapter/PiDriver/ProviderService/registry/provider session and orchestrator compaction routes, receipts and ingestion. Compare Codex native compaction and other provider implementations without copying unrelated provider-specific behavior.

Read packages/contracts/src/providerRuntime.ts, provider.ts, server.ts and actual typed RPC/client schemas. Trace web ChatView, chat/ChatComposer.tsx, ContextWindowMeter/logic, command palette/keybindings and mobile use-thread-composer-state, ThreadComposer/ThreadDetailScreen and compaction dispatch. Read existing tests and current provider ownership gates. Read exact installed Pi public docs completely when used and referenced docs, including rpc-commands/rpc/extension/session docs as needed. API reference root C:/Users/johno/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent. Read native implementation/type declarations for compact/get_session_stats/get_state to understand cancellation, hook veto, result correlation and token provenance. No native execution.

## Required decisions

Identify how existing generic compact behavior can call native compact without fake prompt/user/assistant/tool turns. Correlate start/result/error/cancel to original process and intended turn; preserve independent native work and reject concurrent/replaced/deleted ownership. Manual compaction may need explicit model/instructions and native lifecycle hooks; use actual semantics rather than inventing success. Don't turn failed/aborted compaction into a successful context state or leave a lying spinner.

Native stats are not current-context usage or account quota. Specify truthful cumulative/session-vs-context provenance, cost currency and unavailable values. Expose only bounded typed fields, not raw native records/private content or unnecessary filesystem paths. Prefer current authenticated read flow, capability gating and active owner over future selected provider. Handle unknown/legacy versions without advertising unsupported methods. Reuse present context/token/stat details if suitable; do not put cumulative tokens into the context meter. Do not add continuous polling.

Identify existing native auto-compaction event handling and any necessary narrow changes so manual and automatic states settle correctly, without history reconstruction or changing B05/B07 state/draft ownership. Clarify error/interrupt cleanup, process replacement, reconnect and repeated compaction controls. No automatic/runtime config/retry/bash/tree/auth/distribution work in B08.

## Deliverable and limits

READ ONLY. No writes, tests, installs, prepare, builds, dev servers, browsers, native/real sessions, credentials, live/canonical/global mutation, subdelegation or git mutation. Return a concrete plan inline for parent to save as A08.plan.md and author B08 task packet. Include exact source/target/tests, handler/event/DTO shape, per-client entry points, ownership/privacy/receipt decisions and any meaningful choice needing approval. Scope must be narrow enough for one writer and one focused reviewer. Don't count older tests as current integrated proof. If compaction and stats need separate slices, explain source constraints and split rather than inventing a broad framework.
