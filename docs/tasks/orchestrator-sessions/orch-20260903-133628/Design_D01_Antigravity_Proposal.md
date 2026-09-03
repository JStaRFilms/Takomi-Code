# D01 UI/UX Design Specification: Takomi Code × Pi Runtime Integration

**Status:** Ready for Review
**Role:** Lead UI/UX Designer
**Scope:** Entry Points, Session Forking (Clone-Only), Run Details (Generic vs. Takomi-Enhanced), State Lifecycle, Path Sanitization, and Accessibility.

---

## 1. Information Architecture & Exact Entry Points

The integration adheres strictly to T3 Code’s restrained aesthetic: standard 32px toolbars, 12px/13px typography, monochrome and semantic state badges, compact inline cards (`TakomiToolCallCard`), and the contextual right panel (`TakomiInspector`). No standalone "Pi Dashboard" or auxiliary top-level navigation is introduced.

```
+-----------------------------------------------------------------------------------+
| Top App Bar: [Workspace: backend] [Branch: main]     [Transport: ● Synchronized]  |
+---------------------------------------------------+-------------------------------+
| Central ChatView & Composer                       | Contextual Right Panel        |
|                                                   | [Inspector] [Run Details] (X) |
|  - Active conversation stream                     |-------------------------------|
|  - [TakomiToolCallCard: pi:bash (completed)]      | Subagent DAG / Pi Stream      |
|  - Inline Reconnect / Sync Banner (conditional)   | Bounded terminal chunk log    |
|                                                   | Provenance & Snapshot Info    |
|---------------------------------------------------|                               |
| Composer:                                         |                               |
| [/ command menu] [Provider: Pi 0.84.4] [Model: ▾] |                               |
+---------------------------------------------------+-------------------------------+
```

### 1.1 Pi Resources Discovery & Scoping
Pi commands, templates, and skills are strictly scoped to the active workspace environment. They surface exclusively inside existing invocation vectors:

*   **Slash Command Menu (`/` in Chat Composer):**
    *   Typing `/` displays unified results sorted alphabetically and categorized with discrete trailing badges.
    *   Badge styling: `10px font`, neutral tint (`var(--badge-bg-subtle)`).
    *   *Examples:*
        *   `/refactor` → `[Pi Skill]`
        *   `/review-pr` → `[Pi Template]`
        *   `/exec` → `[Pi Command]`
*   **Command Palette (`Cmd+K` / `Ctrl+K`):**
    *   Scoped actions:
        *   `Pi: Run Command...`
        *   `Pi: Apply Template...`
        *   `Pi: Continue Previous Session...`
        *   `Pi: Refresh Workspace Skills`
*   **Settings Provider Panel (`Settings > Providers > Pi Runtime`):**
    *   Read-only metadata block: Daemon socket status, Pi version (`0.84.4`), active execution target (`Local Daemon` or `Remote Container`), and workspace sandbox root.

### 1.2 "Continue a Pi Session" Entry Points
*   **Composer Thread Menu:** In an empty conversation state, an action tile appears beside default suggestions: `[ Fork Pi Session ]`.
*   **Command Palette:** `Pi: Continue Previous Session...` triggers the session picker.
*   **Session Switcher / History Dropdown:** Secondary action item at the bottom of the active session menu: `Import / Fork from Pi...`.

### 1.3 Run Details Contextual Entry Points
*   **Inline Tool Calls:** Inside any `TakomiToolCallCard`, a trailing link button reads `View Run Details ↗` (`aria-label="Open run details in right panel"`).
*   **Right Panel Header Tabs:** An auxiliary tab `[Run Details]` activates dynamically whenever a Pi tool run, subagent session, or command execution is active.
*   **Status Bar (Bottom Right):** Compact run indicator: `Pi: Executing (12s) → [Details]`.

### 1.4 Reconnect State Indicator
*   **Persistent Status Dot:** Located in the global top right metadata bar beside the active environment name.
    *   `● Synchronized` (Static green, `#10B981`)
    *   `◌ Reconnecting (Attempt 2/5)` (Pulsing amber, `#F59E0B`)
    *   `↻ Resynchronizing...` (Rotating blue arrow, `#3B82F6`)
    *   `▲ Incomplete Transcript` (Static yellow caution, `#EAB308`)
