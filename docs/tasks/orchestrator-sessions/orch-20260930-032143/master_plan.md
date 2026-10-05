# Orchestrator Master Plan

Finish Pi and Takomi functional parity.

Session: `orch-20260930-032143`
Implementation project: `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`
Branch: `feat/pi-parity-next`
Initial revision: `bc1c9ccd85c9d9b054dd541774e42136c535f625`
Canonical extension source: `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`

## Mandate and approvals

Finish the original Pi/Takomi integration brief, not just the session-picker bug. The user authorized specialist subagents, narrowly scoped changes to the exact canonical suite checkout above, and functional parity across web, desktop and mobile using GUI equivalents for terminal-only behavior. Continue from reconciliation through Design and Build without asking for approval of each ordinary slice. Pause only for material new choices, missing permissions, unavailable verification, irreversible actions, or overlapping user work. Do not claim complete parity while a required item is failing, partial, or untested.

The user requested commits along the way. Commit a bounded implementation slice after focused verification and review. Stage only owned files. Suite changes have separate commits. No merge into the live checkout, push, PR, publishing, account migration, credential changes, or production deployment is authorized. Keep local orchestration artifacts out of implementation commits.

### Original brief

> please do super detailed audit on PI + Takomi Extensions to see to it that we can have a perfect 1 to 1 representation of everything in PI/Takomi in this T3 code fork aka Takomi Code.
>
> so you are looking for how we can map all the features including slash commands skills etc and so on and so forth to the application exactly as it is, even features like back propagation, like let's say I already have a pi session I stated before from the cli, I can open the UI and be able to do a resume whatever and contue from where I stoped. Ill unserstand if the UI of the full chat doesn't load exactly but then it would be nice if we can get very close. or whatever...
> Long tory is I want the best possible integration so you are going to make a plan and then an orchestration session detailing everything bit by bit so I can audit and then tell you to start building, you kida need to prove to me that it would work though.
> Make sure the task prompts you write are detailed enough and gorundedn using agent engineering skill etcc to ensure that even a dumb model can produce a near perfect implementation .
> Note some of the features are already implemented, some might be bad implementations so make sure you do your own cross checking referenceing the ui implementations for claude code and codex cuz those are first party wha tnot etc..

Implementation is now authorized. The original audit-only gate is superseded. The user's newer session decision supersedes the historical clone-only rule: sequential use of the ORIGINAL Pi session file is required; concurrent CLI/GUI writes are not supported. Fork remains an option.

## Operating rules

- Preserve `C:/CreativeOS/01_Projects/Code/Clones/2026-07-22_t3code`, `feat/pi-debrand`, existing live app state, running builds and servers.
- Explicitly set every subagent cwd. The parent harness cwd is the live checkout, not the implementation worktree. Specialist subprocesses do not expose takomi_board, and the parent's board writes into the protected live checkout. Native board registration is therefore unavailable at the correct target. Following the user's instruction to continue, keep the authored session, status and review records in this isolated worktree; do not create a substitute native board or write into the live checkout. Use synchronous delegation and verify every return before proceeding.
- One active implementation writer per checkout. Independent read-only investigations may run alongside that writer. No subagent-owned dev servers, browser automation, installs, or native builds.
- The suite currently has another session's staged and unstaged planning artifacts, under `docs/tasks/orchestrator-sessions/orch-20260929-223951`. Its initial observed HEAD is `7dfc9ad9eb4cada78847965efa42484e1c821440`, not the older audit baseline. Treat versions and state as observations to recheck. Preserve all staged work; use explicit file staging only for owned suite changes and verify overlap before writing.
- Read repository AGENTS instructions and the relevant source/tests/config first. For Effect code, read `.repos/effect-smol/LLMS.md`. Follow existing Claude/Codex UI and provider patterns where applicable, with capability gating rather than invented Pi semantics.
- Use focused checks only, not repo-wide check/test/typecheck. Fix actual regressions and requirement violations. One implementation pass and one focused review is the default; reuse the writer conversation for confirmed corrections.
- No model-mediated buttons pretending to be direct controls. Keep Pi as execution/session authority, Takomi as extension-state authority, and T3 as authorized remote projection.
- No secrets, pairing links or conversation content in reports. Use disposable session fixtures, not live sessions, for writes.
- Functional equivalents replace terminal layout, not functionality. Record a native limitation with source evidence and an explicit user-visible alternative; do not silently mark an omitted feature complete.

