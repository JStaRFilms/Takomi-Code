# D01: Web and Desktop Pi/Takomi Journeys

**Status:** Review candidate
**Final product/UX owner:** Orchestrator; Antigravity proposal retained as exploratory input only
**Selected direction:** quick-pick session modal; unified Run Details stream with optional Takomi lens; structured unsupported-TUI fallback
**Constraint review:** protocol and product behavior corrected against Pi 0.84.4 and current T3 patterns

## 1. Design principles

1. Reuse existing T3 surfaces: new-thread/composer provider controls, resource menu, command palette, Settings, inline activity, dialogs, and the existing right-panel shell.
2. Generic Pi support works without Takomi. Takomi adds a versioned presentation/control layer without changing the Pi transport.
3. The server advertises a versioned T3 provider capability descriptor derived from the selected Pi transport and compatibility probe. The UI never infers support from provider name.
4. Missing optional capabilities disable only their dependent actions. A provider-wide incompatibility state is reserved for failure of the documented minimum turn lifecycle.
5. Pi owns native sessions and model context. T3 owns environment/thread identity, remote authorization, and client-visible state.
6. No raw native-session path or arbitrary host path appears in structured client metadata. Raw command/output content is separate, bounded, access-controlled, and never rewritten as a path-sanitization shortcut.
7. Reconnecting, T3 stream synchronization, Pi-native transcript reconciliation, and transcript-incomplete are distinct states.
8. No action silently emulates terminal-only behavior.

## 2. Information architecture

### Existing entry points

| Capability | Primary entry | Secondary entry | Return path |
|---|---|---|---|
| Start a Pi thread | Existing new-thread/composer provider picker | Provider default in Settings | Return to composer |
| Pi model/thinking/runtime mode | Existing composer controls | Settings provider defaults | Close popover/sheet to invoker |
| Commands/templates/skills | Existing composer resource menu | Registered capability-gated command-palette actions | Restore composer focus |
| Continue a Pi session | New-thread Pi provider controls | Registered `Continue a Pi session…` command-palette action and Pi Settings | Close modal to the invoking control |
| Queue/steer/follow-up | Existing composer behavior while a turn is active | Run Details when queue inspection is supported | Return to composer or selected queue row |
| Compact/retry/bash | Existing registered command/action surfaces | Run Details action area when advertised | Return to invoking action |
| History/tree/fork/rename/stats/export | Run Details | Capability-gated registered command-palette actions | Preserve right-panel selection and focus |
| Takomi workflow/board/subagent/context detail | Optional Workflow lens in Run Details | Existing Takomi inline activity opens the same lens | Return to the selected inline activity |
| Connection/reconciliation detail | Inline status banner opens Run Details diagnostics | Environment status surface | Return to the banner/invoker |
| Release child for CLI | Run Details session actions | Pi Settings active-session ownership section | Return to thread after release/cancel |

Do not add a Pi-only top bar, status bar, dashboard, or parallel navigation hierarchy.

## 3. New-thread and resource discovery journey

### Start a thread

1. The user selects Pi through the existing provider picker.
2. T3 loads the provider snapshot for the selected environment and cwd.
3. Composer controls show only advertised model, thinking, runtime-mode, image, queue, and other capabilities.
4. During capability loading, keep the draft editable but disable Send and dependent actions with a concise loading label.
5. If optional discovery fails, Pi remains usable for normal prompts and the resource menu shows a bounded retryable discovery error.
6. If the minimum turn lifecycle is incompatible, disable Send and provide the actual available remediation: retry probe, choose another provider, or follow a guided install/update action when one exists.

### Commands, prompt templates, and skills

Discovery occurs after provider-session initialization for the selected cwd and trust state, then populates the existing workspace resource snapshot.

- Extension command/template invocation: preserve the exact Pi command name as `/${name}`.
- Skill invocation: preserve `/skill:${skillName}`.
- Exclude Pi built-in TUI-only commands that are not dispatchable through the transport.
- Preserve provider-neutral provenance and invocation metadata only after contracts support it.
- Never forward `sourceInfo.path` or another filesystem source path to clients.
- Use the existing T3 skill and slash-command renderers; do not merge distinct contracts merely to create a visually flat list.
- Command-palette entries are registered T3 actions with capability predicates and keybinding collision handling, not hard-coded labels that bypass the registry.

