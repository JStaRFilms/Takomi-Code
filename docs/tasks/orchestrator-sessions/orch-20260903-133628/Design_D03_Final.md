# D03: Extension Interaction, Accessibility, and Performance Contract

**Status:** Final review candidate
**Product/UX owner:** Orchestrator
**Applies to:** web, Electron desktop, and native mobile
**Depends on:** `Design_D01_Final.md`, `Design_D02_Final.md`

## 1. Contract goals

1. Represent every Pi 0.84.4 RPC extension UI method using only fields Pi actually supplies.
2. Settle every response-bearing request exactly once across response, cancellation, timeout, abort, reconnect, and process exit.
3. Give fire-and-forget methods bounded canonical T3 surfaces without fabricating response waiters.
4. Preserve generic Pi behavior without Takomi installed; apply Takomi semantics only through a negotiated versioned envelope/control contract.
5. Bound data before durable T3 persistence and again before client projection/rendering.
6. Keep interaction usable with keyboard, touch, screen readers, dynamic type, reduced motion, slow devices, and remote connections.
7. Degrade terminal-only and unknown behavior explicitly rather than hanging or pretending to reproduce the TUI.

## 2. Exact Pi 0.84.4 method table

### Response-bearing methods

| Method | Accepted fields | Canonical web/desktop surface | Canonical mobile surface | Response |
|---|---|---|---|---|
| `select` | `title`, string `options`, optional timeout in milliseconds | Existing request dialog with searchable virtualized single-select list | Native full-screen/form-sheet selection route using current platform convention | T3 may write `{ value: <selected string> }` or `{ cancelled: true }`; Pi timeout/abort resolves extension-side to `undefined` without a dedicated timeout response |
| `confirm` | `title`, `message`, optional timeout in milliseconds | Existing confirmation request dialog | Existing native confirmation sheet/dialog | T3 may write `{ confirmed: <boolean> }` or `{ cancelled: true }`; Pi timeout/abort resolves extension-side to `false` without a dedicated timeout response |
| `input` | `title`, optional `placeholder`, optional timeout in milliseconds | Existing single-value input request dialog | Native input sheet/route | T3 may write `{ value: <text> }` or `{ cancelled: true }`; Pi timeout/abort resolves extension-side to `undefined` without a dedicated timeout response |
| `editor` | `title`, optional `prefill`; Pi 0.84.4 RPC supplies no timeout/signal field for this method | Existing large text editor request dialog | Full-screen native editor route | T3 may write `{ value: <text> }` or `{ cancelled: true }` |

No description, preview, default, multi-select, option object, validation schema, severity, or rich content is invented. Future fields appear only after explicit version/capability negotiation.

### Fire-and-forget methods

| Method | Accepted fields | Canonical mapping |
|---|---|---|
| `notify` | `message`, optional `notifyType` | Bounded transient notification plus retained Run Details activity when policy permits |
| `setStatus` | `statusKey`, optional `statusText` | Replace keyed provider status; `statusText: undefined` clears that live keyed status |
| `setWidget` | `widgetKey`, optional `widgetLines`, optional `widgetPlacement` | Replace keyed bounded text widget; `widgetLines: undefined` clears that live keyed widget; placement is a canonical layout hint, never arbitrary UI execution |
| `setTitle` | `title` | Provider-session/Run Details display title only; it does not silently rename the T3 thread |
| `set_editor_text` | `text` | Update the active session composer draft only when safe; otherwise create an explicit Pi-suggested draft requiring user application |

Fire-and-forget methods never create approval/request state and never wait for a client response.

## 3. Selected presentation architecture

### Response-bearing request

```text
Select a target                                      Esc
┌──────────────────────────────────────────────────────┐
│ Pi extension                                         │
│ Choose deployment environment                        │
│ [ Search options…                                  ] │
│ > staging                                            │
│   production                                         │
│   local                                              │
│                                                      │
│ Expires in 42 seconds                                │
│                              Cancel    Select         │
└──────────────────────────────────────────────────────┘
```

- Use the existing T3 request/approval pipeline and platform-native presentation.
- Inline tool/activity state shows `Waiting for input` and opens the same request.
- Only one client can win resolution. Other clients observe the authoritative resolved state.
- The dialog/sheet does not become a custom Pi mini-application.

