# D01 Antigravity Constraint Review

**Source:** `Design_D01_Antigravity_Proposal.md`
**Status:** visual exploration accepted; protocol/product corrections required before D01 is complete.

## Accepted design direction

- Reuse the existing composer, command palette, dialogs, right panel, inline tool cards, and Settings surfaces.
- Prefer a keyboard-first session picker over a new dashboard.
- Prefer one causal activity stream with an optional Takomi workflow lens over permanently splitting the narrow right panel.
- Treat reconnecting and authoritative resynchronizing as different states.
- Use clear clone-only safety copy, bounded metadata, middle-truncated paths, focus restoration, live-region announcements, reduced motion, and explicit unsupported-TUI disclosure.
- Show generic Pi activity everywhere; progressively enhance with Takomi semantics only when the Takomi capability is present.

## Corrections required

1. Pi is a provider/runtime on the selected environment host, not necessarily a separately managed “daemon.” Do not promise a PID, socket, disconnect button, or daemon lifecycle UI unless negotiated capabilities provide them.
2. Do not invent `/pi:run`, `/pi:template`, or `@pi/skill`. Use Pi-discovered command/template/skill names and T3's existing resource invocation contracts. Preserve Pi invocation semantics such as `/skill:name` where required.
3. Do not display an actionable or disabled **Attach original** option. Present **Clone into Takomi Code** as the sole action, with a concise “Why cloning?” explanation.
4. Never expose raw host paths or offer “View raw file” to remote clients. Use opaque environment-bound IDs and bounded workspace/host labels.
5. “Open in terminal” is not a universal escape hatch. It may exist only for a local environment when a secure, capability-gated launch/handoff path is implemented. Remote clients receive an explicit unsupported state and safe cancellation.
6. Do not add a second permanent top bar/status bar solely for Pi. Use existing provider/session status locations and an inline reconnect banner when action or disclosure is necessary.
7. Do not auto-open the right panel in a way that steals focus. Inline status remains canonical; Run Details is user-invoked or reopens only when previously open.
8. Resynchronization is not pausable. During authoritative replay/snapshot, mutating actions are temporarily disabled and the user may wait, retry after failure, or disconnect.
9. Version compatibility is capability-negotiated. Do not hard-code “requires Pi 0.84.x” in generic UI copy.
10. If the source changes between preflight and clone completion, abort and retry from a fresh catalog identity/checksum. Do not offer to continue from an ambiguously stale identity.
11. Do not promise every tool/file context is preserved unless the clone proof demonstrates it. Copy should say Pi creates a native child session and Takomi Code verifies the source remained unchanged.
12. Transcript-gap copy must describe what is known without fabricating missing step numbers. Offer Run Details/diagnostics, not raw filesystem access.

## Corrected product copy

### Clone explanation

> **Why clone?** Pi does not currently provide a cross-process lock for native session files. Takomi Code creates a separately owned child session through Pi and verifies that the source did not change. Your original remains untouched and can still be opened in the CLI.

### Reconnecting

> **Reconnecting to this environment…** Your saved thread is still available. Live updates are paused while the connection is restored.

### Resynchronizing

> **Checking for missed activity…** Takomi Code is replaying updates or loading an authoritative snapshot before new actions are enabled.

### Transcript incomplete

> **Some native Pi activity could not be reconciled.** The visible transcript may not represent all context used by Pi. Review recovery details before continuing.

### Unsupported terminal UI

> **This Pi extension requested terminal-only UI that Takomi Code cannot render safely.** The request was cancelled. Open the session in a supported local terminal only after Takomi Code releases ownership.

## User decisions

The user should choose:

1. Quick-pick modal versus two-pane session sheet.
2. Unified activity stream with Takomi lens versus pinned split panels.
3. Strict structured fallback versus an additional local-only terminal handoff when capability-gated.

After these choices, D01 can be corrected and reviewed; D02 mobile design and D03 interaction/budget design follow.