*   **ChatView Inline Sticky Banner:** Appears immediately above the active message list when transport breaks or desynchronization occurs.

---

## 2. Session Picker + Clone-Only Safety

### Technical Constraint
Pi 0.84.4 lacks an enforceable cross-process writer lock on native session SQLite/JSONL storage. Attaching an active session concurrently leads to split-brain log corruption and race conditions. **Session continuation is strictly clone-only.** The UI must never offer an "Attach Original" action.

---

### Alternative A: Centered Modal Dialog with Side-by-Side Provenance (Recommended)

A structured, high-clarity modal dialog prioritizing provenance inspection and explicit safety verification before disk snapshotting.

#### ASCII Wireframe
```
+--------------------------------------------------------------------------+
| Continue Pi Session (Clone Only)                                     [X] |
+--------------------------------------------------------------------------+
| Search sessions by ID, prompt, or date... [/]                            |
+------------------------------------+-------------------------------------+
| Recent Sessions                    | Snapshot Provenance Preview         |
|                                    |                                     |
| > sess_01HXYZ... 2m ago            | Session: sess_01HXYZ9923ABC4        |
|   "Fix auth token refresh..."      | Created: Today, 14:12 (2 mins ago)  |
|   [2 tools] [8 turns]              | Turns: 8 messages | Tool calls: 2   |
|                                    | Host Target: [Host] backend-worker  |
|   sess_01HXYM... 1h ago            | Last Command: pi:bash (exit code 0) |
|   "Scaffold database migra..."     | Raw Host Path: [Sanitized Host Env] |
|   [14 tools] [22 turns]            |-------------------------------------|
|                                    | (i) Clone-Only Safety               |
|   sess_01HXYA... Yesterday         | Original sessions cannot be live-   |
|   "Docker healthcheck scripts"     | attached because Pi 0.84.4 lacks a  |
|   [1 tool] [4 turns]               | writer lock. A separate snapshot    |
|                                    | fork will be created in this        |
|                                    | workspace. Original remains intact. |
+------------------------------------+-------------------------------------+
| [Esc] Cancel                                     [ Clone & Resume Fork ] |
+--------------------------------------------------------------------------+
```

#### Exact UI Copy & Microcopy
*   **Header Title:** `Continue Pi Session (Clone Only)`
*   **Search Placeholder:** `Search sessions by ID, prompt, or date...`
*   **Provenance Info Banner:** `(i) Clone-Only Safety: Original sessions cannot be live-attached because Pi 0.84.4 lacks an enforceable writer lock. A distinct clone snapshot will be created in your workspace. The original session is preserved without modification.`
*   **Primary CTA:** `Clone & Resume Fork`
*   **Secondary Action:** `Cancel`

#### Trade-offs
*   *Pros:* Explicitly surfaces immutable source provenance; eliminates accidental assumption of live attaching; provides ample layout space for sanitized environment labels and session statistics.
*   *Cons:* Slightly higher interaction cost (modal layer over the editor).

---

### Alternative B: Compact Command Sheet / Flyout Picker

An ultra-compact, keyboard-driven popover originating directly from the composer.

#### ASCII Wireframe
```
+--------------------------------------------------------------------------+
| Continue Pi Session: Select a session to fork                            |
+--------------------------------------------------------------------------+
| [ Search Pi history...                                                 ] |
|--------------------------------------------------------------------------|
| sess_01HXYZ... Fix auth token refresh (2m ago)     [Clone Fork ->]       |
|   Origin: [Host] backend-worker | 8 turns | 2 tools                      |
|--------------------------------------------------------------------------|
| sess_01HXYM... Scaffold database migrations (1h ago) [Clone Fork ->]     |
|   Origin: [Host] backend-worker | 22 turns | 14 tools                    |
|--------------------------------------------------------------------------|
| ! Notice: Direct attach unavailable (Pi 0.84.4 writer concurrency).      |
|   Selecting an item safely forks history into a new local session.       |
+--------------------------------------------------------------------------+
| [↑↓] Navigate   [Enter] Fork & Open   [Esc] Dismiss                      |
+--------------------------------------------------------------------------+
```

