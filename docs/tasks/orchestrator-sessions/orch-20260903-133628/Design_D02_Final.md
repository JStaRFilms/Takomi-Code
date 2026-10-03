# D02: Native Mobile Pi/Takomi Journeys

**Status:** Approved design direction
**Final product/UX owner:** Orchestrator; Antigravity proposal retained as exploratory input only
**Constraint review:** corrected against current React Native navigation, persistence, outbox, connection, and adaptive-layout behavior
**Inherits:** `Design_D01_Final.md`

## 1. Mobile design principles

1. Mobile is cache-assisted, not independently authoritative. The environment host and T3 event log remain authoritative.
2. Preserve existing native navigation and platform presentation: nested stack routes, iOS form sheets/detents where already used, Android card/full-page conventions, and `AdaptiveWorkspaceLayout` on wider devices.
3. A semantic Work Log row opens one Run Details surface. `Execution` is always generic; `Workflow` appears only from a versioned Takomi presentation envelope.
4. Drafts remain editable offline. Offline submissions use the durable transport outbox; they are not Pi follow-up queue entries.
5. Every action is environment-scoped, capability-gated, authorized, bounded, and reversible where the underlying protocol permits it.
6. Structured metadata never exposes native-session paths, arbitrary cwd values, source paths, or raw custom state.
7. Compact phones prioritize one task per screen. Tablets/foldables retain existing adaptive sidebar/inspector behavior rather than forcing phone sheets.

## 2. Persistence and restoration contract

Current persistence remains the baseline:

- SQLite stores bounded serialized shell/thread/config/VCS cache records and preferences.
- Drafts use their existing store.
- Durable disconnected submissions use atomic transport-outbox files.
- Live provider events update client-runtime projections; mobile does not append an independent unbounded event ledger.
- Server/provider state remains authoritative after reconnect.

D02 adds only a bounded last-open resume candidate `{environmentId, threadId}` through the existing persistence boundary if the user selects that product direction. It does not serialize the navigation stack, scroll offset, provider stream, diagnostics log, or transcript-fidelity database column.

## 3. Mobile information architecture

| Capability | Compact phone entry | Wide-device entry | Return path |
|---|---|---|---|
| Start Pi thread | Existing New Task provider/model controls | Existing adaptive New Task pane | Back to New Task/composer |
| Commands/templates/skills | Existing composer resource popover | Same composer resource surface | Restore composer focus |
| Continue Pi session | Nested route in New Task; capability-gated action | Existing adaptive auxiliary pane or platform-equivalent route | Back to New Task invoking row |
| Model/thinking/runtime mode | Existing discrete pickers in New Task and Thread Settings | Same settings controls | Return to invoking setting |
| Work Log | Existing thread Work Log | Existing pane/surface | Preserve row and scroll anchor |
| Run Details | Selected semantic Work Log/inline activity row | Existing inspector/auxiliary pane when available | Return to invoking row/activity |
| Session tree/fork/rename/stats/export | Run Details `Session` section | Same section in auxiliary pane | Preserve selected session row |
| Queue/steer/follow-up/compact/retry/bash | Composer plus Run Details `Controls` section | Same capability-gated controls | Return to composer/control row |
| Takomi details | `Workflow` view inside Run Details | Workflow view in existing auxiliary pane | Return to selected Takomi activity |
| Connection/fidelity | Inline thread banner opens Run Details diagnostics | Same | Return to banner |
| Release for CLI | Run Details `Session ownership` section | Same | Return to thread/session row |

Do not add a persistent floating Workflow chip or separate Workflow navigation hierarchy.

## 4. Continue a Pi session

### Compact-phone route

```text
‹ New Task       Continue a Pi session
──────────────────────────────────────
[ Search sessions…                  ]

> Fix JWT rotation
  12m · Workspace · Compatible

  Optimize queries
  2h · Workspace · Checking…
──────────────────────────────────────
Why clone?
Pi has no cross-process session-file
lock. Takomi Code creates a separately
owned child through Pi.

[ Clone into Takomi Code ]
```

