# Takomi Code: Pi + Takomi Maximum-Fidelity Integration

**Session:** `orch-20260903-133628`
**Status:** Genesis and Design complete; Build awaits B00 baseline approval
**Branch:** `feat/pi-takomi-parity` (single worktree; existing changes preserved)
**Target:** the closest safe, maintainable, cross-client representation of Pi 0.84.4 and the installed Takomi extensions in this T3 Code fork

## 1. Executive decision

Takomi Code should treat **Pi as the execution and native-session authority** and **T3 as the remote, event-sourced product shell**. The existing JSON-RPC adapter is the correct base and should not be replaced by terminal scraping or by reimplementing Pi's agent loop.

Maximum fidelity requires a capability-negotiated transport with **exactly one session owner**:

1. **Compatibility transport:** Pi's supported `--mode rpc` process remains available for the capabilities it already serves well.
2. **Maximum-fidelity transport:** one long-lived, isolated Takomi Code Pi Host child process uses Pi's public SDK and owns the entire session lifecycle for sessions requiring SDK-only operations. It must implement the existing streaming/RPC behavior plus session listing, active-leaf state, tree mutation, JSONL import/export, and runtime replacement. A session never has both transports alive. Switching transport requires the old owner to stop, release, and be verified closed before the new owner opens the session.

The host is not an in-process T3 library and may not depend on private Pi modules. Arbitrary Pi extensions execute only inside this isolated child. If the host cannot prove version compatibility, Takomi Code falls back to the stock RPC capability set rather than opening the same session twice.

This is not literal pixel-for-pixel terminal emulation. Arbitrary TUI components, terminal mouse/focus behavior, custom headers/footers/editors, and terminal themes cannot be represented 1:1 in React/React Native without embedding a terminal. They will receive explicit canonical equivalents or an honest unsupported/fallback state. Behavioral and data fidelity take priority over visual mimicry.

## 2. Evidence that the architecture can work

### Existing implementation evidence

The fork already has a substantial structured integration:

- `apps/server/src/provider/Layers/PiAdapter.ts` starts Pi in RPC mode, optionally passes `--session`, requests `get_state`, persists the native session file as a resume cursor, streams messages/reasoning/tools, bridges four response-bearing extension UI methods, and normalizes Takomi tools.
- `apps/server/src/provider/Layers/PiProvider.ts` discovers Pi models and model-specific thinking levels.
- `packages/contracts/src/providerRuntime.ts`, `ActivityPayloadProjection.ts`, web session logic, `TakomiToolCallCard.tsx`, and `TakomiInspector.tsx` already carry bounded Takomi semantic state.
- Existing feature documentation records validated turns, tools, images, extension questions, restart resume, interruption, and model switching.

### Direct protocol proof performed during this audit

Using the installed `@earendil-works/pi-coding-agent@0.84.4`:

- `pi --mode rpc --no-session --no-extensions` successfully answered `get_state`, `get_commands`, and `get_available_models`.
- The observed registry contained 389 models and the command response contained 52 dynamically discoverable commands.
- A real CLI-created session was copied to a temporary directory; the original was never opened for writing.
- Pi was launched with `--mode rpc --session <temporary-copy> --no-extensions`.
- `get_state`, `get_entries`, `get_tree`, and `get_commands` all succeeded.
- Pi reported the copied file as the active session and returned 61 entries, including `message`, `custom`, `model_change`, and `thinking_level_change` entries.
- The copied JSONL byte count was unchanged after read-only inspection.

This proves **read compatibility and native session selection**, not continuation. It demonstrates that Takomi Code can ask Pi itself to open an independently created session and recover its entry model without rewriting the file. B02/B06 must still prove prompt continuation, parent-link correctness, Takomi custom-state restoration, restart, and source checksum stability with a synthetic or copied fixture.

### Upstream implementation evidence