## Current evidence

Two isolated commits are already present: `993e287bdd` verifies the catalog on Pi 0.99.1; `bc1c9ccd85` treats oversized native records as incomplete metadata rather than malformed sessions. The original checkout is still at `a3ac94d0c2`.

The user reports the Continue path works. Release/CLI-return/GUI-sync verification is still pending. Basic execution, model selection, resource discovery, session attach/fork/hydration/sync, web semantic cards and private Vault interaction already exist. Do not rebuild them indiscriminately.

An audit found a source-level completion gap: on Pi 0.99.1, `prompt` can return `data.disposition = handled` without an agent run. PiAdapter special-cases command-only Vault requests, but not general extension commands such as `/takomi-status`. Check this with a failing focused test before changing it. Commands can ALSO start work, so a blanket settlement on every handled response is not sufficient.

Focused baseline: eight suites initially produced 110 passes and 2 failures. A standalone `PiProtocolConformance.test.ts` rerun passed the native fixture continuation but failed the hard-coded installed-version assertion at line 378, expecting 0.84.4 while installed Pi is 0.99.1. Diagnose the native integration-test isolation/version contract; do not simply delete assertions or declare compatibility from a version string. Prior checks on the two isolated fixes passed, but do not establish full product parity.

## Required parity ledger

Each row needs native source/version, existing implementation references, web/desktop/mobile status, RPC/SDK/extension boundary, meaningful test proof, client-test proof, completion task, and explicit limit/alternative. Statuses must distinguish implemented, verified, partial, missing and native-limited. Avoid speculative percentages.

Account for all native RPC commands and relevant built-ins plus every canonical extension's commands, tools and visible behavior. Include companion extension question/todo/context/browser behavior only where actually installed and discoverable; do not assume an arbitrary extension has a bespoke renderer.

Coverage groups:

1. Prompt lifecycle, accepted/queued/handled semantics, streaming/tools/reasoning/images, abort, process replacement, restart, reconnect and crash reconciliation.
2. Slash commands, templates, skills, argument/source metadata, project trust, refresh, command-only completion and error/cancellation reporting.
3. Steering/follow-up queues, queue mode/state/edit/clear behavior, interruption parity.
4. Manual/automatic compaction, retry status/abort/toggle, direct Pi bash/context inclusion.
5. Model/thinking settings, auth/account flows, OAuth-router diagnostics, resource/system-prompt/context diagnostics.
6. Session catalog, original-file sequential attach, clone/fork provenance, rename/stats/export/import, native tree/active leaf/branch navigation, bounded history and deeper fork selection.
7. Rich questionnaires, multi-question/multi-select/options/previews, editor fidelity, extension status/widget/title/editor-text projection and unsupported-method behavior.
8. Takomi mode/stage/gate, workflow launcher, board/task/checklists, persistent state and deterministic controls.
9. Subagent single/parallel/chain/async/fork/worktree activity, preview/confirm, status/interrupt/resume, child selection and artifacts.
10. Routing preview/confirmation/configuration, policies/skills/context prerequisites and source-of-truth synchronization.
11. Vault private input/transfers/reveal limits and safe return/cancellation; unknown extension fallback and terminal-only alternatives, shortcuts/themes.
12. Native mobile equivalents for session flows and semantic presentation; web entry points, desktop shell and all connection modes.
13. Managed runtime packaging, compatible versions/assets/licenses/overrides/update diagnostics; T3 utility text-generation integration without session pollution.

## Lifecycle and delivery

Genesis is a short reconciliation on a mature application, not a new-product PRD exercise. Design defines interactions for the missing behavior using the current design system. Build proceeds in independently reviewable vertical slices after their dependencies and interfaces are decided. Do not create boilerplate or placeholder task packets.

### Task table