### Keyed status and widget area

```text
Run Details · Execution
──────────────────────────────────────
Status
  build       Running focused tests
  reviewer    Waiting for approval

Extension details
  test-results
  18 passed
  0 failed
──────────────────────────────────────
Older/omitted content is disclosed here.
```

- Status and widget keys replace prior values instead of appending an unbounded stream.
- Compact inline activity displays the latest meaningful state; full retained bounded state lives in Run Details.
- `widgetPlacement` chooses an allowed canonical region only. It cannot inject HTML, React, terminal cells, or arbitrary layout.

### Generic and Takomi-enhanced rendering

```text
Generic Pi                          Takomi available
Execution                           Execution | Workflow
- tool activity                     - same generic activity
- requests                          - versioned board/subagent/context detail
- keyed statuses                    - deterministic Takomi controls
- bounded widgets                   - no tool-name inference
```

Generic Pi contracts carry provider-neutral request/activity/status/widget data. Takomi-specific cards and Workflow sections require a versioned Takomi presentation envelope. Generic Pi code must not recognize `takomi_*`, extension package names, board schemas, or workflow names.

## 4. Per-method interaction behavior

### `select`

- Search appears when option count or available viewport warrants it; search is local over the already-bounded option list.
- One highlighted option uses stable option index plus request identity; duplicate labels remain distinguishable internally without changing visible strings.
- Enter/primary action returns the exact selected string.
- Confirmation is disabled until a valid option is selected.
- If options exceed ingress limits, do not show an incomplete selectable set; reject the request as over-limit/unsupported and settle once.

### `confirm`

- Preserve title and message as plain text.
- Primary/secondary ordering follows existing T3 confirmation conventions, not inferred danger severity.
- Escape/back/cancel resolves cancellation exactly once.
- Do not reinterpret confirmation as a complete sandbox or permission boundary.

### `input`

- Preserve optional placeholder; do not treat it as a default value.
- Preserve user text locally while the request is open.
- Submit returns text exactly as entered within response limits.
- Empty text and cancellation remain distinct if Pi’s response schema distinguishes them.

### `editor`

- Use a large plain-text editor, not arbitrary syntax-aware terminal emulation.
- Optional prefill is initial content. Once the user edits, reconnect/replay may not overwrite it.
- Mobile uses a full-screen route; web/desktop uses the existing large dialog/editor pattern.
- Warn before discarding changed editor content on cancel/back using existing dirty-form conventions.

### `notify`

- Known `notifyType` values map through the existing notification semantic system; unknown values use neutral presentation and remain available in bounded diagnostics.
- Repeated identical notifications may be summarized after rate limits, but the summary states that messages were grouped.
- Notifications never steal focus or create modal dialogs.

### `setStatus`

- `(session, statusKey)` is the replacement identity.
- Update existing row in place; do not append one activity per high-frequency status update.
- Pi 0.84.4 clearing is exact: `statusText: undefined` removes the live keyed status. An empty string remains a supplied value unless Pi itself normalizes it.
- On owner-generation end, clear all live keyed statuses. A separate bounded activity/diagnostic record may retain the last observed value, but it is never rendered as live.

### `setWidget`

- `(session, widgetKey)` is the replacement identity.
- `widgetLines` render as plain text lines with preserved line boundaries; no ANSI/HTML/Markdown execution unless a future explicit safe format is negotiated.
- `widgetPlacement` maps to the nearest allowed T3 region and is disclosed as approximate where layout differs.
- Pi 0.84.4 clearing is exact: `widgetLines: undefined` removes the live keyed widget.
- On owner-generation end, clear all live keyed widgets. A separate bounded activity/diagnostic record may retain the last observed value, but it is never rendered as live.
- Over-limit widgets are truncated only for noninteractive display with a visible disclosure; if omitted text could affect a response, the request must fail instead.

### `setTitle`

- Updates a transient provider-session/Run Details title.
- It does not rename the durable T3 thread, project, board, or native session unless a separate explicit action/capability defines synchronization.
- Reconnect restores the latest authoritative provider title where available.

