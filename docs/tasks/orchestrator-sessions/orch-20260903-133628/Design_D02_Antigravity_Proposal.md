# D02 Mobile UX/UI Specification: Pi & Takomi Integration

---

## 1. Mobile Information Architecture & Navigation Flow

### 1.1 Navigation Hierarchy
The mobile application uses a native stack navigation architecture backed by an offline-first SQLite cache. Desktop dual-pane layouts are explicitly avoided; detailed sub-views open as native sliding sheets or focused stack screens.

```
[Home Stack]
  │
  ├── Home Screen (Environment Switcher & Recent Threads)
  │     ├── [+] New Task Sheet
  │     │     └── Pi Session Quick-Pick (Modal Sheet)
  │     │           └── Clone into Takomi Code (Confirmation Sheet)
  │     │
  │     └── [Thread Card] ────────────────────────────────────────┐
  │                                                               │
  └── Thread Screen (Execution View) <────────────────────────────┘
        │
        ├── Thread Header
        │     ├── Navigation Back (< Home)
        │     ├── Connection / Resync Status Bar
        │     ├── Workflow Lens Toggle (Conditional: Takomi Envelope Only)
        │     └── Thread Settings (Action Sheet)
        │
        ├── Message & Event Timeline (FlashList / Virtualized)
        │     ├── Standard User / Assistant Turns
        │     ├── Execution Event Pills (Collapsible Tool Batches)
        │     ├── Structured Terminal Fallback Blocks
        │     └── Workflow Inline Cards (Envelope-driven)
        │
        ├── Thread Composer (Fixed Bottom, Keyboard-Avoiding)
        │     ├── Command / Resource Autocomplete Popover (/, /skill:)
        │     ├── Status State: Active / Queued / Steer / Disabled (Resync)
        │     └── Send / Stop Action Button
        │
        └── Native Detail Sub-Surfaces (Detented Sheets)
              ├── Run Details Sheet (Deep inspection of single tool/bash step)
              ├── Work Log Sheet (Linear environment event stream)
              └── Takomi Workflow Lens Sheet (Board, subagents, policies, todos)
```

---

### 1.2 Exact Transition & Reverse Paths

| Surface / Action | Target Screen / Component | Presentation Type | Dismiss / Reverse Path |
| :--- | :--- | :--- | :--- |
| **New Task** (`Home` or `Env` header) | `New Task Sheet` | Native Bottom Sheet (Detents: `90%`) | Swipe down or tap `Cancel` $\rightarrow$ returns to prior screen. |
| **"Continue a Pi Session"** (`New Task`) | `Pi Session Quick-Pick` | Stack push inside modal sheet | Tap `< Back` $\rightarrow$ returns to `New Task Sheet`. |
| **Select Session** (`Quick-Pick`) | `Clone Confirmation Sheet` | Sheet push | Tap `< Back` $\rightarrow$ returns to `Quick-Pick`. |
| **"Clone into Takomi Code"** | `Thread Screen` | Replaces Modal Stack with Target Route | Closes all sheets $\rightarrow$ navigates immediately to cloned thread. |
| **Composer Command Key** (`/`) | `Resource / Command Popover` | Popover anchored to Composer input | Tap outside, backspace delimiter, or `Esc` $\rightarrow$ closes popover. |
| **Thread Settings** (Header icon) | `Thread Settings Sheet` | Native Bottom Sheet (Detents: `50%`, `90%`) | Drag down, tap scrim, or tap `Done` $\rightarrow$ returns to `Thread Screen`. |
| **Work Log** (Header pill / overflow) | `Work Log Sheet` | Native Bottom Sheet (Detents: `90%`) | Drag down or tap `Close` $\rightarrow$ maintains exact scroll anchor in Thread. |
| **Tool / Execution Step Tap** | `Run Details Screen` | Full-screen stack push (with native header) | Tap `< Back` or edge swipe $\rightarrow$ returns to source step in Thread or Work Log. |
| **Takomi Workflow Pill Tap** | `Workflow Lens Sheet` | Native Bottom Sheet (Detents: `60%`, `100%`) | Drag down or tap `Close` $\rightarrow$ returns to `Thread Screen`. |