#### Exact UI Copy & Microcopy
*   **Header Title:** `Continue Pi Session: Select a session to fork`
*   **Row Badge:** `[Clone Fork ->]`
*   **Footer Notice:** `! Notice: Direct attach unavailable (Pi 0.84.4 writer concurrency). Selecting an item safely forks history into a new local session.`

#### Trade-offs
*   *Pros:* Extremely fast; fits natively into standard command-palette mechanics.
*   *Cons:* Limited horizontal space to display sanitized host origins and detailed execution metadata; users may mistake the quick action for an in-place resumption.

---

### Recommendation: Alternative A
**Alternative A is recommended.** Forking an agent session creates a permanent fork in persistent state. The side-by-side modal offers space to communicate source provenance, sanitized paths, turn counts, and the architectural reason why "Attach Original" is disallowed.

---

## 3. Generic Pi Activity vs. Takomi-Enhanced Run Details

Run Details must cleanly handle two operational modes:
1.  **Generic Pi Activity:** Standard CLI/daemon execution consisting of sequential bash commands, stdin/stdout streams, tool calls, and text deltas.
2.  **Takomi-Enhanced Activity:** Orchestrated runs involving task DAG boards, subagent delegation, automated review gates, and context synthesis.

---

### Alternative 1: Unified Activity Stream with Collapsible Facet Drawers

A single chronological stream in the right panel where Takomi-specific orchestrations appear as inline collapsible cards directly in the log.

#### ASCII Wireframe
```
+---------------------------------------------------------------+
| RUN DETAILS: run_8819af                                   [X] |
+---------------------------------------------------------------+
| Status: In Progress (45s)           Tokens: 4.2k | Cost: $0.03|
| Target: Pi Local Runtime (0.84.4)                             |
+---------------------------------------------------------------+
| [v] Takomi Orchestration: 3-Stage Plan                        |
|   [✓] 1. Research & Analysis (subagent: parser-01)            |
|   [●] 2. Implementation: Modify token validator               |
|   [ ] 3. Automated Code Review                                |
+---------------------------------------------------------------+
| Raw Stream Log                                 [Filter: All ▾]|
| 14:22:01 [pi:read_file] path="src/auth.ts"                    |
| 14:22:04 [pi:bash] $ pnpm test:auth                           |
|          > auth.test.ts: Failed at line 42                    |
| 14:22:10 [subagent:parser-01] Emitted context patch (1.2kb)   |
| 14:22:15 [pi:replace_file_content] applied to src/auth.ts     |
+---------------------------------------------------------------+
| [|| Pause Stream]   [Copy Log]   [Wrap Text: On]              |
+---------------------------------------------------------------+
```

#### Trade-offs
*   *Pros:* Strict chronological timeline; developer does not need to switch tabs to correlate a tool error with an orchestration step.
*   *Cons:* When subagents produce heavy output, the orchestration structure quickly gets pushed out of view.

---

### Alternative 2: Segmented Header Tabs (Stream vs. Orchestration Board) (Recommended)

A bifurcated view inside the `TakomiInspector` right panel using a segmented pill control: `[ Activity Log ]` and `[ Orchestration Board ]`.

#### ASCII Wireframe: Activity Log View (Generic Pi Run)
```
+---------------------------------------------------------------+
| RUN DETAILS                                               [X] |
+---------------------------------------------------------------+
| View: [ Activity Log ]  ( Orchestration Board - N/A )        |
+---------------------------------------------------------------+
| Run ID: pi_run_01HJ...               Status: Running (18s)    |
| Exec: generic_pi_worker              Buffer: 124 lines        |
+---------------------------------------------------------------+
| CHRONOLOGICAL ACTIVITY                                        |
| 14:02:11  tool:call     pi:grep_search "validateSession"      |
| 14:02:12  tool:result   Found 3 matches across 2 files       |
| 14:02:14  tool:call     pi:edit_file src/session.ts           |
| 14:02:15  stdout        [chunk 256b]                          |
| 14:02:16  tool:result   Applied diff chunk 1-12               |
+---------------------------------------------------------------+
| Command Stdout (Active)                                       |
| > eslint src/session.ts                                       |
|   12:5  warning  Unexpected any. Specify a different type.    |
|                                                               |
+---------------------------------------------------------------+
| [ Auto-scroll: On ]                       [ Export Raw Log ]  |
+---------------------------------------------------------------+
```