This is file-based session tracking, not a registered native board. G01's board-registration requirement was replaced by the documented worktree-only tracking fallback; its evidence artifacts have been checked by the parent. The two original asynchronous launches produced no tracked runs or artifacts; both investigations were completed using synchronous replacements.

| ID         | Stage                 | Role         | Objective                                                                                                                                   | Dependencies                          | Status                                                                                                                                        |
| ---------- | --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| G01        | Genesis               | architect    | Reconcile app parity and produce the authoritative ledger and completion strategy.                                                          | none                                  | completed, native board unavailable                                                                                                           |
| G02        | Genesis               | worker       | Inventory canonical extensions, actual pins, mappings and bridge needs.                                                                     | none                                  | completed, report persisted                                                                                                                   |
| D01        | Design                | designer     | Define all-client interaction contracts for missing Pi controls, extension state, rich questions, Takomi controls and session/mobile flows. | G01, G02                              | completed, parent-persisted design contract                                                                                                   |
| B01        | Build                 | coder        | Repair version-attributed conformance tests without changing provider behavior; reproduce native integration proof.                         | G01, G02                              | completed, user accepted unchanged lint baseline; measured bounded deadline fix approved; committed 1233584a8d                                |
| R01        | Build review          | reviewer     | Check B01 correctness, proof attribution and lint provenance.                                                                               | B01 implementation                    | completed, original approval plus same-reviewer deadline follow-up                                                                            |
| B02        | Build                 | coder        | Correct command submission disposition and actual native-run lifecycle without losing independent work or private Vault handling.           | G01, G02, D01; B01 native tests green | completed, reviewed corrections, committed c77ef31fd8                                                                                         |
| R02        | Build review          | reviewer     | Review B02 native/command ordering, persisted ownership and privacy.                                                                        | B02 implementation                    | completed; two confirmed defects fixed and parent-verified                                                                                    |
| B03        | Build                 | coder        | Include canonical Vault in explicit/inferred suite loading and prove duplicate/trust/missing-path behavior.                                 | G02, B02                              | completed, reviewed corrections, committed aa27b04c40                                                                                         |
| R03        | Build review          | reviewer     | Review actual Vault loader/duplicate identity and companion preservation.                                                                   | B03 implementation                    | completed; two reproduced defects fixed and parent-verified                                                                                   |
| A02        | Build planning        | architect    | Select typed all-client extension-state/command-result projection and safe draft semantics.                                                 | G01, G02, D01, B02                    | completed, parent-persisted A02.plan.md                                                                                                       |
| B04        | Build                 | coder        | Preserve native notification severity and typed command outcomes in durable activities and all-client work logs.                            | B02, B03, D01, A02                    | completed, R04 approved, committed 7c60af6903 after user-authorized exact stale-lock removal                                                  |
| R04        | Build review          | reviewer     | Check notice/outcome metadata, native lifecycle and actual all-client presentation.                                                         | B04 implementation                    | completed, approved with independent baseline-warning/hash checks                                                                             |
| A03        | Build planning        | architect    | Resolve authoritative process ownership, bounded snapshot delivery and known producer privacy against actual source.                        | A02, B01-B04                          | completed, parent selected direct ephemeral publication in A03.plan.md                                                                        |
| B05        | Build                 | coder        | Deliver bounded current extension state and authorized reconnect/coalescing transport/shared state.                                         | A03, A02, D01, B04                    | completed, f5183248d3; parent64focusedpasses, user accepted precisely two unchanged Windows-Claude fixture failures                           |
| R05        | Build review          | reviewer     | Check concrete leases/layers/bounds/atomic stream/auth/session fences and independently attribute baseline failures.                        | B05 implementation                    | completed, source/deletion/performance corrections approved; baseline attribution independently verified                                      |
| B06        | Build                 | coder        | Render statuses/widgets/runtime subtitles on web/desktop/mobile.                                                                            | B05, D01                              | completed,0d80793570; R06approved,parent35focusedpasses,3types,integratedclientproofopen                                                      |
| R06        | Build review          | reviewer     | Review actual all-client bindings/owner/support/plaintext/disclosure/stale/placement/accessibility.                                         | B06                                   | completed,sourceapproved,nointegratedclaim                                                                                                    |
| B07        | Build                 | coder        | Offer explicit safe per-device editor suggestion actions without automatic draft writes/sends.                                              | B05, B06, D01, M01, G03               | completed,45f9b7902f,324tests/threetypes,parent151,19ownedfiles/normalhook                                                                    |
| R07        | Build review          | reviewer     | Verify actual local draft/source/selection/native revision and dismissal guards.                                                            | B07                                   | completed, independent324tests/threetypes and no confirmed blocker; installed-client proof open                                               |
| A08        | Build planning        | architect    | Ground native compaction/stats in actual APIs and existing UI.                                                                              | G03,B07                               | completed, A08.plan.md; second report corrects idle-only stock-RPC assumption                                                                 |
| B08a       | Build safety decision | architect    | Define native atomic compaction ownership before exposing manual mutation.                                                                  | A08                                   | blocked, stockcompact aborts independentwork; needs separate approved native runtime/delivery change                                          |
| B08b       | Build                 | coder        | Add bounded authenticated native session stats through current controls and small details UI.                                               | A08,B07                               | completed,456ce9fcc6,36ownedfiles/normalhook; parent23stats+13privacy; scopedtypes/lintfmt                                                    |
| R08b       | Build review          | reviewer     | Verify bounded DTO/privacy, active native owner/version/process, scoped clients and existing UI.                                            | B08b                                  | completed, confirmed malformed-type privacybug fixed/redfirst9; same reviewer originalrepro+13privacy+12adapter/servertypes approved          |
| A09        | Build planning        | architect    | Ground actual native queue APIs and existing local draft/outbox behavior.                                                                   | B08b,user choice                      | completed, A09.plan.md; native clear_queue exists, mode setters persist global defaults                                                       |
| B09a       | Build                 | coder        | Read native combined pending count and modes without changing drafts, sending or settings.                                                  | A09,B08b                              | completed,496f7f409d,33ownedfiles/normalhook; parent20DTO/client+6RPC+2service                                                                |
| R09a       | Build review          | reviewer     | Verify queue readback/privacy/currentlease and final async-boundary ownership.                                                              | B09a                                  | completed, confirmedpost-read delete/restart race fixed/redfirst4; same reviewer2service+6RPC/servertypes approved                            |
| A09b       | Build planning        | architect    | Trace explicit input, authored history and full attachment support.                                                                         | B09a                                  | completed, ordinary-message reuse withdrawn after source trace; user approved labeled typed history plus text/images/files/context            |
| B09b       | Build                 | coder        | Explicit native steering/follow-up with typed submission history, attachments and guarded drafts.                                           | A09b,B09a                             | completed,da3a3574f4,64ownedpaths/normalhook; parent133+9decisive passes; five types                                                          |
| R09b       | Build review          | reviewer     | Inspect integrated input/history/attachments/privacy and draft lifetime.                                                                    | B09b                                  | completed, pending-forever blocker red-first fixed/local60s; same reviewer originalrepro+75checks APPROVE; exact reactorbaseline useraccepted |
| M02        | Build integration     | orchestrator | Merge reviewed source into the confirmed Pi parity target.                                                                                  | B09b,userapproval                     | completed, backup preserved0720935; clean fast-forward toda3a357; debrand/data untouched                                                      |
| W02        | Build artifacts       | worker       | Produce Windows x64 test installer through documented local workflow.                                                                       | M02                                   | completed,0.0.44EXE136502344bytes; packagedpayload validated,parentSHAverified; no install                                                    |
| A02-build  | Build artifacts       | worker       | Produce standalone Android arm64 preview APK through managed staging.                                                                       | M02                                   | completed,1.3.1-da3a3574APK92297099bytes; arm64/debugsignature,parentSHAverified; no install                                                  |
| QA-handoff | User testing          | orchestrator | Give both-app comparison checks and identify unverified/remaining parity.                                                                   | W02,A02-build                         | completed,TEST_CHECKLIST-da3a3574.md; testing is user-led, not claimed performed                                                              |
| B09c-d     | Build planning        | coder        | Leased queue-event lists and clear/held text recovery.                                                                                      | B09b,A09                              | pending, author full packets before execution; native mode mutation requires target permission                                                |
| M01        | Build integration     | coder        | Merge pinned updated parity branch, resolve textual and semantic clashes, preserve reviewed behavior.                                       | B01-B06 and user merge                | completed, reviewed merge058d96cfa6,899passes/two exact accepted Windows baseline failures,7types; parent42passes                             |
| RM01       | Build review          | reviewer     | Verify five conflict resolutions,24 overlaps and intended dependency graph.                                                                 | M01                                   | completed, independent899passes/7types and required incoming patch context preserved                                                          |
| G03        | Build planning        | architect    | Reconcile new upstream features and remaining parity scope against actual merged source.                                                    | M01                                   | completed, G03.rescope.md covers204 entries, B07 updated for current editor APIs                                                              |