---

## 2. ASCII Phone Wireframes

### 2.1 Wireframe 1: Pi Session Quick-Pick & Clone

```
┌────────────────────────────────────────┐
│  Cancel     Select Pi Session          │
├────────────────────────────────────────┤
│ [ Q Search sessions by name or ID... ] │
├────────────────────────────────────────┤
│ RECENT PI SESSIONS                     │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ sess-9824a-feat-auth               │ │
│ │ Updated 12m ago • 48 steps         │ │
│ │ Env: local-node-prod               │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ sess-4410b-fix-sqlite-types        │ │
│ │ Updated 2h ago • 112 steps         │ │
│ │ Env: local-node-prod               │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ sess-1029c-refactor-styles         │ │
│ │ Updated yesterday • 14 steps       │ │
│ │ Env: staging-aws                   │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ [SELECTED SESSION PREVIEW]             │
│ Target: sess-9824a-feat-auth           │
│ Policy: Clone into Takomi Code         │
│ Mode: Isolated Environment Branch      │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │   Clone into Takomi Code           │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

### 2.2 Wireframe 2: Thread View during Reconnect / Resync

```
┌────────────────────────────────────────┐
│ < Home      sess-9824a-feat...     (i) │
├────────────────────────────────────────┤
│ [!] RECONNECTING: Network restored.    │
│     T3 Stream: Synced                  │
│     Pi Reconciliation: In Progress...  │
├────────────────────────────────────────┤
│                                        │
│ Assistant                              │
│ Let's inspect the migration script:    │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ [>] bash: cat migrate.sql          │ │
│ │ Status: Completed (Exit 0)         │ │
│ └────────────────────────────────────┘ │
│                                        │
│ [!] Transcript incomplete (prior runs) │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ Outbox: 1 local message queued     │ │
│ └────────────────────────────────────┘ │
│                                        │
├────────────────────────────────────────┤
│ [ Draft saved. Reconnecting...       ] │
│ ┌────────────────────────────────────┐ │
│ │ [!] Remote actions paused          │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

### 2.3 Wireframe 3: Generic Run Details Sheet

```
┌────────────────────────────────────────┐
│ Close           Run Details            │
├────────────────────────────────────────┤
│ Step ID: step-2041-exec                │
│ Tool: run_command                      │
│ Status: Completed • Exit Code: 0       │
│ Started: 14:02:11 • Duration: 840ms    │
├────────────────────────────────────────┤
│ INVOCATION PARAMETERS                  │
│ ┌────────────────────────────────────┐ │
│ │ CommandLine: pnpm run test:unit    │ │
│ │ Cwd: /workspace/project            │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ STDOUT / STDERR                        │
│ ┌────────────────────────────────────┐ │
│ │ PASS tests/auth.test.ts            │ │
│ │ PASS tests/session.test.ts         │ │
│ │                                    │ │
│ │ Tests: 14 passed, 14 total         │ │
│ │ Time:  0.72s                       │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ STRUCTURED FALLBACK NOTICE             │
│ Non-interactive environment. Batch     │
│ output captured. TTY prompts disabled. │
└────────────────────────────────────────┘
```

---

### 2.4 Wireframe 4: Takomi Workflow Lens Sheet