#### ASCII Wireframe: Orchestration Board View (Takomi-Enhanced Run)
```
+---------------------------------------------------------------+
| RUN DETAILS                                               [X] |
+---------------------------------------------------------------+
| View: ( Activity Log )  [ Orchestration Board ]               |
+---------------------------------------------------------------+
| Takomi Plan: Refactor Auth Middleware       Status: Active    |
+---------------------------------------------------------------+
| STAGES & SUBAGENTS                                            |
| [✓] Discovery (subagent_discovery)                            |
|     ↳ Scanned 14 files, isolated token race condition         |
|                                                               |
| [●] Patch Application (subagent_coder)                        |
|     ↳ Modifying `src/auth.ts`                                 |
|     ↳ Active Pi Tool: replace_file_content                    |
|                                                               |
| [ ] Verification & Review                                     |
|     ↳ Awaiting test run completion                            |
+---------------------------------------------------------------+
| Context Memory Shared: 2 items (4.1kb)                        |
| [ Inspect Context Cache ]                 [ Abort Workflow ]  |
+---------------------------------------------------------------+
```

#### Exact UI Copy & Microcopy
*   **Segmented Control Labels:** `Activity Log` | `Orchestration Board`
*   **Disabled State Tooltip (when non-Takomi run):** `Orchestration board unavailable: Run is executing in generic Pi mode without a multi-stage workflow.`
*   **Stage Status Pills:** `[✓ Completed]`, `[● In Progress]`, `[○ Pending]`, `[▲ Failed]`
*   **Metadata Rows:** `Target: [Host] backend-worker`, `Runtime: Pi 0.84.4`

#### Recommendation: Alternative 2
**Alternative 2 is recommended.** It keeps generic Pi output focused and lightweight while allowing complex Takomi orchestration trees (DAG nodes, subagent roles, context dependencies) to be inspected without cluttering the streaming terminal buffer.

---

## 4. UI States & Copy Specifications

All states use standardized system iconography, muted tone backgrounds, and accessible high-contrast text.

### 4.1 Loading (Data Fetching / Initializing)
*   **Visual Presentation:** Bounded inline skeleton loader (3 animated pulse lines) inside the active card or panel. No full-page blocking spinners.
*   **Banner/Badge:** `[◌ Connecting to Pi daemon...]` (Neutral slate badge).
*   **Exact Copy:** `Connecting to Pi runtime daemon at local socket... Verifying session workspace.`

### 4.2 Empty (No Active Sessions or Tools)
*   **Visual Presentation:** Centered single-column message inside panel/picker with a 1px dashed border container.
*   **Exact Copy:**
    *   *Title:* `No Pi Sessions Found`
    *   *Description:* `No existing Pi sessions were discovered in this workspace environment.`
    *   *Action:* `[ Start New Session ]`

### 4.3 Success (Command or Run Finished)
*   **Visual Presentation:** Subtle green edge indicator (`border-left: 2px solid #10B981`) on the run card; static checkmark.
*   **Exact Copy:** `Run completed successfully. 3 tools executed, 0 errors.`

### 4.4 Cancellation (User or Signal Abort)
*   **Visual Presentation:** Neutral amber badge (`border-left: 2px solid #F59E0B`), run buffer terminated with a dashed divider.
*   **Exact Copy:** `Execution cancelled by user. Active tool process terminated gracefully.`