### Progress checklist

- [x] User authorized specialist delegation, both source repositories, all-client functional equivalents and slice commits.
- [x] Original app checkout preserved; app implementation baseline verified.
- [x] Current app/native-command/client ledger and canonical-extension inventory returned synchronously.
- [x] Tracking fallback documented without claiming native board registration.
- [x] All-client interaction contract returned and parent-persisted for bounded Build packets.
- [ ] All interaction groups converted into implemented and reviewed slices.
- [ ] Compatibility slice fully accepted: tests/typecheck/format green and source reviewed; pre-existing lint acceptance remains open.
- [ ] Remaining parity slices implemented, reviewed and committed.
- [ ] All-client integrated proof and final ledger review complete.

### Planned delivery waves, not yet registered task packets

- Establish a reproducible compatibility proof and correct command-only lifecycle semantics.
- Design and expose Pi-native controls, queue state and richer extension interaction without lying about capability support.
- Implement deterministic Takomi state/control bridges and native client presentation where stock RPC is insufficient.
- Finish branch/session/history/import/export fidelity and mobile continuation.
- Package a managed runtime, close utility generation gaps and reconcile shipped user guidance.
- Perform integrated all-client verification and final review against every ledger row.

G01/G02 findings determine exact task boundaries and order. Each task packet must name its sources, allowed files, contract, reverse states, tests, deliverables, dependencies and measurable completion criteria. Parent orchestrator authors and tracks Design/Build packets after synthesis. B01 is a non-UI verification foundation and may run alongside D01; feature UI implementation follows reviewed Design contracts. Do not delegate the entire remaining application to a single coder.