```
┌────────────────────────────────────────┐
│ Close       Takomi Workflow Lens       │
├────────────────────────────────────────┤
│ Stage: Build / Implementation          │
│ Envelope: v2.4-spec                    │
├────────────────────────────────────────┤
│ ACTIVE SUBAGENTS (2)                   │
│ ┌────────────────────────────────────┐ │
│ │ [●] code-architect (Idle)          │ │
│ │ [●] test-runner (Running: unit)    │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ TASK BOARD & CHECKLIST                 │
│ [X] Reconcile schema definition        │
│ [X] Update unit tests                  │
│ [ ] Run end-to-end suite               │
│ [ ] Final verification audit           │
├────────────────────────────────────────┤
│ ACTIVE POLICY ASSERTIONS               │
│ • No broad type casts allowed          │
│ • Unit test execution required         │
└────────────────────────────────────────┘
```

---

## 3. Process-Death Restoration Alternatives

### Alternative A: Direct Route Rehydration
*Mechanism*: The mobile navigation engine serializes the complete navigation stack (including exact thread IDs and intra-screen scroll offsets) into the local SQLite state store upon every navigation event. On cold launch after process death, the app bypasses the Home Screen and mounts directly to the interrupted thread route.

- **Pros**:
  - Zero-tap resumption for the user.
  - Preserves immediate mental context when quickly switching between heavy apps.
- **Cons**:
  - High risk of crash loops or black screens if the remote session was invalidated, tombstoned, or closed on another device during process downtime.
  - Delays initial render while waiting for SQLite reconciliation and capability checks on the restored thread.
  - Disruptive if the user opened the app via a push notification targeting a different thread.

---

### Alternative B: Home Screen Launch with Active-Thread Recovery Banner (Recommended)
*Mechanism*: On cold start, the app always renders the Home stack first (guaranteeing immediate UI interactivity and baseline environment validation). If SQLite detects an unfinalized active run or an open thread when process death occurred, a high-priority, sticky **Recovery Banner** is displayed at the top of the Home Screen.

- **Pros**:
  - Resilient against corrupted state; if a session is dead, the user is not trapped in a failing screen.
  - Home screen mounts in under 150ms using cached SQLite metadata.
  - Allows the user to inspect other environments or drafts if the restored session requires large network payloads.
  - Clean single-tap action navigates immediately to the active thread.
- **Cons**:
  - Requires one deliberate user tap to return to the active thread.

### Recommendation & Justification
**Adopt Alternative B.** Mobile operating systems terminate processes unpredictably under memory pressure. Direct route rehydration often creates brittle launch cycles when network states are volatile or when remote sessions change state externally. Alternative B guarantees a fast, predictable cold start while maintaining a single-tap resumption path with visible context.

---

## 4. Native Mobile Behaviors & Protocol Surface

### 4.1 Resource Referencing & Autocomplete
- **Trigger Syntax**: Typing `/` in an empty composer or preceded by whitespace triggers the resource popover.
- **Resource Namespaces**:
  - Extensions & Templates: `/${name}` (e.g., `/frontend-ui`, `/audit`).
  - Agent Skills: `/skill:${skillName}` (e.g., `/skill:takomi-flow`, `/skill:git-github-tools`).
  - No synthetic or arbitrary namespaces are allowed.
- **Mobile Interaction**: A native floating menu appears directly above the keyboard. Results are filtered locally against the environment capability cache. Tapping an item inserts the exact token with trailing whitespace and closes the popover.

---

### 4.2 Model, Thinking, and Runtime Options
- **Access**: Located within the `Thread Settings Sheet`.
- **Capability Gating**: Options are populated dynamically based on host-advertised capabilities for the active environment.
- **Controls**:
  - Model Selection: Native segmented control or picker list.
  - Thinking Budget: Native stepped slider (discrete capability values only), rendered only if supported by the provider capability flag.
  - Runtime Flags: Toggle switches for read-only vs. workspace-mutation execution.

---

### 4.3 History Fidelity & Truncation
- **Local Storage**: All stream items are appended to the local SQLite database.
- **Pagination**: Threads are loaded lazily in reverse chronological batches (50 events per batch).
- **Truncation Indicator**: If Pi or Takomi flags a session as truncated (e.g., history compacted upstream), a persistent inline indicator is rendered:
  `[!] Prior context truncated by host environment. Full historical logs retained on server.`
