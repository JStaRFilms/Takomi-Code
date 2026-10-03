# Task G04: Audit Disconnect, Reconnect, and State Convergence

## 🔧 Agent Setup (DO THIS FIRST)

### Workflow to Follow
Vibe Genesis — resilience investigation and plan correction.

### Prime Agent Context
- `master_plan.md`
- `Upstream_Strategy_and_Resilience_Addendum.md`
- `packages/client-runtime/src/connection/`
- `packages/client-runtime/src/state/`
- `apps/server/src/ws.ts`
- `apps/server/src/orchestration/`
- web/mobile connection platform files

### Optional Skill / Context Overlays
| Overlay | Why |
|---|---|
| agent-engineering | Turn failure modes into precise implementation and test contracts. |

**Stage:** Genesis
**Depends on:** G01, G02

## Objective
Explain slow-host disconnect behavior, prove which state already recovers, and add provider-neutral liveness/backpressure/convergence work to the plan.

## Scope
- Connection supervisor and RPC session deadlines.
- WebSocket and orchestration subscription buffering.
- Wake/foreground resubscription.
- Half-open connection detection.
- Shell, thread, sidebar, draft, outbox, and mobile navigation restoration.
- Active-turn behavior after client and server failure.

## Context
The user observes UI disconnects when the system is slow and is concerned about whether thread and active-work state return correctly.

## Definition Of Done
- Credible disconnect/freeze mechanisms are source-grounded.
- Temporary hidden state is distinguished from actual data loss or stopped work.
- Existing replay/snapshot guarantees are recorded.
- A dedicated B03A task covers provider-neutral liveness, backpressure, telemetry, and convergence.
- B07 retains responsibility for Pi-native transcript reconciliation after crashes.

## Expected Artifacts
- Reconnect findings in `Upstream_Strategy_and_Resilience_Addendum.md`
- `pending/B03A_harden_transport_liveness_backpressure_and_reconnect_convergence.task.md`
- Updated task dependencies.

## Constraints
- Do not start servers or browsers without permission.
- Avoid frequent polling or continuous animations.
- A bounded overflow must resnapshot authoritatively, never silently discard durable events.

## Verification
- Focused tests must simulate slow setup, stalled consumers, wake storms, half-open sockets, and replay/snapshot convergence.
- Integrated local/relay/mobile checks remain in B19 and require user approval where computer use is involved.