## 4. Continue a Pi session — selected quick-pick design

### Layout

Use the existing command-dialog/autocomplete primitive in a centered modal. Do not create a second transcript browser.

```text
Continue a Pi session                                      Esc
┌ Search sessions…                                            ┐
│ > Fix JWT rotation                 12m · 4 messages          │
│   Workspace · Compatible · Source unchanged                 │
│                                                            │
│   Optimize queries                   2h · 9 messages         │
│   Workspace · Compatibility unknown                         │
├────────────────────────────────────────────────────────────┤
│ Why clone? Pi does not provide a cross-process lock for     │
│ native session files. Takomi Code creates a separately      │
│ owned child through Pi; the original is not intentionally   │
│ written by Takomi Code.                                     │
│                                  Cancel  Clone into Takomi Code
└────────────────────────────────────────────────────────────┘
```

### Metadata

Each row may show only bounded server-projected metadata:

- server-minted opaque session ID;
- friendly environment and workspace label;
- bounded session name or first-prompt summary;
- last activity time;
- bounded entry/message count when available;
- compatibility and fidelity state.

Never expose the native session path, source file identity, checksum, server artifact path, or a host alias encoded into a supposedly opaque ID.

### Focus and keyboard behavior

- Autofocus Search.
- Use the existing autocomplete/listbox primitive with one highlighted result and announced result counts.
- Arrow keys move the highlight; Enter activates the highlighted session only when valid.
- Confirmation remains disabled while compatibility/source validation is pending.
- Escape cancels and restores focus to the actual invoking element, whether composer, command palette, or Settings.
- Loading, disabled, warning, and selected descriptions are associated with each option for assistive technology.

### Clone protocol reflected by the UI

1. Resolve the opaque catalog token within the authorized environment.
2. Refresh and record strong source identity and content digest.
3. Ask the reviewed Pi public-SDK/host boundary to create a native child, or use another protocol proven by B06. Do not claim stock RPC alone provides an atomic source snapshot.
4. Verify source identity after child creation.
5. If source identity changed, do not open or bind the child. Quarantine or safely discard it according to B06, refresh the catalog, and require a new user action.
6. On success, bind the new T3 thread to the child owner and record provenance, active leaf, append high-water identity, transport owner, and fidelity.

Product copy must say:

> Takomi Code does not intentionally write the source. If its identity changes while the child is created, cloning stops and you must retry from refreshed session information.

It must not promise that the source remains byte-identical when another CLI is legitimately writing it.

### Modal states

| State | Behavior and copy | Actions |
|---|---|---|
| Loading catalog | Skeleton rows; `Loading Pi sessions from this environment…` | Cancel |
| Empty | `No Pi sessions were found for this workspace.` | Close; start a new thread |
| Discovery unavailable | `Session discovery is unavailable for this Pi transport.` | Close; view compatibility details |
| Compatibility checking | Row remains non-actionable; `Checking compatibility…` | Cancel |
| Stale catalog token | `This session changed since it was listed. Refresh before cloning.` | Refresh; cancel |
| Workspace unavailable | `The workspace used by this session is not available on this environment.` The row is not cloneable until a valid workspace is selected. | `Choose workspace…` opens the existing environment project/folder picker; Cancel returns focus to the session row or original invoker |
| Workspace moved | `This session’s workspace may have moved. Select its current location before cloning.` Preserve the opaque session selection while revalidating the replacement workspace. | `Locate workspace…`; Refresh; Cancel. Only an authorized canonicalized environment path may be linked |
| Replacement rejected | `That location cannot be used for this session.` Keep the modal and prior selection visible without revealing the rejected host path. | Choose another workspace; Cancel and restore focus to the invoker |
| Clone in progress | Keep modal open; `Creating a separately owned Pi child…` | Cancel only if the protocol supports safe cancellation |
| Source changed during clone | `The source changed while the child was created. Nothing was attached. Refresh and try again.` | Refresh; close |
| Child validation failed | `The child could not be verified and was not opened.` | Retry after cleanup; close; diagnostics |
| Success | Open the bound thread only after ownership and initial synchronization succeed | Continue in thread |
| User cancellation | Settle the request once; no thread is created or opened | Return to invoker |