- **Incomplete Transcripts**: If an incomplete stream occurs due to network drop or unrecoverable synchronization gap, the indicator is permanently stored in the local thread cache and cannot be cleared.

---

### 4.4 Tree, Fork, and Export Behaviors
- **Branching / Forking**:
  - Tapping and holding any message or completed step opens a native action menu: `Fork Thread from Here`.
  - Action initiates a new environment clone branching off the selected event ID.
  - Navigates immediately to the new thread upon receipt of the new session handle.
- **Export**:
  - Triggered from `Thread Settings` $\rightarrow$ `Export Thread`.
  - Formats: Clean Markdown (user-visible chat) or Full Diagnostic Bundle (JSONL execution trace).
  - Uses the native system share sheet (`UIActivityViewController` on iOS / `Intent.ACTION_SEND` on Android).

---

### 4.5 Queue, Steer, and Follow-Up Actions
- **While a Run is Active**:
  - The composer text input remains enabled.
  - The Primary Action Button transitions from `Send` to a split or multi-state control:
    - **Steer**: Injects the message immediately as a high-priority system-level steering event to interrupt or guide the active run.
    - **Queue**: Appends the message to the local outbox to run automatically after current execution halts.
- **Following Run Completion**: Composer reverts to standard `Send` behavior.

---

### 4.6 Compact, Retry, and Bash Interaction
- **Compact View**: Consecutive tool executions are collapsed by default into an expandable event pill (e.g., `Ran 4 checks (passed)`). Tapping expands the steps inline.
- **Retry Action**: Individual failed tool invocations display an inline `Retry` button if the environment supports single-step rerun; otherwise, the retry prompt appends to the composer.
- **Bash & Terminal Handling**:
  - Mobile strictly disallows interactive terminal emulation, TTY attachments, or raw shell handoffs.
  - Commands render as static, syntax-highlighted code blocks with exit code, execution duration, and folded stdout/stderr streams.
  - Interactive inputs requested by a shell command display a structured fallback block:
    `[!] Terminal requested interactive input (TTY). Interactive input is not supported on mobile. Command terminated with exit code 1.`

---

### 4.7 Takomi Board, Subagents, Context, Routing, Policy, and Todos
- **Visibility Constraint**: Takomi-specific lenses, boards, and subagent views render **only** when a valid, versioned Takomi envelope is detected in the stream payload.
- **Components**:
  - **Board & Todos**: Interactive checklist view showing task progress and assigned subagents.
  - **Subagent Roster**: Visual chips displaying active subagents, current operational phase, and assigned goals.
  - **Policy Rules**: Badge indicators reflecting passing or blocked policy gates.
  - **Routing Info**: Read-only indicator showing orchestrator handoffs between primary agent and delegated workers.

---

### 4.8 Unsupported Capabilities Fallback
When a remote session issues an event or tool call unsupported by the mobile client:
- The UI renders a structured fallback card in the timeline:
  `[!] Unsupported Event Type: <event_name>`
  `This step was executed on the remote host, but native rendering is unavailable on mobile. Inspect full logs via Run Details.`
- The user can tap `Run Details` to view the raw structured JSON payload without crashing or breaking thread layout.

---

## 5. UI State Machine & Interaction Specifications

```
                       ┌──────────────┐
                       │   Offline    │
                       └──────┬───────┘
                              │ Network Restored
                              ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Loading    ├──────>│ Reconnecting ├──────>│   Resync     │
└──────────────┘       └──────────────┘       └──────┬───────┘
                                                     │
               ┌─────────────────────────────────────┴──────────────────┐
               │ Stream Synced                                          │ Pi Reconciliation Done
               ▼                                                        ▼
┌──────────────────────────────┐                         ┌──────────────────────────────┐
│ T3 Stream Synchronized       │                         │ Fully Active / Ready         │
│ (Pi Reconcile In-Progress)   │                         │ (Empty, Success, or Working) │
└──────────────┬───────────────┘                         └──────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Incomplete Transcript        │
│ (Persistent Warning State)   │
└──────────────────────────────┘
```