- This is a nested route in the existing New Task flow.
- iOS may present it using the app’s existing form-sheet convention; Android uses the existing card/full-page convention.
- Wide tablets/foldables use current adaptive layout based on available dimensions.
- The only continuation action is `Clone into Takomi Code`; there is no Attach control.
- A clone creates a separately owned Pi child and binds a new T3 thread. It does not imply a new environment, worktree, or git branch.

### Required states

| State | Copy and behavior | Actions |
|---|---|---|
| Loading | `Loading Pi sessions from this environment…` with bounded placeholders | Back/cancel |
| Empty | `No Pi sessions were found for this workspace.` | Start new thread; back |
| Offline | Cached rows may remain visible but are not cloneable; `Reconnect to refresh session availability.` | Back; reconnect through existing environment flow |
| Missing workspace | `The workspace used by this session is unavailable on this environment.` | Choose workspace through existing environment project/folder flow; cancel |
| Moved workspace | `Select the session’s current workspace before cloning.` | Locate authorized workspace; cancel |
| Stale token | `This session changed since it was listed.` | Refresh; cancel |
| Clone running | `Creating and validating a separately owned Pi child…` | Cancel only if safely advertised |
| Source changed | `The source changed while the child was created. Nothing was attached.` | Refresh and retry; close |
| Child invalid | `The child could not be verified and was not opened.` | Retry after deterministic cleanup/quarantine; diagnostics; close |
| Success | Navigate only after child ownership, initial T3 synchronization, and Pi-native reconciliation gates complete | Open thread |
| Cancelled | No child/thread is opened; settle once | Return focus to invoking New Task row |

Structured session metadata uses server-minted opaque IDs and friendly environment/workspace labels. Native paths/checksums remain server-side.

## 5. Composer, resources, and delivery modes

### Resource discovery

- Discover after Pi session initialization for the selected cwd and trust state.
- Extension/template invocation remains `/${name}`.
- Skill invocation remains `/skill:${skillName}`.
- Exclude built-in TUI-only commands.
- Render through existing mobile command/skill surfaces with provider-neutral provenance only when the contract supplies it.
- Missing resource discovery does not block ordinary prompting.

### Offline transport outbox

```text
Offline · Showing saved thread
──────────────────────────────────────
[cached messages and work log]
──────────────────────────────────────
[ Draft remains editable…           ]
                         [ Queue send ]
```

- Draft editing and offline submission remain available.
- Submitting offline creates a durable local transport-outbox item.
- Drain begins only after environment and shell synchronization.
- Outbox delivery is not represented as a Pi follow-up or steer until it reaches the authoritative provider path.

### Active Pi turn

While connected and active, show the authoritative advertised delivery mode:

- steering message; or
- Pi follow-up.

Do not describe steering as high-priority, system-level, interrupting, or guaranteed to preempt work. Do not hard-code Queue as the provider default. A mobile interaction choice remains pending in Section 14.

## 6. Run Details — selected unified model

A semantic Work Log row opens one native Run Details route/sheet.

```text
‹ Thread                 Run Details
──────────────────────────────────────
[ Execution ] [ Workflow ]
               ↑ only with Takomi envelope

Execution
✓ observed tool: read
› observed tool: bash          Running
! runtime warning             Details

Older activity unavailable beyond the
retained boundary.
```

- `Execution` uses canonical Pi/T3 event projections only.
- Display provider tool names verbatim; do not fabricate channels, duration, exit signal, or single-tool replay.
- Run Details renders allowlisted bounded projections, not raw custom JSON/JSONL.
- The existing T3 terminal route remains available when the environment advertises it, but it is not a fallback for Pi extension TUI requests.
- HTML/JSONL exports use server-managed authorized artifacts when advertised.
- Closing restores the exact Work Log/inline row and scroll anchor.

## 7. Optional Takomi Workflow view

Show only when a negotiated Takomi envelope supplies workflow identity.

