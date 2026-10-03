# Upstream Strategy and Resilience Addendum

**Session:** `orch-20260903-133628`
**Branch:** `feat/pi-takomi-parity`
**Canonical Takomi source:** `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`
**Purpose:** prevent duplicate Pi work, establish the upstream/fork boundary, and make slow-host reconnect safety a release requirement.

## 1. Upstream landscape

Upstream already has a serious Pi implementation in progress:

- [PR #7211 — feat(providers): add Pi coding agent](https://github.com/pingdotgg/t3code/pull/7211)
  - Open, not draft, checks green at audit time, merge state `DIRTY`.
  - Targets `t3code/codex-turn-mapping`, not `main`.
  - Supersedes earlier Pi PRs including #2211, #2748, #2800, #2812, #2831, #2856, #3818, #3947, #4355, #4445, #5688, #5882, and #6319.
  - Implements a substantial Orchestrator V2 Pi integration: JSONL RPC transport, models/thinking, commands/skills, native resume, permission modes, extension requests, retries/compaction, utility text generation, web/mobile provider presentation, and focused tests.
- [PR #6461 — feat(providers): standardize ACP providers](https://github.com/pingdotgg/t3code/pull/6461)
  - A separate broad ACP/provider-standardization effort with Pi-through-ACP proof.
  - Useful architectural evidence, but not a drop-in replacement for Pi's native RPC/session fidelity.
- [Issue #5020 — Pi-style extension API](https://github.com/pingdotgg/t3code/issues/5020)
  - Closed without maintainer comments. It is evidence that a generic declarative extension boundary has been proposed, not evidence that upstream has committed to implementing it.

The fork and PR #7211 are independent implementations over the same Pi protocol. The fork uses the current `apps/server/src/provider/Layers/PiAdapter.ts` path and embeds Takomi-specific semantics. PR #7211 uses Orchestrator V2 files such as `PiRpc.ts`, `PiAdapterV2.ts`, and `PiCommands.ts`. Cherry-picking the large provider implementation into this branch would import a missing architecture graph and create a fragile hybrid.

## 2. Revised implementation strategy

Do not implement the generic Pi provider from scratch and do not open a competing monolithic upstream PR.

1. Treat #7211 as the leading upstream Pi implementation while it remains active.
2. Compare every generic Build task against #7211 before coding.
3. Port concepts and focused fixes into this fork only where needed; do not blindly cherry-pick the provider commit stack.
4. Coordinate narrow upstream contributions against #7211 or its eventual landed successor:
   - bounded JSONL framing and diagnostics;
   - bounded durable tool payloads with truncation disclosure;
   - deterministic settlement for unsupported response-bearing extension requests;
   - native event logging;
   - later, opaque session catalog IDs, clone-only CLI continuation, and crash reconciliation.
5. Rebase or merge the fork onto the eventual upstream architecture before replacing the current Pi adapter wholesale.
6. Keep commits separable so generic Pi fixes can be replayed upstream without Takomi branding, schemas, runtime dependencies, or UI.

## 3. Upstreamable versus Takomi-only boundary

### Upstreamable T3/Pi layer

The generic layer may know only Pi and T3 concepts:

- Pi binary discovery, version compatibility, health, auth status, models, and thinking levels;
- bounded Pi JSONL/RPC transport;
- capability-negotiated lifecycle, permissions, queueing, retries, compaction, tools, and extension interactions;
- commands, templates, and skills using provider-neutral resource contracts;
- native session references, opaque environment-bound catalog IDs, clone-only continuation, history reconciliation, and import/export artifacts;
- generic web, desktop, and mobile controls and fallbacks;
- provider-neutral extension activity envelopes;
- focused protocol, session, and reconnect tests;
- user documentation describing Pi support without Takomi assumptions.

Generic Pi code must not import the Takomi package, recognize `takomi_*` names, enumerate Takomi extensions, use Takomi branding, or encode board/workflow/subagent semantics.

### Takomi-only layer

The fork/composition layer owns:

- Takomi branding and product naming;
- Takomi runtime/core, companion extensions, prompts, personas, policies, workflows, skills, themes, and `pi-subagents` compatibility;
- versioned Takomi control API;
- board, workflow, context, policy, routing, todo, and subagent semantic projections;
- Takomi Run Details and specialized cards/inspector;
- Takomi runtime packaging, integrity, installer, and update behavior;
- optional interpretation of a versioned Takomi presentation envelope carried through the generic extension boundary.

The desired dependency direction is:

```text
T3 Code -----> Pi public CLI/RPC/SDK contracts
Takomi ------> Pi extension API + pi-subagents
Takomi Code -> T3 Code composition + separately installed Takomi
T3 Code -X--> Takomi packages or Takomi-specific schemas
```

## 4. Canonical Takomi source rule

`~/.pi/agent` is an installed deployment target, never the source of truth.

Any global Takomi edit must also be applied to:

`C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`

Canonical locations include:

- `.pi/extensions/*`
- `src/pi-takomi-core/*`
- `.pi/prompts`, `.pi/agents`, `.pi/themes`
- `src/pi-installer.js`
- `src/pi-harness.js`
- `src/owned-tree.js`
- `package.json` (`takomi@2.5.15` at audit time)

At audit time all six managed installed extension trees matched canonical source. However, installer validation does not yet prove canonical/installed hash equality, the manifest can become stale, removed owned files are not pruned safely, and `scripts/sync-pi-global.ps1` does not accurately model production installation. B00/B17 must add a per-file ownership manifest and canonical → packed artifact → isolated install verification.

## 5. Slow-host disconnect and reconnect findings

The existing cursor-based synchronization design is fundamentally sound, but it does not guarantee that a slow host will remain connected or converge cheaply.

### Confirmed risks

1. **Aggregate 15-second setup timeout:** preparation, socket open, and initial configuration share one deadline. A healthy but overloaded host can open the socket and still be torn down before synchronization completes.
2. **Unbounded slow-consumer queues:** server event buses and subscription buffers can accumulate memory when a browser, mobile bridge, relay, or socket writer falls behind.
3. **Foreground resubscription burst:** supervisor, shell state, and every mounted thread independently react to wakeups, creating a thundering herd while the machine is recovering.
4. **No steady-state application liveness bound:** half-open visible connections can appear frozen until a write or visibility change reveals failure.
5. **Ordinary server crash does not resume an active turn:** persisted T3 history survives, but the active turn becomes errored and native Pi entries can exceed the visible transcript.
6. **Mobile navigation is not restored after process death:** data survives, but the previously open thread may be hidden behind Home.

### Existing strengths

- failed sessions are replaced with capped retry backoff;
- durable shell/thread subscriptions resume by sequence and deduplicate replay;
- invalid or oversized replay gaps force authoritative snapshots;
- snapshot/live attachment ordering avoids the common race;
- settled shell/thread state, drafts, and mobile outbox data are durable;
- active client disconnect alone does not imply persisted event loss.

### Required behavior

Add B03A as a foundational task:

- stage-specific preparation/open/synchronization deadlines;
- activity-aware heartbeat or bounded half-open detection;
- one multicast wake generation with coordinated probe-before-resubscribe;
- bounded per-subscriber queue/byte budgets;
- overflow semantics that force cursor-based authoritative resnapshot instead of silent event loss;
- connection-stage, close-code, queue-depth, replay/snapshot, wake-generation, and convergence telemetry;
- slow-consumer tests proving a stalled client cannot exhaust the server or damage fast clients;
- local, relay, and mobile-resume verification in B19.

B03A blocks web/mobile integration and final verification. B07 remains responsible for Pi-native/T3 transcript reconciliation after a host crash.

## 6. Design stage and user collaboration

“Design” means UI/UX behavior, not system architecture. Architecture is already sufficiently defined to enter Design.

The user can help by reviewing concrete journeys and choosing between visual/interaction options for:

- where **Continue a Pi session** lives;
- how clone-only safety and source provenance are explained;
- how queue, compaction, retry, reconnect, and transcript-fidelity states appear;
- the Run Details information hierarchy;
- generic Pi extension fallback versus Takomi-enhanced rendering;
- desktop versus native mobile interaction patterns;
- whether mobile restores the prior route or surfaces the active thread prominently on Home.

Product direction, UX architecture, interaction decisions, specifications, and acceptance criteria are authored by the orchestrator and reviewed with the user. Antigravity is reserved for actual UI code writing/refinement after those decisions are fixed; it is not used to decide product behavior. Earlier D01/D02 Antigravity proposals remain exploratory input only, while the final specifications are orchestrator-owned. No browser or simulator validation occurs without explicit permission.

## 7. Branch and commit strategy

Implementation branch created without a new worktree:

`feat/pi-takomi-parity`

Existing dirty/staged work moved with the branch and was not reset or overwritten.

Use separable commit lanes:

1. `fix(pi): ...` / `feat(pi): ...` — generic, upstream-candidate changes with no Takomi imports or branding.
2. `feat(takomi): ...` — Takomi source/runtime/control changes.
3. `feat(takomi-code): ...` — fork-only composition and specialized UI.
4. `fix(connection): ...` — provider-neutral resilience suitable for upstream.

Do not create an upstream PR until the user explicitly asks and coordination with #7211 establishes the correct target branch and scope.