### `set_editor_text`

- The canonical server state is a versioned `Pi suggested composer text` record tied to environment, thread, owner generation, and update sequence; it is not a blind draft mutation broadcast.
- Web/desktop shows a compact suggestion row immediately above the active composer. Mobile shows the same row above the composer and opens Preview as the existing full-screen text route.
- Accessible name: `Pi suggested composer text`; accessible status includes whether it is new, previewed, applied, superseded, dismissed, or stale.
- If the active same-thread draft is empty and unchanged since the update’s causal point, `Apply` may populate it without moving focus.
- If user-authored text exists or causality cannot be proven, preserve it and offer `Preview`, `Replace`, and `Dismiss`. `Replace` uses the existing dirty-draft confirmation pattern.
- Preview never moves focus automatically; user activation opens it and close returns focus to the invoking suggestion action.
- Suggestion state survives client reconnect while its owner generation remains current. A newer `set_editor_text` supersedes the prior suggestion by sequence.
- Applying or dismissing on one client produces authoritative suggestion state; other clients remove/mark the suggestion accordingly but never overwrite their local user-authored draft.
- Owner-generation end marks any unapplied suggestion stale and removes its live action after bounded diagnostic retention.

## 5. Exactly-once settlement state machine

Each response-bearing request has a durable canonical identity tied to environment, provider session generation, Pi request ID, and method. The guarantee is **one durable terminal T3 transition plus at-most-one Pi response write attempt for the fenced live generation**. T3 cannot atomically prove that a child process received the write.

```text
received
  ├─ invalid/over-limit/negotiated unsupported ─→ settling(cancelled)
  ├─ presented ─→ user response ───────────────→ settling(value/confirmed/cancelled)
  ├─ presented ─→ receipt-relative expiry ─────→ settling(cancelled)
  ├─ presented ─→ turn abort/session stop ─────→ settling(cancelled)
  └─ presented ─→ process exit ────────────────→ terminal locally(process-exit)

settling ── compare-and-set winner ──→ terminal record retained
late/duplicate client response ──────→ idempotent existing terminal result
```

Rules:

1. Insert pending identity before emitting client-visible request state.
2. Resolution uses one atomic compare-and-set transition shared by every terminal cause; do not delete the terminal record immediately.
3. Retain the terminal idempotency record for at least the provider session lifetime and through the configured replay/reconnect window; later compaction may keep only the durable resolved event.
4. The winning path attempts at most one Pi `extension_ui_response` write when the process/generation is still writable. Pi 0.84.4 wire outcomes use only the method’s `value`, `confirmed`, or `cancelled: true`; there is no wire-level `unsupported` or `timeout` result.
5. T3 persists one canonical terminal event even when Pi already exited or the response-write outcome is unknown.
6. Duplicate/late responses return the existing terminal result and never attempt a second Pi response write.
7. Process generation fencing rejects responses for a stopped or superseded Pi owner.
8. Session replacement settles or transfers requests only according to tested protocol semantics; never carry a request to a different native session by matching title/text.
9. An unknown method is response-bearing only when negotiated version metadata declares it so. An ID alone is insufficient because fire-and-forget messages also carry IDs. Otherwise emit a bounded diagnostic without responding.

## 6. Timeout, reconnect, abort, and stale behavior

### Timeout

- Pi’s optional `timeout` is milliseconds. Pi starts its own timer before emitting the UI request and does not emit a dedicated timeout-completion event.
- T3 records receipt monotonic time and computes a receipt-relative approximate deadline for stale-UI cleanup. It cannot claim this exactly matches Pi’s timer because transport time has already elapsed.
- Client derives its display countdown from that approximate deadline without sending per-second updates and labels it `May expire in …`.
- Announce time remaining at coarse thresholds only: initial when under one minute, 30 seconds, and 10 seconds. Do not announce every second.
- Background/mobile suspension does not pause Pi’s timer or T3’s approximate deadline.
- At the T3 deadline, disable controls and run the common cancellation transition. If the generation remains writable, the only timeout-compatible Pi 0.84.4 write is `cancelled: true`; Pi may already have timed out independently.
- Requests without a Pi timeout have no invented countdown. A separate documented T3 safety timeout requires explicit policy/capability and still settles with a Pi-compatible cancellation shape.

