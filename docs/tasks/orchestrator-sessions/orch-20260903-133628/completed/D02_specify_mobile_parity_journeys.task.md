# D02 — Specify mobile parity journeys

**Role:** Designer
**Stage:** Design
**Depends on:** D01
**Execution:** Orchestrator owns native-mobile product/UX decisions and final specification. The retained Antigravity proposal is exploratory input only; future Antigravity use is limited to actual UI code writing/refinement.

## Objective
Translate the approved desktop/web behavior into a native mobile information architecture without copying the full right inspector into a small screen.

## Read first
D01 output, `Upstream_Strategy_and_Resilience_Addendum.md`, mobile new-task flow, composer command popover, thread settings sheet, work log, approvals/questions, hardware keyboard commands, provider icon, navigation and shared client-runtime resource helpers. The final design must produce concrete native-mobile alternatives and must not shrink the desktop layout.

## Required design
- Environment-scoped session picker and Clone confirmation; explain why direct Attach is unavailable.
- Compact historical-transcript fidelity notice.
- Native Run Details sheet reached from semantic work-log rows.
- Board progress, subagent groups/children, context report, artifacts, and async controls.
- Commands/templates/skills autocomplete with invocation scope.
- Model/thinking and truthful runtime mode settings.
- Keyboard, screen-reader, loading, offline, reconnect, and remote-host path behavior.
- An explicit choice between restoring the previously open route after process death and prominently surfacing the still-active thread on Home.

## Constraints
Use bounded lists and lazy detail loading. Do not stream unlimited reasoning or repeatedly rebuild full activity history. Keep back/close behavior predictable. Use Takomi branding and a neutral fallback for unknown providers.

## Deliverables
- `Design_D02_Antigravity_Proposal.md`
- `Design_D02_Final.md`

## User decisions
- A1: inline authoritative Steer/Follow-up mode control.
- B1: full-screen nested Run Details on compact phones.
- C1: Home-first process-death recovery card.

## Definition of done
Every capability from D01 has a native rendering, a generic rendering, or a deliberate unavailable state; no web-only assumption remains implicit. Consequential alternatives are shown to the user and the selected direction is recorded.
