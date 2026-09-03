# D03 — Specify extension fallback, accessibility, and performance budgets

**Role:** Designer
**Stage:** Design
**Depends on:** D01, D02
**Execution:** Orchestrator owns product decisions, cross-client interaction design, accessibility, budgets, and final specification. Antigravity is reserved for later UI code writing/refinement.

## Objective
Define one canonical rendering contract for Pi extension interactions and Takomi progress that remains accessible and performant on web, desktop, and mobile.

## Required decisions
- Exact Pi 0.84.4 mapping: select(title, string options, optional timeout), confirm(title, message, optional timeout), input(title, optional placeholder, optional timeout), editor(title, optional prefill), notify(message, optional notifyType), setStatus(statusKey, optional statusText where undefined clears), setWidget(widgetKey, optional widgetLines where undefined clears, optional widgetPlacement), setTitle(title), and set_editor_text(text). Richer descriptions/previews/defaults/multi-select exist only behind future protocol negotiation.
- Deterministic unsupported behavior for `ctx.ui.custom`, custom header/footer/editor, overlays, terminal input, and component widgets.
- One durable terminal T3 transition, idempotent duplicate handling, at-most-one fenced Pi-compatible response-write attempt, Pi-owned timeout semantics, reconnect, and stale-request behavior without claiming atomic child-process delivery.
- Disclosure semantics, focus entry/return, status announcements, reduced motion, non-color status, truncation notices.
- Payload budgets for summaries, inspector detail, activities, artifacts, options, previews, and transcript pages.
- Incremental identity/update rules so streaming does not rescan or retransmit unbounded history.

## Deliverable
Orchestrator-authored concrete component directions plus a component/state contract with accessibility acceptance scenarios and explicit byte/count budgets. Distinguish a canonical equivalent from an approximation and from unsupported behavior.

Final artifact:
- `Design_D03_Final.md`

## Definition of done
A builder can implement every state without guessing copy, focus behavior, data bounds, or response semantics.
