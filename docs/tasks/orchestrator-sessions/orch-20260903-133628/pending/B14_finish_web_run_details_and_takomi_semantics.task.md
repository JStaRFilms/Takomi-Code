# B14 — Finish web Run Details and Takomi semantics

**Role:** Coder
**Stage:** Build
**Depends on:** B00, D03, B11, B13

## Objective
Turn the current Takomi inspector/cards into a complete, capability-gated control and observability surface.

## Implement
Incrementally index bounded semantic activities by session/run/tool/child identity rather than rescanning unlimited thread history. Show current mode/stage/gate, active board, todo progress, context report, loaded skills/policies, routing configuration, subagent groups/children, thinking detail, artifacts, truncation, async state, and available status/interrupt/resume actions.

Inline cards remain canonical; closing the panel cannot remove essential status/error information. The right-panel launcher appears only when the thread has semantic activity. Preserve selection during streaming rollover and restore the latest valid target on reopen.

## Tests
Single/parallel/chain/async, board updates, todo collapse, context report, routing preview, blocked gate, model failure, interrupt/resume, bounded rollover, malformed envelope fallback, keyboard disclosure, focus restoration, reduced motion, and no Agents destination for unsupported providers.

## Definition of done
Run Details is useful after completion and restart, does not lie about live state, and remains smooth on long streaming threads.