### Client disconnect/reconnect

- Pending request remains server-owned while the Pi process remains alive.
- Reconnecting clients hydrate the same canonical request identity and remaining expiry.
- Locally typed but unsubmitted input may be restored only on the same client and request identity.
- A stale UI response after another client/timeout wins is rejected idempotently.
- Reconnect never resets timeout or creates a new request ID.

### Turn abort/session stop/process exit

- Abort/stop settles all affected pending requests through the common resolver before or while crossing the process boundary.
- If Pi exits first, mark request resolved with process-exit reason; do not leave a waiter or interactive card active.
- On owner-generation end, clear the live keyed status/widget collections deterministically. Preserve any last-observed value only in separately labelled bounded history/diagnostics.

## 7. Accessibility contract

### Focus

- Opening a response-bearing request moves focus to the first meaningful control: selected option/search, confirm primary only per existing convention, input field, or editor.
- Closing restores focus to the exact invoking activity/composer control when it still exists; otherwise to the thread composer.
- Background fire-and-forget updates never move focus.
- Another-client resolution closes/disables the request and announces the outcome without moving focus unexpectedly.

### Keyboard and touch

- Reuse shared dialog/autocomplete/editor commands and configurable keybinding infrastructure.
- Escape/back means cancel only when cancellation is valid; dirty editor content receives the standard discard check.
- Select uses standard listbox/collection semantics with stable active descendant/roving focus from the chosen primitive.
- Mobile targets follow existing platform component minimums and safe-area behavior.

### Screen readers

- Request arrival: polite announcement with method-neutral wording, escalating only when existing approval policy classifies it as urgent.
- Timeout/abort/unsupported: one concise terminal announcement.
- Status/widget replacement announces only meaningful text changes, coalesced; unchanged values are silent.
- Truncation disclosure is included in the accessible description.
- Status always has text/icon semantics and never depends on color.

### Dynamic type and reduced motion

- Reflow option rows/actions before labels clip; editor and message content remain scrollable.
- Use native platform text scaling and accessibility categories.
- No continuously pulsing widget/status animation.
- Reduced motion replaces spinner/pulse loops with static status plus infrequent text updates.

## 8. Explicit performance and payload budgets

These are initial contract limits for B03/B10/B14/B15. Focused tests enforce them; B19 profiles representative long sessions. A measured regression may change a number through a reviewed contract version, not an unbounded exception.

### A. Transport and ingress limits

| Data | Limit | Over-limit behavior |
|---|---:|---|
| Absolute undelimited Pi stdout/RPC safety ceiling | 64 MiB | Stop the affected transport generation with a bounded resource-limit error; preserve the session file and mark incomplete rather than quarantining the session itself |
| Normal streaming/control/UI RPC record | 8 MiB UTF-8 soft operation limit | Fail that operation/generation visibly; use the 64 MiB absolute parser ceiling to avoid unbounded accumulation |
| Unpaged `get_entries` / `get_tree` / large history response | 32 MiB provisional operation limit | Fail the history operation as incomplete without claiming the active session is corrupt; prefer the paginated/streaming public host boundary |
| Paged host history/tree response | 4 MiB and 500 entries per page | Require next-page cursor; never aggregate unbounded pages in one client response |
| Extension UI request total decoded payload | 1 MiB | Settle negotiated response-bearing request with Pi-compatible cancellation; drop fire-and-forget update with diagnostic |
| Generic dynamic tool args or result admitted to T3 canonical event | 1 MiB each | Persist bounded head/tail projection plus truncation metadata; native Pi session remains source of full data |
| Single user response from client | Input: 64 KiB; editor: 512 KiB UTF-8 | Prevent submission and explain limit; preserve editable local value |

The parser requires a finite absolute ceiling, but stock Pi can legitimately return large `get_entries`, `get_tree`, or tool-result lines. B02 must measure synthetic/real copied fixtures and may revise method-specific limits before release. Aggregate request limits must remain larger than every allowed field plus JSON/UTF-8 overhead. Oversized history produces an operation failure/fidelity disclosure, not automatic session corruption or deletion.