### State Definitions

| State | Visual Indicator | Composer & Action State | Data / Cache Behavior |
| :--- | :--- | :--- | :--- |
| **Loading** | Shimmer skeleton cards on thread cards; subtle spinner in nav bar. | Input disabled; buttons hidden. | Reads local SQLite cache; zero blocking network calls. |
| **Empty** | Centered illustration, subtle helper prompt, and quick-pick action chips. | Input enabled; autofocus ready. | Thread initialized with clean state. |
| **Working (Active)** | Pulsing subtle status pill in header; auto-scroll locked to newest event. | Action button shows `Steer` and `Queue` options. | Real-time event streaming appended to list and SQLite. |
| **Success** | Event pills collapse to green success badges; summary card displayed. | Reverts to standard `Send` action. | Outbox checked for queued items. |
| **Cancel** | Greyed out status pill: `Run Cancelled by User`. | Re-enables composer with draft preserved. | Halts local stream listener; sends cancel packet. |
| **Error** | Red accent border on failed card; error message with `Retry` / `Details`. | Allows re-prompt or editing failed input. | Error logged to local SQLite diagnostics. |
| **Offline** | Top bar alert: `Offline - Showing Cached Data`. | Composer disabled; draft saved locally. | Writes to local SQLite outbox queue. |
| **Reconnecting** | Amber top bar banner: `Reconnecting to environment...`. | Send disabled; draft inputs strictly preserved. | Polling network interface; holds local socket reconnect. |
| **Resync (T3 Sync)** | Banner updates: `Syncing event stream...`. | Send disabled; remote mutations blocked. | Replays missed T3 stream deltas into SQLite. |
| **Resync (Pi Reconcile)**| Banner updates: `Reconciling Pi session state...`. | Send disabled; remote mutations blocked. | Validates Pi session consistency and lock status. |
| **Incomplete** | Permanent amber warning card pinned above truncated message break. | Composer enabled; actions allowed. | Sets `transcript_incomplete=true` in SQLite record. |

---

## 6. Accessibility, System Conventions & Mobile Ergonomics

### 6.1 Touch Targets & Geometry
- **Minimum Target Size**: All touchable elements (buttons, chips, icons, list rows) have a minimum interactive bounding box of **44 × 44 pt** (iOS) and **48 × 48 dp** (Android).
- **Hit Slop**: Small visual icons (e.g., 20pt close icons) use an explicit touch hit-slop extension of `12pt` on all edges.

---

### 6.2 Screen Reader (VoiceOver & TalkBack)
- **Execution Event Pills**: Grouped into a single accessibility element:
  - *Accessibility Label*: `Step 14: Bash run_command. Completed successfully in 840 milliseconds.`
  - *Accessibility Hint*: `Double tap to open Run Details.`
- **Composer Controls**: State-dependent accessibility announcements:
  - Announces when the action button transitions between `Send`, `Steer`, and `Queue`.
- **Live Regions**: Output updates and status changes (e.g., `Reconnecting`) are marked as `polite` accessibility live regions to avoid interrupting current speech.

---

### 6.3 Dynamic Type & Text Scaling
- **Scalability**: All typography styles support dynamic type up to **200%** scale without text clipping or truncated labels.
- **Layout Adaptation**:
  - Horizontal button rows and metric strips wrap to vertical stacked layouts when scale exceeds `130%`.
  - Maximum composer height adapts proportionally to the keyboard and viewport.

---

### 6.4 Reduced Motion & Animation Policy
- **System Preference**: Respects `prefers-reduced-motion` at the OS level.
- **Static Transitions**: When enabled, replaces all slide-in sheets and spring animations with instant cut-ins or static opacity fades ($< 150\text{ms}$).
- **Zero Continuous Loops**: Pulsing status indicators switch to static solid color badges. Shimmer loading skeletons switch to static grey place-holders.