```text
‹ Thread                 Run Details
──────────────────────────────────────
[ Execution ] [ Workflow ]

Workflow
Mode             orchestrate
Stage            Build · review gated
Board            12 / 29 completed
Subagents        2 running · 1 blocked
Context          1 warning
Routing          exact model route
Todos            3 pending
```

Sections are lazy and bounded:

- Mode
- workflow stage/review gate
- board/tasks/artifacts
- subagent parent/children/results
- context skills/policies/warnings
- exact routing configuration
- policy prerequisites
- todo state

Mutations require B11’s deterministic versioned Takomi control API. Each shows requested, preview/confirmation when required, authoritative success, cancelled, blocked, failed, and reconnect-refreshing states. Blocked/cancelled launches are never retried automatically. Generic Pi code never parses `takomi_*` names to create this view.

## 8. Session and history capabilities

The `Session` section in Run Details has a row for every D01 capability:

| Capability | Native mobile behavior |
|---|---|
| Hydrated history | Render bounded canonical projections; unknown/custom state uses disclosure; no fabricated checkpoints |
| Fidelity | Persistent warning until authoritative reconciliation clears/supersedes it |
| Full tree | Lazy native list/sheet of branches when advertised; stable active-leaf indication |
| Fork from here | Visible only for an advertised forkable native entry/leaf; produces a separately owned child/thread |
| Navigate same file | Hidden until active-leaf/checkpoint semantics are advertised and proven |
| Rename | Existing compact text dialog with bounded validation and explicit provider/T3 sync result |
| Statistics | Read-only bounded metrics labelled by source; distinguish effective context from cumulative usage |
| HTML/JSONL export | Platform share/download flow backed by authorized server artifact; no client host path |
| Import | Existing upload/document picker to a bounded authorized server artifact when supported |
| Release for CLI | Stop owner, await/verify closure, then mark thread released before any local open instruction |
| Reacquire | Hidden unless a reviewed ownership protocol exists |

Each action has loading, success, cancellation, blocked, failure, and return-focus behavior inherited from D01.

## 9. Queue, compaction, retry, and bash

| Control | Mobile treatment |
|---|---|
| Pi steer/follow-up | Composer mode control using exact provider semantics |
| Queue inspection/removal/reordering | Run Details `Controls`; only advertised operations render |
| Manual compaction | Registered action with running/completed/failed activity |
| Auto-compaction | Read-only authoritative setting/status unless modification is advertised |
| Retry/auto-retry | Display provider-observed attempt state; abort-retry only when advertised |
| Direct bash | Advanced host-scoped action distinct from agent tool events |
| `abort_bash` | Session-wide/direct-bash control using actual response and observed state |
| Visual tool grouping | Presentation preference only; never label it model-context compaction |
| Stop turn | Existing Stop path; thread subscription remains active after cancellation |

No arbitrary failed tool receives a `Rerun tool` button without a distinct protocol capability.

## 10. Extension UI and terminal behavior

- `select`, `confirm`, `input`, and `editor` use existing mobile approval/question/input primitives and settle exactly once.
- Fire-and-forget notify/status/widget/title/editor-text maps to bounded canonical surfaces using exact fields defined by D03/B10.
- Pi terminal-only/custom extension behavior has no fabricated mobile equivalent.
- If an unsupported response-bearing request reaches T3, settle it once as unsupported/cancelled and show the D01 bounded fallback.
- Do not invent a TTY event, signal, exit code, timeout, or terminal handoff.
- Existing environment terminal access remains an independent T3 capability.

## 11. Reconnect, synchronization, and fidelity

```text
Cached thread remains visible
          │
          ▼
Reconnecting to environment
(live updates paused; draft editable)
          │
          ▼
T3 stream sync
(replay or authoritative snapshot)
          │
          ▼
Pi-native reconciliation + ownership gate
          │
     ┌────┴────┐
     ▼         ▼
Synchronized  Transcript incomplete
```