### B. Method field limits

| Field | Limit |
|---|---:|
| Title/key/method identifier | 256 Unicode code points; keys additionally 512 UTF-8 bytes |
| Confirm message / notify / status text | 16 KiB UTF-8 each |
| Input placeholder | 2 KiB UTF-8 |
| Editor prefill | 512 KiB UTF-8 |
| Select options | 500 options, 2 KiB UTF-8 each, 256 KiB total option bytes |
| Widget lines | 200 lines, 2 KiB each, 128 KiB total line bytes |

An interactive `select` must never silently omit options. If any option/count/total exceeds the limit, settle the request over-limit rather than presenting an incomplete choice.

### C. Canonical presentation limits

Keep the useful current baselines while removing unbounded exceptions:

| Projection | Limit |
|---|---:|
| Compact summary text | 600 characters maximum; prefer existing sub-500-byte activity projection where applicable |
| Inspector/detail text | 16,000 characters |
| Reasoning detail projection | 16,000 characters |
| Summary items | 12 |
| Retained activity per presentation envelope | Latest 120, with `activityTruncated` |
| Artifact references per compact envelope | 8 |
| Recent subagent messages/tool calls in one completed result | Latest 80 each |
| Todo/board rows in compact summary | 12 |
| Todo/board rows per detail page | 50 |
| Total active/non-deleted todo rows retained in client projection | 500; beyond this require server pagination/summary |
| Session/history/tree list page | 50 rows |

Remove the current effectively infinite todo item limit. Counts represent authoritative totals only when the server actually retains/knows them; otherwise copy says `showing retained items` without a fabricated total.

### D. Update/coalescing budgets

| Stream | Foreground budget | Background/hidden behavior |
|---|---:|---|
| Same-key `setStatus`/`setWidget` replacement | Coalesce to at most 10 delivered updates/sec/key; last write wins within window | Retain latest only; deliver on foreground/resync |
| Tool progress/detail replacement | Align with existing 50 ms coalescing minimum, but clients render at most 10 semantic updates/sec/item | Retain terminal/latest state; no animation loop |
| Notifications | At most 20 visible notifications per 10 sec/session; excess grouped into one summary activity | No transient toast; retain bounded summary |
| Screen-reader live announcements | At most one nonterminal update per 2 sec/region | Announce terminal/request states on foreground if still relevant |
| Takomi activity envelope | Latest 120 activities; incremental stable-ID updates | Hydrate bounded terminal/latest state |

Coalescing may collapse intermediate nonterminal replacements but must never collapse terminal request settlement, errors requiring action, or final tool/request state.

### E. Client rendering and paging

- Virtualize option lists above 50 items and history/task lists at all potentially large sizes.
- Render at most one expanded 16,000-character detail per small-screen Run Details viewport by default; additional details open lazily.
- Fetch next 50-row page only on explicit scroll/load demand.
- Keep stable identities; update rows in place rather than rebuilding full history.
- No client rescans the entire thread on each streaming update.
- No continuously repainting progress animation.

## 9. Truncation and disclosure

Every bounded projection carries:

- `truncated: true` or equivalent typed flag;
- retained boundary/direction where known (`latest`, `head-tail`, page cursor);
- authoritative total only when actually known;
- safe action: load next authorized page, open bounded detail, or acknowledge that full data is available only in Pi’s native session.

Canonical copy:

- `Showing the latest 120 activities.`
- `Detail shortened for performance and safety.`
- `Additional options could not be presented safely; the request was cancelled.`
- `Showing retained items; the full total is unavailable.`

Never show `View full` unless an authorized bounded retrieval path exists. Never imply truncation changed Pi’s native context; it limits only T3 persistence/projection unless the protocol generation itself was rejected.

## 10. Exact RPC-mode behavior for terminal/TUI APIs

Do not fabricate a per-invocation event, cancellation, or diagnostic for APIs Pi handles locally without transport output.

