# B15 — Implement native mobile parity

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B03A, D02, D03, B04, B05, B06, B07, B08, B09, B10, B11, B12

## Objective
Provide native mobile access to every supported Takomi Code capability rather than relying on web-only cards or a Codex fallback.

## Implement
- Explicit Pi/Takomi branding and neutral unknown-provider fallback.
- Capability-gated runtime/model/thinking controls.
- Commands/templates/skills in existing composer autocomplete.
- Environment-local session picker and Clone-only continuation; direct Attach stays unavailable without a Pi lock.
- Transcript fidelity notice and history paging.
- Native Run Details sheet from semantic work-log rows with board, todo, context, subagents, artifacts, truncation, and async controls.
- Extension approval/question metadata supported by mobile contracts.
- Hardware keyboard entries only for actions the selected provider supports.

Keep lists bounded/virtualized, preserve offline/reconnect state, and label remote paths as host paths.

## Tests
Mobile logic/component tests for branding, capability filtering, resource invocation, clone confirmation, explicit Attach-unavailable state, sheet open/back/reopen, single/parallel/chain/async details, exactly-once questions, offline/reconnect, accessibility labels/focus, and bounded updates. Real-device/simulator validation only with user permission.

## Definition of done
The mobile parity ledger has no accidental gaps: each feature is native, generic, or explicitly unavailable. Before editing overlapping files/assets, the implementer records/reconciles the human-approved baseline and never resets existing uncommitted work.