Mutations re-enable only after connection, T3 stream convergence, Pi-native reconciliation, ownership, and capability gates all pass.

| State | Mobile behavior |
|---|---|
| Reconnecting | Keep cached thread, sidebar/shell information, draft, and outbox visible; disable remote mutations |
| T3 stream synchronizing | Apply replay/snapshot through client-runtime projection; never append a separate mobile event ledger |
| Pi-native reconciling | Keep sending/session mutation disabled; show bounded status |
| Synchronized | Remove transient status without a mandatory animation |
| Transcript incomplete | Persistent fidelity banner; later authoritative reconciliation may clear/supersede it |
| Cancel turn | Send advertised abort/cancel while keeping thread subscription alive |
| User reading history | Live-follow only if already at end; never pull the user to new output |

## 12. Process-death restoration alternatives

Both alternatives require a new bounded last-open resume candidate and authoritative reconciliation. Cached `running` never proves a live run survived.

### A. Home-first recovery card — recommended

```text
Home
──────────────────────────────────────
Resume previous thread
Fix JWT rotation
remote-dev · status checking…
[ Resume thread ]
──────────────────────────────────────
Recent projects…
```

- Mount Home immediately.
- Show a persistent recovery row from bounded cached metadata.
- Reconcile only after the user resumes.
- Deep links, notifications, and incoming shares take precedence.
- Lowest risk of route/crash loops and stale thread assumptions.

### B. Direct route restoration

- Attempt the previous environment/thread route.
- Show cached content immediately while reconnecting.
- Fall back to Home if environment resolution, authorization, or thread lookup fails.
- Faster continuity but more launch complexity and greater stale-route risk.

## 13. Accessibility, adaptive layout, and performance handoff

- Use platform accessibility font categories and existing scaled text roles; reflow before clipping rather than imposing a fixed percentage limit.
- Meet platform minimum touch-target guidance through existing components; do not apply arbitrary universal hit slop.
- Use native reduced-motion/accessibility APIs. Remove continuous pulsing, shimmer, and spinning loops when reduced motion is active.
- Status always includes text/icon semantics, never color alone.
- Autofocus only the session-picker search. Preserve natural route focus elsewhere and restore focus to the exact invoker on close.
- Register hardware-keyboard actions only through existing mobile command/editor infrastructure, with platform-specific collision handling.
- Use the existing LegendList-based timeline, stable identities, incremental updates, lazy history/details, and measured D03 budgets.
- Preserve current orientation policy: compact phones use the supported phone orientation; tablets/foldables may rotate and use adaptive panes.
- Do not invent node-count, draw-window, memory, or timing limits. D03 must set measured event-count, byte, update-rate, and retained-detail budgets.
- Raw output remains potentially sensitive, bounded, and authorization-controlled; separator normalization applies only to structured display paths.

## 14. User decisions recorded

- **A1 — Active-turn composer:** primary send label reflects the authoritative current delivery mode; an adjacent mode control switches between advertised Steer and Follow-up.
- **B1 — Compact-phone Run Details:** use a full-screen nested route for execution, workflow, board, and diagnostics. Tablets/foldables retain adaptive auxiliary panes.
- **C1 — Process-death recovery:** launch Home and show a persistent `Resume previous thread` card after checking cached identity and current authoritative status.

## 15. Acceptance criteria

- Every D01 capability has a native, generic, or explicit unavailable treatment.
- Mobile never becomes an independent provider/event authority.
- Offline outbox, Pi follow-up, and Pi steering remain separate concepts.
- One Run Details surface contains generic Execution and optional Takomi Workflow views.
- No raw custom payload/native path is shown as diagnostics.
- Clone/fork never implies environment/worktree/git branching.
- Existing terminal route remains independent; Pi TUI behavior is not fabricated.
- Model, thinking, and runtime controls use exact advertised discrete options.
- Connection/T3 sync/Pi reconciliation/ownership gates all pass before mutations re-enable.
- Process-death recovery never treats cached running state as proof of a surviving run.