| Extension UI API | Pi 0.84.4 RPC-mode behavior |
|---|---|
| `onTerminalInput` | Returns a no-op unsubscribe function; no event |
| `setWorkingMessage` | No-op; no event |
| `setWorkingVisible` | No-op; no event |
| `setWorkingIndicator` | No-op; no event |
| `setHiddenThinkingLabel` | No-op; no event |
| `setWidget` with string array or `undefined` | Emits `setWidget`; `undefined` clears |
| `setWidget` with component factory | Ignored; no event |
| `setFooter` / `setHeader` | No-op; no event |
| `custom` | Resolves `undefined`; no event |
| `pasteToEditor` | Delegates to `setEditorText`, therefore emits `set_editor_text` |
| `setEditorText` | Emits `set_editor_text` |
| `getEditorText` | Returns empty string synchronously |
| `addAutocompleteProvider` | No-op; no event |
| `setEditorComponent` | No-op; no event |
| `getEditorComponent` | Returns `undefined` |
| `theme` getter | Returns Pi’s locally loaded theme helper; no event |
| `getAllThemes` | Returns an empty array |
| `getTheme` | Returns `undefined` |
| `setTheme` | Returns `{ success: false, error: "Theme switching not supported in RPC mode" }` |
| `getToolsExpanded` | Returns `false` |
| `setToolsExpanded` | No-op; no event |

Takomi Clarify uses preview-only plus explicit confirmation through B11’s deterministic control path; it does not depend on `custom()` remotely. User-launched bash remains ordinary process execution and cancellation follows the actual bash protocol.

## 11. Error and unsupported states

| State | User-visible behavior |
|---|---|
| Negotiated unknown response-bearing method | Request card: `This interaction is not supported by this client version.` Settle once using Pi-compatible `cancelled: true` |
| Unknown method without negotiated response metadata | Bounded provider-neutral Run Details compatibility warning; do not infer a waiter from `id` and do not respond |
| Invalid field shape | Reject before persistence; bounded method/request diagnostic; settle if response required |
| Over-limit interactive request | Do not render partial controls; settle with Pi-compatible cancellation once |
| Stale generation | Reject response; show already resolved or session-replaced state |
| Client loses authorization | Close sensitive detail, keep bounded nonsecret terminal state, and do not send response from unauthorized client |
| Terminal-only/custom API degraded inside Pi | Apply §10’s exact local no-op/return/delegation table; there is no per-invocation event T3 can settle or diagnose |
| Process exits with request open | Resolve card as `Pi process ended before a response was delivered`; no leaked waiter |

## 12. Cross-surface acceptance scenarios

1. The same `select` request opened on web and mobile resolves from one client; the other closes as already answered and T3 attempts at most one Pi response write for the fenced generation.
2. A request times out while mobile is backgrounded; foreground hydration shows timeout, not a fresh request.
3. Reconnect during a dirty editor request restores server request identity and preserves same-client unsubmitted text without overwriting it from replay.
4. Abort and timeout racing produce one terminal T3 event and at most one Pi response.
5. Pi process exit clears every pending waiter and terminalizes keyed status/widget state.
6. A 501-option select is rejected rather than showing an incomplete list.
7. Repeated status/widget updates stay within queue/render budgets and final text matches the last authoritative update.
8. Notification storm groups excess messages without focus theft or live-region spam.
9. A 501-row todo list is paged/bounded; compact cards remain 12 rows and do not rescan full thread history.
10. Generic Pi renders all canonical methods with Takomi absent.
11. A versioned Takomi envelope adds Workflow sections without changing generic Pi transport contracts.
12. Unknown methods and terminal-only behavior never leave a turn waiting silently.

## 13. Implementation handoff

- B03 enforces framing, generation fencing, ingress validation, durable payload bounds, and waiter cleanup.
- B03A ensures reconnect/backpressure cannot duplicate or strand request state.
- B10 implements exact method mapping and settlement.
- B11 supplies deterministic versioned Takomi presentation/control APIs.
- B13/B15 implement the selected surfaces using existing web/mobile primitives.
- B14 applies stable-ID incremental Run Details rendering.
- B19 verifies all races, limits, clients, and connection modes.

No additional product decision is required before Build. The selected contract favors existing request primitives, keyed canonical status/widget surfaces, and explicit bounded failure over partial or fabricated parity.