## Skills and model routing

- Author packets using `agent-engineering` and its writing-for-agents/spawn-task guidance; use `unslop` for human-facing text.
- Architect: `openai-codex/gpt-6.1-sol`, high for the cross-boundary completion plan.
- Bounded inventory worker: `openai-codex/gpt-6-luna`, high.
- Designer: Sol medium, existing design system and all-client interaction contract; Gemini exploration only if a genuinely new visual direction is necessary.
- Coder: Sol high for serious implementation, Luna high only for bounded repetition with fixed interfaces.
- Reviewer: Sol medium/high by risk. Reuse conversations for corrections. Exact model IDs and skills go in each launch and board task.
- Client verification: `test-t3-app` and `test-t3-mobile` where tools and devices exist. Use only the authorized built-in Browser workflow for agent-driven web verification. Those tools are currently absent in the parent session; don't substitute another browser system or pretend screenshots/static tests are a client round trip.

## Completion contract

The session is complete only when every required ledger row has its agreed functional behavior, focused checks and applicable integrated client proof, or a demonstrated native API limitation with a documented supported equivalent. Failed tests, inaccessible clients and unfinished managed-runtime delivery stay open. A partial milestone is not whole-project completion.

Each slice records its exact commit, test commands/results, review disposition and limitations. Final synthesis identifies supported Pi/Takomi versions, all client coverage, sequential handoff proof, remaining unavoidable limits, and distribution prerequisites. Temporary lack of Browser tools or a mobile test device is a verification blocker, not permission to claim parity.
