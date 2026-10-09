# Takomi tool-call UI

## Current implementation

Takomi Code uses upstream's V2 turn items and work-log rendering. Desktop and web share that React UI. Mobile consumes the same canonical items through its native feed.

The optional web/desktop Takomi inspector lists persisted tools whose names identify Takomi, Todo, boards, workflows, or subagents. Selecting a call shows its recorded status and non-secret details. Closing the inspector does not remove the inline work-log entry. Vault and secret calls are excluded from the inspector.

The inspector does not reconstruct the older board dashboard or invocation-first child history described in historical task notes. Those notes are not current implementation guidance.

## Code boundaries

- [Pi adapter](../../packages/provider-pi/src/server/adapter.ts) translates native events into V2 tool, todo, subagent, and message items.
- [V2 ingestion](../../apps/server/src/orchestration-v2/ProviderEventIngestor.ts) persists provider events through the shared orchestrator.
- [Work-log presentation](../../packages/client-runtime/src/work-log/presentation.ts) supplies shared labels and summaries.
- [Timeline](../../apps/web/src/components/chat/MessagesTimeline.tsx) renders canonical inline items.
- [Inspector](../../apps/web/src/components/chat/TakomiInspector.tsx) shows recorded Takomi details.
- [Panel state](../../apps/web/src/rightPanelStore.ts) retains the selected tool-call identity and follows upstream close/reopen behavior.

Unknown tools retain the generic rendering. Native lifecycle updates keep their stable tool-call IDs, so later updates replace the same item rather than creating duplicate calls. When the session is no longer live, the inspector displays unfinished active work as interrupted.

Pi reasoning uses the V2 assistant-message stream. Thinking is available only when the selected model emits it.

## Companion extensions

With a Takomi suite root configured, Pi also loads companion extensions from its installed package settings. The launch-resource resolver excludes duplicate global Takomi resources already supplied by the checkout. This retains tools such as questions, Todo, browser integrations, skills, policies, and context tools without registering them twice.

Project resources still follow Pi's trust policy. Configuring a suite root does not approve an otherwise untrusted project.

## Verification and limits

Focused checks cover [inspector filtering and liveness](../../apps/web/src/components/chat/TakomiInspector.test.ts), [timeline logic](../../apps/web/src/components/chat/MessagesTimeline.logic.test.ts), and [Pi adapter events](../../packages/provider-pi/src/server/adapter.test.ts).

- Mobile has no dedicated Takomi inspector.
- Historical items cannot recover content discarded before it was persisted.
- Arbitrary Pi terminal widgets, headers, and footers have no GUI equivalent.
- Rich question descriptions, preview panes, and multi-select metadata remain incomplete in the Pi dialog bridge.