---

### 6.5 Hardware Keyboard Integration
- **Keybindings**:
  - `Cmd + Enter` / `Ctrl + Enter`: Submit Composer (Send, Steer, or Queue based on state).
  - `Esc`: Dismiss active Sheet, Popover, or Autocomplete menu.
  - `Up / Down Arrows`: Navigate items in `/` command autocomplete popover.
- **Focus Management**: Connecting a physical keyboard shifts default focus to the composer text input when entering a thread.

---

### 6.6 Safe Area & Form Factors
- **Edge Insets**: Strict enforcement of `SafeAreaProvider` insets across notch, dynamic island, and home-indicator regions.
- **Keyboard Avoiding**: Thread layout uses native input accessory views and hardware-accelerated keyboard offset animations to eliminate stutter.
- **Orientation Rules**:
  - Handheld phones: Locked to Portrait mode for predictable composer and virtual list performance.
  - Tablets / Foldables: Adaptive layout where sheets expand to centered modal dialogs (maximum width: `640pt`) with scrim.

---

### 6.7 Large-List Virtualization Budgets
- **Virtualization Engine**: Virtualized list implementation (`FlashList` or equivalent recycling container).
- **Performance Budgets**:
  - Draw window size: Clamped to `5 screens` ahead/behind visible area.
  - Recycled cell pool: Fixed memory ceiling for tool-call views.
  - Maximum mounted timeline nodes: Hard ceiling of `100 active rendered nodes`; older nodes convert to lightweight placeholder height blocks until scrolled near.
  - Memory consumption: Total active thread view memory capped under `80MB`.

---

## 7. High-Value User Decisions

The following decisions require explicit product and design alignment. Visual preferences are separated from non-negotiable protocol requirements.

---

### Decision 1: Composer Execution Behavior During an Active Run
*Context*: When the user types into the composer while a multi-step task or subagent is actively executing on the host, the app must handle the submission intent.

* **Option A (Predictable Outbox - Recommended)**: The primary action defaults to **Queue**. Messages are queued in the outbox and appended after current execution concludes. An adjacent, distinct icon button allows **Steer** (immediate interrupt/inject).
* **Option B (Modal Switcher)**: Tapping the action button presents a native mini-sheet: `Queue for Later` vs `Steer Execution Now`.

*Classification*: **Visual & UX Decision**. Protocol supports both queueing and mid-flight steering; this determines the default mobile tap ergonomics.

---

### Decision 2: Takomi Workflow Lens Presentation Model
*Context*: When a valid versioned Takomi envelope is detected, the workflow data (subagents, stages, checklists) must be accessible without cluttering the execution log.

* **Option A (Segmented Header Control)**: The thread header displays a segmented tab toggle: `Timeline` vs `Workflow`. Switching tabs changes the main view cleanly.
* **Option B (Contextual Bottom Sheet Pill - Recommended)**: The timeline displays a persistent floating chip at the top right: `[●] Workflow (Stage: Build)`. Tapping opens the Workflow Lens as a half-height native bottom sheet over the timeline.

*Classification*: **Visual & UX Decision**. Does not alter stream ingestion or envelope parsing.

---

### Decision 3: Process-Death Restoration Strategy
*Context*: Operating systems terminate background processes under memory pressure. The app must choose how it launches after unexpected termination.

* **Option A (Home Launch with Recovery Banner - Recommended)**: Cold start mounts the Home screen; if an unfinished active thread was open, a persistent `Resume Active Thread` card is pinned at the top.
* **Option B (Direct Route Rehydration)**: App attempts to remount the exact active thread route and scroll position on boot, falling back to Home only on failure.

*Classification*: **Architecture & UX Decision**. Option A maximizes stability and eliminates crash loops; Option B prioritizes desktop-like continuity at the expense of launch robustness.