### 4.5 Stale Source (Original Session Modified Externally)
*   **Visual Presentation:** Inline warning callout inside the session picker right-hand provenance pane.
*   **Exact Copy:** `Warning: Stale Source Session. The source Pi session was modified on disk by an external process 4 minutes ago. Forking will duplicate historical state up to the last recorded flush.`

### 4.6 Changed During Clone (Snapshot Conflict)
*   **Visual Presentation:** Inline error banner blocking continuation modal.
*   **Exact Copy:** `Clone Failed: Source Mutated. The original Pi session state changed while creating the snapshot. Please retry to capture a clean snapshot.`
*   **Action Button:** `[ Retry Snapshot Clone ]`

### 4.7 Incompatible Version (Schema/Daemon Mismatch)
*   **Visual Presentation:** Destructive alert banner (`bg: #FEF2F2`, `text: #991B1B`).
*   **Exact Copy:** `Incompatible Pi Version: Session format requires Pi 0.84.x (Detected daemon: 0.82.1). Upgrade the local Pi daemon or migrate session data before continuing.`
*   **Action Button:** `[ View Migration Guide ↗ ]`

### 4.8 Reconnecting (Transport Failure)
*   **Visual Presentation:** Sticky top amber banner in ChatView. Pulsing indicator dot.
*   **Exact Copy:** `Connection lost. Reconnecting to Pi daemon... (Attempt 2 of 5)`

### 4.9 Resynchronizing (Replay / Snapshot Catchup)
*   **Visual Presentation:** Sticky top blue banner with rotating sync glyph. Composer input remains disabled.
*   **Exact Copy:** `Resynchronizing session history... Replaying 14 unacknowledged stream events. Composer will unlock upon completion.`

### 4.10 Synchronized (Steady State Restored)
*   **Visual Presentation:** Banner transitions to subtle green flash for 1.8 seconds, then slides out smoothly.
*   **Exact Copy:** `Connection restored. Session is fully synchronized.`

### 4.11 Transcript Incomplete (Server Persistence Gap)
*   **Visual Presentation:** Persistent non-dismissible yellow warning callout positioned immediately above the lost segment in the chat transcript.
*   **Exact Copy:** `Transcript Incomplete: A gap occurred in the native Pi session log between event #104 and #109 due to an ungraceful daemon termination. Downstream context may be missing.`
*   **Action Button:** `[ Insert Context Marker & Continue ]`

### 4.12 Unsupported TUI (Generic Fallback Mode)
*   **Visual Presentation:** Monospace bordered code card with a clear fallback badge: `[TUI Emulation: Unsupported]`. Raw text rendering only.
*   **Exact Copy:**
    *   *Badge:* `Generic Text Fallback`
    *   *Banner Microcopy:* `This tool attempted an interactive curses/TUI layout. Interactive terminal controls are disabled in T3 Code. Displaying raw sanitized stdout output below:`

---

## 5. Keyboard, Accessibility, Truncation, & Sanitization

### 5.1 Keyboard Navigation & Focus Order
*   **Session Picker Modal:**
    *   `Tab` navigates logically: `Search Input` → `Session List Rows` → `Provenance Action Links` → `Dismiss Button` → `Primary Clone Button`.
    *   `Arrow Up` / `Arrow Down` navigates the session list; automatically updates the provenance preview without requiring enter.
    *   `Enter` on any session row executes `Clone & Resume Fork`.
    *   `Escape` dismisses the picker and returns focus to the composer textarea.
*   **Run Details Right Panel:**
    *   `Alt + [` / `Alt + ]` toggles between `[ Activity Log ]` and `[ Orchestration Board ]`.
    *   `Tab` traverses actionable items (pause stream, copy log, inspect subagent).
    *   Terminal buffer output maintains a scroll lock toggle accessible via `Space` when focused.

### 5.2 Screen Readers & ARIA Semantics
*   **Live Reconnect Status:** Wrapped in `<div role="status" aria-live="polite">` for standard state transitions (reconnecting, synchronized).
*   **Critical Alerts:** Incomplete transcript warnings and clone-mutation failures use `role="alert" aria-live="assertive"`.
*   **Session List:** Built with `<ul role="listbox" aria-label="Available Pi sessions for cloning">` and individual `<li role="option" aria-selected="...">`.