## 5. Hydrated native history and session operations

### Historical transcript

When opening a cloned child:

1. Keep the thread in `Synchronizing history` until append order, active leaf, selected branch, and effective context projections satisfy the B07 gate.
2. Historical native turns render through provider-neutral message/tool projections.
3. Unknown/custom entries show a bounded disclosure, not raw custom state.
4. Historical native entries never receive fabricated T3 checkpoint references.
5. If effective context cannot be proven, show the persistent fidelity warning before enabling a new prompt.

### Tree and branch actions

Run Details contains a capability-gated session section:

- **Current branch:** selected root-to-leaf path and active leaf.
- **Other branches:** bounded/lazy tree rows when full-tree capability exists.
- **Fork from here:** creates a separately bound child/thread through Pi.
- **Navigate in this session:** hidden unless same-file active-leaf semantics and checkpoint consequences are implemented and advertised.

Each mutation has loading, success, cancellation, failure, and reverse behavior. After successful branch/session replacement, resubscribe before enabling prompts and retain provenance.

### Rename, statistics, and export

- Rename uses a small existing dialog, validates bounded text, and reports provider/T3 sync failure explicitly.
- Statistics are read-only, bounded, and labelled by source; do not equate cumulative session totals with current effective context.
- HTML and JSONL export are separate capability-gated actions.
- Remote export returns a server-managed authorized artifact/download, never a client-selected host path.
- Import follows the same upload/artifact boundary and requires separate authorization and limits.

## 6. Unified Run Details with optional Takomi lens

Use one existing right-panel surface. Implement either an internal segmented view inside the existing Takomi surface or a peer `RightPanelSurface` only after checking current persisted-surface migration. Do not invent nested tab bars.

Reuse `PreviewPanelShell`, its stored width, current minimum/default/max behavior, the existing `980px` sheet transition, and `RightPanelSheet`.

### Generic execution view

Render only canonical events actually received:

- direct bash update/result;
- tool start/update/end with observed provider tool name;
- runtime warnings/errors;
- compaction/retry/queue events when mapped by contracts;
- request/approval/input state;
- connection and reconciliation diagnostics.

Do not fabricate stdout/stderr separation, tool names, stage linkage, exit signal, or timing that the provider did not report. D03 defines both event-count and byte budgets. Truncation copy reports only counters actually retained.

### Optional Takomi workflow lens

Show the Workflow lens only when a negotiated, versioned Takomi presentation envelope supplies workflow identity and state.

```text
Run Details
[Execution] [Workflow]  ← Workflow exists only with Takomi envelope
────────────────────────────────────────
✓ observed tool: read
› observed tool: bash                 Running
! runtime warning                     View details
────────────────────────────────────────
Older activity is unavailable after the retained boundary.
```

- Generic Pi never imports or recognizes Takomi tool names.
- Selecting an inline Takomi activity may open the Workflow lens and select its stable activity ID.
- Ordinary tool activity never auto-opens the panel or steals focus.
- Closing Run Details returns focus to the invoker and preserves the previous panel selection/width.

### Takomi lens sections and controls

The lens is driven only by a versioned Takomi presentation envelope and deterministic Takomi control API from B11. Unsupported sections are omitted; unavailable/loading/error states do not leak into generic Pi contracts.

| Section | Presentation and entry | Actions and terminal states | Return path |
|---|---|---|---|
| Mode | Current mode, reason, and whether switching is permitted | Open a compact selector; preview target; success updates from authoritative Takomi state; cancelled/blocked/failed remains explicit | Return focus to Mode row |
| Workflow | Current Genesis/Design/Build stage, review gate, and bounded progress | Launch/advance only through advertised deterministic actions; confirmation where required; blocked/review-gated is not retried automatically | Return to selected stage/activity |
| Board | Session title, stage progress, bounded task groups, current task, artifacts | Open task detail; status mutations only when supported; stale board triggers refresh rather than optimistic overwrite | Preserve selected task and scroll position |
| Subagents | Parent/child groups, execution shape, model, state, bounded result summary | Preview/confirm launch, status, interrupt, and resume only when advertised; cancel/blocked/paused/completed/failed are distinct | Return to invoking activity or child row |
| Context | Loaded skills/policies, warnings, gates, and bounded context diagnostics | Refresh report when advertised; read-only states never present mutation controls | Return to Context row |
| Routing | Effective provider-qualified model route and thinking level | Preview exact change, then explicit confirm/write; validation failure preserves the proposed values for correction | Return to Routing row |
| Policy | Loaded prerequisite state and bounded reason/source label | Load only through authorized Takomi control; cancellation or blocked prerequisite remains visible | Return to Policy row |
| Todo | Bounded task list with pending/in-progress/completed/blocked state | Use deterministic task actions; never infer completion from prose or retry blocked work automatically | Preserve selected todo row |