Upstream [PR #7211](https://github.com/pingdotgg/t3code/pull/7211) is an active, substantial Orchestrator V2 Pi implementation. At the audit point it was open, not draft, green on required checks, merge state `DIRTY`, and targeted `t3code/codex-turn-mapping` rather than `main`. It supersedes the earlier Pi PRs and already implements much of generic B01/B02/B04/B09/B10/B12/B18. [PR #6461](https://github.com/pingdotgg/t3code/pull/6461) separately standardizes ACP providers and demonstrates Pi through ACP.

The fork and #7211 are independent implementations. Do not duplicate #7211 or cherry-pick its architecture graph into the current adapter. Before each generic Pi task, reassess upstream status and either port a focused concept, contribute a narrow hardening change against the appropriate upstream branch, or retain only the residual work. The complete comparison and contribution strategy lives in `Upstream_Strategy_and_Resilience_Addendum.md`.

### Safety boundary

Pi 0.84.4 exposes no cross-process writer lock honored by all Pi writers. Therefore stock Takomi Code must offer **Clone into Takomi Code** as the interoperable continuation flow: clone through Pi, verify the source identity/checksum stayed stable, then continue in the new native session file. **Attach original is unavailable** unless a future Pi version exposes an enforceable ownership protocol used by CLI and GUI writers. A product confirmation or process heuristic is not a lock.

Every cloned session carries provenance: source path token, source session ID, source checksum/identity, child session ID, active leaf, last synchronized entry, and transcript fidelity. A future experimental Attach mode requires a separate reviewed design for acquisition, renewal, process death, stale-owner recovery, restart, and handoff and may not claim safety before that protocol exists.

## 3. Authoritative capability audit

Legend: **Existing** = already implemented; **Direct** = can map through Pi RPC; **Bridge** = needs the isolated SDK bridge or an upstream RPC addition; **Approximate** = canonical UI equivalent; **Host-only** = local environment behavior, not a remote-client feature.

| Capability | Pi/Takomi source | Current fork | Target mapping |
|---|---|---|---|
| Prompt + streamed text/reasoning | RPC events | Existing | Direct, preserve final message as authority |
| Tool start/update/end | RPC events | Existing | Direct with bounded persistence and projection |
| Images | RPC prompt content | Existing | Direct on all clients |
| Abort | RPC `abort` | Existing | Direct; clear queue then abort for Escape parity |
| Steering/follow-up queues | `steer`, `follow_up`, queue events | Partial/not productized | Direct controls and queue UI |
| Queue modes | RPC setters | Missing | Direct settings and visible state |
| Model selection | RPC model APIs | Existing | Direct, workspace/environment scoped |
| Thinking levels | RPC thinking APIs | Existing | Direct, model-valid choices only |
| Compaction | RPC `compact` + events | Existing event mapping | Direct command, status, failure, and auto-setting UI |
| Retry controls | RPC retry commands/events | Missing | Direct status and abort-retry controls |
| Bash execution | RPC `bash`/`abort_bash` | Generic tools only | Direct optional console action; host-scoped warning |
| Session resume by path | CLI `--session` | Existing cursor resume | Direct; add user-visible catalog/import flow |
| Continue most recent | CLI `--continue` | Missing UI | Host session catalog resolves latest safely |
| Session list/search/rename | `SessionManager.list/listAll`, RPC name | Missing | Host/RPC with bounded metadata; environment-scoped opaque IDs |
| Session delete | TUI picker behavior; no confirmed public SDK delete API | Missing | Explicitly unsupported until a public atomic API and authorization design exist |
| Native entry tree read | RPC `get_entries/get_tree` | Missing UI | Direct read model |
| Navigate tree in same file | SDK `navigateTree` | Missing from RPC | Maximum-fidelity host only; disabled until T3 represents active leaf, abandoned branches, and effective context |
| Fork/clone | RPC `fork`/`clone` | Not exposed | Direct, with provenance and new T3 thread binding |
| JSONL import/export | SDK import/export; RPC HTML only | Missing | Bridge for JSONL, Direct for HTML export |
| HTML export | RPC `export_html` | Missing | Direct artifact/download flow |
| Session name/stats | RPC | Missing/partial | Direct UI and thread metadata sync |
| Crash transcript reconciliation | entries + T3 event log | Missing | High-water cursor + explicit incomplete/recovered state |
| Built-in slash commands | TUI dispatcher | Not discoverable | Dedicated T3 actions where RPC exists; do not send unsupported built-ins as prompts |
| Extension commands | RPC `get_commands` + prompt dispatch | Missing UI | Direct discovery and invocation |
| Prompt templates | Dynamic commands | Missing UI | Direct discovery; preserve argument hints |
| Skills | `/skill:name`, metadata/filesystem | Missing UI | Existing provider skill contracts + workspace snapshots |
| Model-invoked vs user-only skills | skill frontmatter | Contracts already model distinction | Preserve invocation semantics exactly |
| Extension confirm/select/input/editor | RPC extension UI | Existing, lossy | Direct with exactly Pi 0.84.4 fields, one durable terminal T3 transition, and at-most-one fenced response-write attempt; richer metadata only after protocol negotiation |
| Extension notify/status/widget/title | RPC UI subset | Notify only | Approximate canonical status surfaces |
| Extension custom TUI components | `ctx.ui.custom`, TUI primitives | Unsupported | Explicit fallback; optional terminal view, never silent hang |
| Extension shortcuts/terminal input | extension API | Unsupported | Map declared actions into T3 command/keybinding system where metadata exists |
| Themes | terminal JSON themes | Missing | Approximate token mapping/preview; T3 theme remains authoritative |
| Keybindings | Pi terminal action IDs | Missing | Import/mapping UI for equivalent T3 commands; host-only remainder |
| Providers/auth/login/logout | Pi auth/model runtime | Mostly external config | Capability-gated settings and safe host-side login flows |
| Custom provider definitions | `models.json`, extension registration | Model list works | Read-only diagnostics and model selection; editing is explicit/admin-scoped |
| Context files/system prompt | Pi resource loader | Existing implicitly | Diagnostics only; avoid duplicating prompt construction in T3 |
| Context manager reports | Takomi tools | Existing semantic card | Persistent Run Details with warnings/gates/loaded skills/policies |
| Takomi modes | `takomi_mode` | Existing tool rendering | Direct command and visible current state |
| Genesis/Design/Build workflows | `takomi_workflow` + prompt injection | Existing tools | Workflow launcher, stage state, review gate |
| Board sessions/tasks | `takomi_board` + filesystem | Existing web inspector | Canonical board UI, no duplicate T3 state machine |
| Subagent single/parallel/chain | `takomi_subagent` | Existing semantic projection | Structured launch/preview/result UI |
| Async/status/interrupt/resume | Takomi/native actions | Tool-call only | Explicit controls only after a deterministic, versioned Takomi control API exists; never model-mediated UI pretending to be direct |
| Forked child context | Takomi subagents | Runtime supported | Preserve provenance in child cards/details |
| Worktree execution | Takomi/native engine | Runtime supported | Clear isolation badge, artifact/patch handling |
| Clarify native TUI | `ctx.ui.custom` | Not remotely usable | Replace with preview-only + explicit confirm flow remotely |
| Routing policy/config | Takomi tools | Existing semantic cards | Read/preview/confirm/write workflow with exact model IDs |
| Policy prerequisite gates | context manager | Existing inside Pi | Render reason and loaded-state; Pi remains authority |
| Todo tool | companion extension | Existing semantic collapse | Cross-client persistent task card |
| Arbitrary companion extensions | Pi resource discovery | Existing suite discovery | Generic safe fallback and diagnostics; never assume renderer |
| Utility text generation | T3 driver service | Missing | Separate optional Pi-driven implementation with no session pollution |
| Runtime distribution/update | desktop/server/SSH/WSL environment host | Missing | Version-controlled Takomi source, manifests, licenses, exact resolved dependency integrity, managed host install plus user override |
| Web/desktop/mobile parity | clients | Web strongest, mobile behind | Explicit per-client parity matrix and generic fallbacks |

## 4. Confirmed high-risk defects and gaps

1. **Runtime/interaction capability truthfulness.** Pi only accepts T3 `full-access`, while generic UI capability flags can expose modes or Plan semantics that the adapter does not enforce.
2. **Checkpoint rollback ordering.** T3 can restore files before Pi reports conversation rollback unsupported, creating a split state.
3. **Crash reconciliation.** Pi may persist native entries that T3 did not ingest before a crash; resumed model context can exceed the visible T3 transcript.
4. **Single-writer risk.** Pi session JSONL has no cross-process writer lock; original-file Attach is therefore out of scope until Pi adds one.
5. **Lifecycle fencing.** Buffered output from a stopped/superseded process needs a generation fence.
6. **Native observability.** Pi driver passes a native event logger that the adapter currently does not consume.
7. **Durable payload bounds.** Some raw tool args/results are bounded only for client projection, after persistence.
8. **Unknown extension UI.** Unsupported response-bearing UI requests can be ignored and strand a turn.
9. **Discovery gap.** Pi/Takomi commands, prompt templates, and skills exist but are absent from provider workspace snapshots.
10. **Mobile semantic gap.** Mobile lacks Run Details/board/subagent presentation and has had Pi/Takomi branding fallback issues.
11. **Takomi source and dependency integrity risk.** Canonical Takomi source is `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`; `~/.pi/agent` is only an installation target. Installed managed extensions currently match canonical source, but deployment validation, stale-file pruning, per-file ownership, manifest freshness, package-readiness diagnostics, and the `pi-subagents` public compatibility boundary require hardening before feature work.
12. **Deterministic control gap.** Pi RPC can invoke extension commands/templates/skills through prompts but cannot directly invoke arbitrary registered tools with JSON. Takomi UI controls require a versioned public Takomi control API, not a prompt asking a model to call a tool.
13. **Authorization gap.** Every new host/session/auth/import/export method needs an explicit T3 RPC scope, opaque environment-bound identifiers, path canonicalization, limits, and tests.
14. **Native tree projection gap.** Append high-water and active leaf are different; full tree, active branch, effective context, and checkpoint availability must be represented separately.
15. **Dirty baseline risk.** Existing user changes overlap Pi/web/mobile implementation files and must be committed, shelved, or hash-recorded with file ownership before Build dispatch.
16. **TUI-only behavior.** Native clarify UI, arbitrary components, overlays, headers/footers/editors, and terminal shortcuts are not remotely transportable.
17. **Slow-host reconnect risk.** Preparation, socket opening, and initial synchronization share one aggregate deadline; a healthy overloaded host can be disconnected during setup.
18. **Slow-consumer backpressure risk.** Several event/subscription queues are unbounded; a stalled client or relay can grow server memory and eventually lose the socket.
19. **Wake-storm and half-open risk.** Foreground wakeups can recreate many subscriptions concurrently, while a visible half-open session has no documented application-level detection bound.

## 5. Target architecture

```text
Web / Desktop / Mobile
        |
T3 typed commands + provider capabilities
        |
T3 event-sourced orchestration and projections
        |
PiAdapter anti-corruption layer
        |
Capability-negotiated single-owner transport
   |                                      |
Stock Pi RPC process          Long-lived Takomi Code Pi Host
(compatibility sessions)      (public SDK superset sessions)
   |                                      |
   +--------- never concurrently ----------+
                      |
              Pi/Takomi runtime
                      |
                Native JSONL owner
```

### Ownership rules

- Pi owns model context, native entries, extensions, tool loop, compaction, model auth, and native session writes.
- T3 owns environment/thread identity, remote transport, canonical client-visible event history, approvals/questions, checkpoints, and cross-client projections.
- The adapter owns translation and capability negotiation.
- The long-lived host is the sole owner for its session, owns no independent business state, uses only Pi public SDK APIs, and returns typed results/events.
- Takomi board/subagent executors remain inside Takomi. T3 renders them. Direct UI actions require a public, versioned Takomi control API factored from the same domain services used by tool handlers; T3 does not call tool `execute` functions casually or ask the model to simulate a deterministic control.

### Protocol rules

- Introduce a versioned Pi capability descriptor rather than inferring behavior from driver name.
- Preserve unknown forward-compatible fields but never forward unknown payloads to clients unchecked.
- Track native session ID, path, Pi/Takomi/pi-subagents resolved versions and integrity, append high-water entry ID, active `leafId`, transport version, source provenance, and transcript fidelity in the provider resume state.
- Maintain distinct bounded projections for append-order entries, the full tree, the selected root-to-leaf branch, and the compaction-aware effective context. Historical native turns have no fabricated T3 checkpoint refs.
- Assign and test `RPC_REQUIRED_SCOPES` for every new operation. Remote import/export uses server-managed uploads/download artifacts, never arbitrary client-provided host paths.
- Use stable Pi entry IDs/tool call IDs as reconciliation keys.
- Make unsupported actions unavailable before side effects.
- Every response-bearing request reaches one durable terminal T3 state; T3 attempts at most one Pi-compatible response write for the fenced live generation and never claims atomic child-process delivery.

## 6. Product behavior for CLI-to-UI continuation

1. User opens **Continue a Pi session** from new-thread provider controls or environment settings.
2. Server lists sessions belonging to the selected environment and workspace using opaque environment-bound IDs; remote clients never inspect their own filesystem.
3. Picker shows bounded name, cwd label, timestamp, model, entry count, source, compatibility, and fidelity warnings.
4. The only safe stock action is **Clone into Takomi Code**.
5. The environment host records source file identity/checksum, asks Pi to clone/fork through its own API, and verifies the source stayed unchanged during the operation.
6. Pi opens the new child session. T3 never rewrites native entries and never co-opens the original.
7. T3 imports bounded projections of the full tree, active branch, active `leafId`, and effective context; unsupported/custom content receives an explicit disclosure.
8. The new T3 thread stores child provenance, append high-water ID, active leaf, and transport identity.
9. On process/server restart, reconciliation runs before accepting a new prompt.
10. The user may open the untouched original in CLI at any time; opening the child in another Pi process remains unsafe until Takomi Code has stopped owning it.

## 7. Delivery waves and gates

### Approved Design Outcomes

- Web/desktop session continuation uses a quick-pick modal with `Clone into Takomi Code` as the only action.
- Run Details uses one generic Execution view plus an optional versioned Takomi Workflow view.
- Terminal-only/custom behavior receives explicit structured fallback; no embedded terminal or automatic handoff.
- Compact mobile uses full-screen nested Run Details, an inline authoritative Steer/Follow-up mode control, and Home-first process-death recovery.
- D03 defines exact Pi 0.84.4 interaction methods, at-most-one fenced response-write attempts, provider-neutral fallbacks, accessibility, and explicit ingress/projection/update budgets.
- Product/UX decisions and specifications are orchestrator-owned. Antigravity is reserved for actual UI code writing/refinement after requirements are fixed.

### Wave 0 — Freeze facts, source, and safety

B00 first records a human-approved baseline for existing uncommitted Pi/web/mobile work, establishes canonical Takomi source/manifests/licenses/dependency integrity, and creates the single-owner host package boundary. Tasks B01-B03 then evaluate and extend the leading upstream Pi work rather than duplicating it, enforcing capability truthfulness, rollback preflight, protocol/framing conformance, lifecycle fencing, native logging, and persistence bounds. B03A independently hardens provider-neutral connection deadlines, liveness, wake coordination, backpressure, telemetry, and cursor-based resynchronization.

**Gate:** focused tests prove unsupported operations cannot mutate state, stopped Pi output cannot land, slow clients remain bounded, and every reconnect converges through replay or an explicit authoritative snapshot.

### Wave 1 — Discovery and interoperable sessions

Tasks B04-B08. Add command/skill/template discovery, session catalog, clone-only CLI continuation, transcript hydration/reconciliation, and native tree/fork/import/export operations.

**Gate:** a synthetic or copied CLI fixture can be discovered, cloned through Pi, rendered, prompted, parent-link checked, restarted with Takomi custom state, forked, and exported while source identity/checksum remains unchanged. Same-file tree navigation remains disabled until active-leaf semantics are proven.

### Wave 2 — Behavioral controls and Takomi control plane

Tasks B09-B12. Add queue/steering/compaction/retry/bash controls, complete extension UI behavior, structured Takomi actions, and model/auth/settings parity.

**Gate:** protocol conformance table is green for every advertised action; unsupported TUI behavior produces an explicit fallback.

### Wave 3 — Every client and packaging

Tasks B13-B17. Build web/desktop, mobile, command palette/keybindings, Run Details, and environment-host packaging/install/update. Utility generation and final documentation follow in B18.

**Gate:** each capability has a web, desktop, and mobile decision, even when the decision is a truthful generic fallback.

### Wave 4 — Integrated proof and release review

Tasks B18-B19 and R01.

**Gate:** local, remote/relay, and tunnel tests pass; no browser automation occurs without user approval; reviewer signs the parity ledger and unresolved-limitations list.

## 8. Non-goals and explicit limitations

- No terminal scraping.
- No direct mutation or normalization of Pi JSONL.
- No simultaneous writers to one native session; stock original-file Attach is unavailable.
- No inactive-session deletion or `/share` parity until supported by public, authorized APIs.
- No execution of arbitrary extension code inside the T3 server process.
- No claim that extension confirmations constitute a complete sandbox.
- No pixel-perfect reproduction of arbitrary terminal UI in web/mobile.
- No repo-wide checks unless explicitly requested; use focused package/file tests.
- No changes to the user's current uncommitted Pi adapter/mobile/web work unless the implementing task first reconciles ownership and diff intent.

## 9. Task DAG correction notes

- G03 records the upstream PR comparison and generic-Pi/Takomi boundary; G04 records the reconnect audit.
- Every generic Pi task must re-check #7211 and its target architecture before implementation.
- B00 blocks every Build task that could touch existing work or depend on Takomi runtime source.
- B03A depends on B00 and blocks B13, B15, and B19; it is provider-neutral and must remain upstreamable.
- B05 and B07 depend on D03 budgets so pagination is not merely cosmetic over an unbounded scan.
- B06-B08 depend on B03 lifecycle hardening.
- B11 depends on B08's single-owner host and B12's authorization/settings decisions.
- B13 depends on B10 and B12 for interaction/model/settings UI.
- B17 packages the already-defined B08/B11 host/control artifacts for every environment-host form.
- B18 depends on final Run Details and command/keybinding behavior in B14/B16.

## 10. Definition of done

The integration is complete when:

- every capability in this matrix has an owner, support level, UI behavior, and test;
- independently created CLI sessions can be safely discovered, cloned through Pi, projected, continued, restarted, and handed back; original-file Attach remains unavailable without an enforceable Pi lock;
- no UI advertises unsupported safety or rollback semantics;
- crash recovery cannot silently hide native context from the user;
- commands, prompt templates, and skills are discoverable with correct invocation rules;
- supported extension interactions reach one durable terminal T3 state, duplicates are idempotent, and negotiated unsupported response-bearing methods cancel visibly;
- Takomi mode/workflow/board/subagent/routing/policy/todo state is useful on web, desktop, and mobile;
- packaging provides a version-compatible Pi/Takomi runtime or a precise guided-install path;
- focused contract, server, web, desktop, and mobile checks pass;
- a slow or half-open client cannot grow server buffers without bound, and reconnect converges through replay or an explicit snapshot;
- generic Pi commits contain no Takomi imports, names, branding, runtime assumptions, or semantic schemas;
- every installed/global Takomi runtime edit is represented in canonical source before packaging;
- durable user documentation states the remaining unavoidable TUI differences.

## 11. Audit references

Primary Pi sources:

- Installed `@earendil-works/pi-coding-agent@0.84.4` README and docs: `usage`, `sessions`, `session-format`, `rpc`, `json`, `extensions`, `skills`, `prompt-templates`, `themes`, `keybindings`, `tui`, `sdk`, `settings`, `models`, `providers`, `packages`, `compaction`, `security`.
- Installed declarations: `dist/modes/rpc/rpc-types.d.ts`, `dist/core/agent-session*.d.ts`, `dist/core/session-manager.d.ts`, `dist/core/messages.d.ts`.

Primary Takomi sources:

- Canonical repository: `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`
- Installed deployment target: `~/.pi/agent/extensions/takomi-runtime`
- `~/.pi/agent/extensions/takomi-context-manager`
- `~/.pi/agent/extensions/takomi-subagents`
- `~/.pi/src/pi-takomi-core`
- installed `pi-subagents@0.31.0`
- Takomi prompts, personas, policy, and board storage conventions.

Primary fork sources:

- `apps/server/src/provider/Drivers/PiDriver.ts`
- `apps/server/src/provider/Layers/PiAdapter.ts`
- `apps/server/src/provider/Layers/PiProvider.ts`
- Codex and Claude drivers/providers/adapters as first-party references
- `packages/contracts/src/server.ts`, `providerRuntime.ts`
- `packages/client-runtime/src/providerSkills.ts`
- web composer, command menu, right panel, Takomi cards/inspector
- mobile composer, thread settings, work log, provider icon
- `docs/features/takomi-pi-provider.md`
- `docs/features/takomi-tool-call-ui-audit.md`

Upstream comparison sources:

- `https://github.com/pingdotgg/t3code/pull/7211`
- `https://github.com/pingdotgg/t3code/pull/6461`
- `https://github.com/pingdotgg/t3code/issues/5020`
- `Upstream_Strategy_and_Resilience_Addendum.md`