### 5.3 Reduced-Motion Compliance
*   All `@media (prefers-reduced-motion: reduce)` rules disable CSS animations:
    *   Pulsing amber connection dots are replaced with static solid shapes (`●` Amber).
    *   Syncing rotation spinners are replaced with static dual-arrow text glyphs (`↻`).
    *   Sliding banners switch to instant opacity cut-ins (`transition: none`).

### 5.4 Truncation & Buffer Boundaries
*   **Streaming Activity Buffer:** Capped at 2,000 active lines. When exceeded, the oldest lines collapse into an accessible accordion: `[ Expand earlier output (1,420 lines) ]`.
*   **Inline Tool Output:** Tool cards truncate preview output at 8 lines with a gradient mask and action: `Show more (42 lines) ▾`.

### 5.5 Reverse-Path Sanitization (Security & Privacy)
Raw host filesystem paths (e.g., `/Users/johno/.pi/workspaces/app/src/index.ts` or `C:\Users\johno\app\server.js`) must never be exposed across remote client sessions or shared transcripts.
*   **Sanitization Rules:**
    1.  If the path is inside the current workspace root: Strip leading host directories and render relative paths: `src/index.ts`.
    2.  If the path is an external or global configuration file: Obfuscate the system username and prefix with an environment badge: `[Host] ~/.pi/agent.json`.
    3.  Windows paths: Uniformly convert backwards slashes (`\`) to standard forward slashes (`/`) for client rendering consistency.

---

## 6. Environment-Host Files & Attach-Original Rules

### 6.1 Labeling Standard for Environment-Host Files
Whenever files located on the host runtime are displayed in headers, logs, or provenance previews, they must be rendered with an explicit badge to distinguish local workspace files from host container files.

*   **Host Scoped Path:** `[Host Env] ~/.pi/skills/git-review.sh`
*   **Workspace Relative Path:** `[Workspace] src/middleware/auth.ts`
*   **Read-Only System Configuration:** `[Host System] /etc/hosts (Read Only)`

### 6.2 User-Facing Explanation: Why "Attach Original" is Prohibited

To resolve user confusion over why they cannot resume in place, the following notice is embedded within the session continuation interface and technical documentation popovers:

> **Why is "Attach Original" unavailable?**
> Pi 0.84.4 uses direct file-system persistence without an enforceable cross-process writer lock. Opening an existing session directly from T3 Code while the Pi daemon or background tasks are running risks concurrent write collisions and corrupts session history.
>
> To guarantee safety, T3 Code always creates an isolated **Clone Snapshot**. Your new session inherits the full conversation history and tool context, while preserving the original session untouched on disk.

---

## 7. High-Value Decisions for User Review

The following key design trade-offs are presented for final user sign-off:

1.  **Session Picker Presentation: Centered Modal vs. Command Sheet**
    *   *Option A (Recommended):* Centered side-by-side modal displaying full provenance, turn metrics, and clone warnings.
    *   *Option B:* Compact dropdown sheet attached directly to the composer, prioritizing speed over explicit provenance clarity.
2.  **Run Details Structure: Segmented Tabs vs. Unified Log**
    *   *Option A (Recommended):* Segmented control separating chronological tool activity (`Activity Log`) from Takomi task DAGs (`Orchestration Board`).
    *   *Option B:* Single chronological feed interleaving bash outputs with collapsible Takomi workflow drawers.
3.  **Handling Incomplete Transcripts: Non-blocking Warning vs. Mandatory Resolution**
    *   *Option A (Recommended):* Display an inline yellow warning banner above the gap, allowing the user to insert a context marker and proceed immediately.
    *   *Option B:* Require explicit acknowledgment via a modal prompt before allowing any new prompts in the session.
4.  **Host Path Obfuscation Depth**
    *   *Option A (Recommended):* Sanitize paths relative to workspace root (`src/main.ts`) and generalize host configurations (`[Host] ~/.pi/config.json`).
    *   *Option B:* Full path masking showing only base file names (`main.ts`) with a hash tooltip.