Common behavior:

- Loading uses row-level placeholders; one failed section does not blank the rest of Run Details.
- Every mutation shows requested, confirmed, authoritative-success, cancelled, blocked, and failed states as applicable.
- Reconnect marks previously rendered Takomi data `Refreshing…`; controls remain disabled until the envelope/control API resynchronizes.
- Generic fallback renders a bounded extension activity card and `Takomi details unavailable` rather than parsing tool names.
- Closing the lens or panel restores focus to the exact inline card, command, or panel control that opened it.

## 7. Queue, compaction, retry, and bash controls

All controls are capability-gated and use existing composer/command/panel primitives.

| Operation | Entry and behavior | Reverse/failure behavior |
|---|---|---|
| Steer active turn | Sending while the advertised interaction mode is steer labels the action before submission | Failed steer leaves draft recoverable |
| Follow-up queue | Composer labels queued submission and Run Details lists bounded queued items if inspection exists | Remove/reorder only when advertised; cancellation restores editable text when safe |
| Queue mode | Existing provider/thread settings | Show current authoritative mode after reconnect |
| Compact | Registered command/action with confirmation only when needed | Show started/completed/failed; do not mark the turn settled merely because detached compaction began |
| Retry | Run Details action for retryable failure | Show attempt state supplied by provider; do not invent totals |
| Bash | Explicit advanced host-scoped action distinct from agent tools | Abort uses actual `abort_bash` response and observed terminal state; no TTY/curses inference |
| Stop | Existing Stop action | Clear queued work first only where Escape-parity semantics are defined and tested |

## 8. Extension interaction and terminal-only fallback

Do not conflate extension UI requests with shell commands.

### Supported response-bearing RPC UI

- `select`, `confirm`, `input`, and `editor` map to canonical T3 request/dialog surfaces using only fields supplied by Pi 0.84.4.
- Each receives exactly one success, cancellation, timeout, abort, stale, or unsupported settlement.

### Fire-and-forget RPC UI

- `notify(message, notifyType)` maps to bounded notification activity.
- `setStatus(statusKey, statusText)` replaces status by stable key.
- `setWidget(widgetKey, widgetLines, widgetPlacement)` maps to a bounded canonical widget/status surface.
- `setTitle(title)` and `set_editor_text(text)` update only their authorized canonical target.
- No response waiter is fabricated for fire-and-forget methods.

### Terminal-only APIs

Pi RPC mode may degrade terminal-only/custom UI before anything reaches T3. Do not fabricate a TUI-switch event, tool card, signal, external terminal action, or timeout.

When T3 does receive an unsupported response-bearing request, settle it exactly once and show:

> **This Pi extension requested an interaction Takomi Code cannot render safely.** The request was cancelled. See Run Details for bounded compatibility information.

User-launched bash remains ordinary process execution; cancellation follows the actual bash protocol.

## 9. Reconnect and restoration

### State model

| State | Preserved UI | Mutations | Copy |
|---|---|---|---|
| Environment reconnecting | Cached shell/thread, draft, sidebar, settled activity | Send, approvals, and remote mutations disabled; draft remains editable | `Reconnecting to this environment… Live updates are paused.` |
| T3 stream synchronizing | Cached state plus synchronization progress | Mutations disabled | `Checking for missed activity… Replaying updates or loading an authoritative snapshot.` |
| Pi-native reconciling | T3 stream may already be current | New Pi prompt/session mutation disabled | `Reconciling Pi session history before continuing…` |
| Synchronized | Authoritative current state | Enabled by advertised capabilities | No forced toast; remove transient status accessibly |
| Transcript incomplete | Best-known transcript plus persistent warning | Product policy may require acknowledgment before prompting | `Some native Pi activity could not be reconciled. The visible transcript may not represent all context used by Pi.` |

