# Task B03A: Harden Transport Liveness, Backpressure, and Reconnect Convergence

## 🔧 Agent Setup (DO THIS FIRST)

### Workflow to Follow
Vibe Build — provider-neutral connection resilience.

### Prime Agent Context
Read in order:
1. `docs/tasks/orchestrator-sessions/orch-20260903-133628/master_plan.md`
2. `docs/tasks/orchestrator-sessions/orch-20260903-133628/Upstream_Strategy_and_Resilience_Addendum.md`
3. `packages/client-runtime/src/connection/supervisor.ts`
4. `packages/client-runtime/src/connection/driver.ts`
5. `packages/client-runtime/src/rpc/session.ts`
6. `packages/client-runtime/src/connection/wakeups.ts`
7. `packages/client-runtime/src/state/shell.ts`
8. `packages/client-runtime/src/state/threads.ts`
9. `apps/server/src/ws.ts`
10. `apps/server/src/orchestration/Layers/OrchestrationEngine.ts`
11. `apps/server/src/orchestration/ThreadLiveEventCoalescer.ts`
12. web/mobile connection platform implementations.

### Optional Skill / Context Overlays
| Overlay | Why |
|---|---|
| agent-engineering | Keep the reliability contract explicit and testable. |
| code-intelligence | Trace connection state and subscription blast radius. |

**Stage:** Build
**Depends on:** B00

## Objective
Ensure a slow host, blocked client, half-open socket, or foreground wake cannot cause avoidable disconnect loops, unbounded server memory, silent event loss, or incorrect restored state.

## Scope

### Connection deadlines
- Replace the single aggregate setup timeout with stage-specific preparation, socket-open, and initial-synchronization deadlines.
- Preserve an overall safety ceiling without consuming synchronization time during unrelated preparation.
- Report the timed-out stage and elapsed duration.

### Liveness
- Add a low-frequency, activity-aware heartbeat or equivalent bounded half-open detection.
- Suspend unnecessary liveness work while backgrounded.
- Avoid continuously repainting UI or creating a permanent high-frequency timer.

### Wake coordination
- Multicast one platform wake generation.
- Deduplicate visibility/network/foreground events for the same generation.
- Probe the active session before recreating durable subscriptions.
- Bound or stagger restoration when many thread subscriptions are mounted.

### Backpressure and overflow
- Establish per-subscriber queue and byte budgets for orchestration, shell, thread, and preview streams.
- Measure socket buffered bytes and queue high-water marks.
- A slow subscriber must not block or exhaust memory for fast subscribers.
- Durable-stream overflow must invalidate the incremental cursor and force an authoritative snapshot/resubscription. Never silently drop events and continue as if the cursor were complete.

### State convergence
- Preserve shell/sidebar/thread/draft/outbox state through a client-only reconnect.
- Preserve active-thread identity where supported.
- Make mobile process-death route restoration an explicit product decision in D02/B15.
- Do not claim active-turn continuation after an ordinary server crash; B07 handles Pi-native/T3 transcript reconciliation and must disclose incomplete recovery.

### Telemetry
Record bounded, non-secret diagnostics for:
- connection stage durations;
- close code/reason and last successful frame;
- generation and backoff rung;
- socket buffered bytes and subscription queue depth/high-water/overflow;
- replay versus snapshot, requested/head sequence, replay gap, and convergence time;
- wake generation, probe result, and recreated subscription count;
- forced resnapshot reason.

## Context
The current connection model retries and uses sequence-based replay/snapshots correctly, but preparation/open/synchronization share a 15-second deadline, server-side subscription queues can be unbounded, wake listeners fan out independently, and visible half-open sessions lack a documented liveness bound.

## Definition Of Done
- A healthy slow host is not rejected solely because cumulative setup exceeds the old aggregate timeout.
- Half-open connections are detected within a documented bound.
- One stalled client remains within configured queue/byte limits and does not delay fast clients.
- Overflow produces an explicit resnapshot and final state equal to the authoritative server head.
- One wake creates one probe and at most one replacement per logical subscription.
- Reconnect diagnostics identify timeout stage, close reason, resume mode, and convergence result.
- Existing reconnect, authentication refresh, and cache behavior does not regress.

## Expected Artifacts
- Minimal provider-neutral changes in `packages/client-runtime` and `apps/server`.
- Focused unit/integration tests near changed connection and subscription code.
- Internal documentation for budgets, heartbeat behavior, and overflow/resnapshot semantics.
- User-visible wording only if behavior or reconnect status presentation changes.

## Constraints
- Preserve remote/relay/tunnel compatibility.
- Do not introduce an unbounded queue elsewhere as a workaround.
- Do not use sleeps as test synchronization; use receipts, controllable clocks, or deterministic drains.
- Do not run repo-wide checks.
- Ask permission before real browser/mobile/computer-use validation.
- Reconcile existing uncommitted web/mobile changes before editing overlapping files.

## Dependencies
- B00 must establish and preserve the dirty-worktree baseline first.
- This task blocks B13, B15, and B19.
- It can run independently of Pi-specific B01–B03 after B00.

## Verification
1. Delay preparation by 10 seconds and initial configuration by 6 seconds while socket opening succeeds promptly; connection still synchronizes.
2. Stall one client during sustained active-turn traffic; queues remain bounded, fast clients continue, and the stalled client converges by resnapshot.
3. Mount shell plus 100 thread subscriptions, emit one wake, and verify one platform listener/probe plus bounded recreation.
4. Blackhole an established visible connection without a close frame; liveness detection reconnects within the declared bound.
5. Force replay-gap overflow; final shell/thread state equals an authoritative fresh snapshot.
6. Run the narrowest affected tests and report exact commands/results.

## Review Checkpoint
A reviewer must examine timeout arithmetic, queue ownership, overflow correctness, and timer/power impact before client feature work proceeds.