Do not show a fixed retry count unless supplied by the runtime. Do not disable draft editing merely because transport is down. Do not equate socket reconnection with transcript convergence.

Run Details diagnostics may expose bounded stage, duration, close category, replay/snapshot mode, and fidelity state. It never exposes secrets or host paths.

## 10. Release child for CLI handoff

The owned child cannot be safely opened concurrently by another Pi process.

1. User chooses `Release for CLI` from capability-gated session actions.
2. Explain that the active Takomi Code owner must stop and unsent/queued work must settle or be cancelled.
3. Stop the child owner, await shutdown/release, and verify closure.
4. Mark the T3 thread read-only/disconnected from that child until explicitly reacquired through a reviewed flow.
5. Offer a local open action only if the selected environment exposes a secure local launcher. Remote clients otherwise receive copyable non-sensitive instructions, not a host path.
6. Failure to verify release blocks handoff and leaves ownership state explicit.

## 11. Accessibility and interaction requirements

- Use existing T3 dialog, autocomplete, alert, tab/segmented-control, and right-panel primitives.
- Restore focus to the actual invoker after modal/panel close.
- Use native disabled semantics for action controls and explanatory text; do not rely on `aria-disabled` alone.
- Polite live regions announce reconnect/sync transitions; assertive alerts are reserved for clone abort, unrecoverable incompatibility, and fidelity risk requiring attention.
- Respect reduced motion: no pulsing status, continuous repaint, or animated replay.
- Truncated structured metadata has an accessible full bounded value on focus where policy permits.
- Do not globally normalize slashes or redact arbitrary output by string replacement.
- Raw output is bounded and disclosed as potentially sensitive; secret filtering is a separate server policy.
- Any shortcut must use the shared configurable keybinding registry, scoped `when` conditions, and collision handling. Do not hard-code new shortcuts in components.

## 12. Acceptance criteria

### Entry points and capabilities

- Every visible action has an advertised capability and required RPC scope.
- Missing optional capability disables only the dependent action.
- Existing composer, Settings, command-palette, inline activity, and right-panel routes agree.

### Resources

- Commands/templates preserve `/${name}`; skills preserve `/skill:${skillName}`.
- Built-in TUI-only commands and source filesystem paths are not exposed as executable resources.
- Discovery failure is distinguishable from unsupported and does not block normal prompting.

### Clone and ownership

- The modal offers only `Clone into Takomi Code`, never Attach original.
- Opaque IDs cannot be replayed across environments or resolved outside authorized roots.
- Source mutation aborts binding/opening and requires refresh.
- Tests distinguish Takomi-induced non-mutation from legitimate external source mutation.
- Failed child verification has deterministic cleanup/quarantine.
- CLI handoff is unavailable until owner shutdown and release are verified.

### History and session operations

- Append high-water, active leaf, full tree, active branch, and effective context are represented separately.
- Historical entries have no fabricated T3 checkpoints.
- Import/export uses authorized artifacts, not client-supplied host paths.
- Every session mutation resubscribes and converges before prompts re-enable.

### Run Details and Takomi separation

- Generic Pi events render without Takomi installed.
- Generic Pi code contains no `takomi_*` registry or Takomi import.
- Workflow lens appears only from a versioned Takomi presentation envelope.
- Event and byte limits plus truncation behavior are supplied by D03 and enforced before durable/client projection boundaries.

### Extension UI

- Supported response-bearing methods settle exactly once.
- Fire-and-forget methods use exact Pi 0.84.4 fields.
- Terminal-only/custom behavior is not fabricated as a transport event.

### Reconnect

- Draft and cached state remain visible during reconnect.
- Sending and remote mutations remain disabled until T3 stream and Pi-native gates complete.
- Replay gap or overflow forces an explicit authoritative snapshot.
- Transcript-incomplete remains visible and never invents missing ranges.

## 13. User decisions recorded

- **Session continuation:** quick-pick modal.
- **Run Details:** unified execution stream with optional Takomi workflow lens.
- **Terminal-only fallback:** structured unsupported/cancelled disclosure; no embedded terminal or automatic handoff.
