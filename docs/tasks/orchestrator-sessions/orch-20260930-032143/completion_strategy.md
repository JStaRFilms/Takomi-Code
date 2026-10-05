# Parity completion strategy

## Read first

Read `master_plan.md`, then `parity_ledger.md`, then the G02 report when the parent has persisted it. The ledger is the requirement index; this document assigns implementation boundaries. The historical `orch-20260903-133628` packets describe intent, not delivered code. Their clone-only rule is superseded by authorized original-file sequential attach.

This is a plan, not an implementation packet or permission to change both checkouts at once. The parent authors bounded Design/Build packets after checking G01/G02 evidence. No placeholder packets were created.

## Decisions

1. Preserve Pi RPC execution as the current owner. It already supports model/tool streaming, images, persistence, basic dialogs and private Vault transfers. Replacing the provider with an SDK host before fixing proven defects would enlarge the regression boundary without adding immediate proof.
2. Use stock RPC for all operations it actually exposes. Add a narrow suite-owned deterministic command/state bridge for required actions stock RPC cannot expose. Pi 0.99.1 public `ExtensionCommandContext.navigateTree`, session reads, reload and context diagnostics make this practical within the existing RPC process. A complete replacement SDK host is not a prerequisite for these actions.
3. Keep three authorities. Pi owns sessions/model context and running work. Takomi owns its runtime, routing, board and subagent state. T3 owns authenticated remote access, persisted projections and client drafts. Tool result cards are observations, never substitutes for deterministic control APIs.
4. Keep sequential original-file use. Release the T3-owned process before CLI continuation, then resume/sync the same original file. T3 reservations prevent two T3 threads from claiming a file, not an independently launched CLI writer. Concurrent CLI/GUI writing remains unsupported and must be stated in every applicable client flow.
5. Scope every operation to the owning environment, provider instance, thread and workspace. Use existing opaque session handles and authorization patterns. A remote client cannot open an environment path or use the provider/account on the phone/browser machine.
6. Complete functional equivalents, not terminal component emulation. Stock RPC's custom/footer/header/theme callbacks cannot render in web/RN. Provide declarative state/dialog equivalents for required semantics, and explicit terminal alternatives where security/native limitations remain.
7. Do not expand parity into account migration, store publishing, production deployment, push/PR, external session sharing or unrelated style cleanup. Changes to mobile identity/signing infrastructure require a separate decision; they do not authorize use of upstream publishing credentials.

### Trade-offs that matter

| Approach                                                   | Benefit                                                                         | Cost/risk                                                                                      | Recommendation                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Add stock RPC controls to existing adapter                 | Smallest change; preserves working sessions and providers                       | Stock RPC lacks some rich metadata and navigation mutations                                    | Use for queues, compaction, retry, bash, stats, rename, native fork/clone/tree reads                                      |
| Narrow canonical extension bridge inside existing Pi owner | Calls public command context APIs; authoritative Takomi state; no second writer | Requires explicit version negotiation and suite/app paired tests                               | Use for missing Takomi state/control and native tree navigation, auth/diagnostics where public API supports it            |
| Long-lived public-SDK execution host                       | Can own full AgentSession and richer UI contract                                | New execution/session lifecycle, resource loading and packaging; host.ts is only a probe today | Reserve for a demonstrated required API that a narrow bridge cannot reach; parent approves any replacement-owner decision |
| Model tool calls behind buttons                            | Reuses present semantic cards                                                   | Nondeterministic, can require credits or alter context, cannot prove requested mutation        | Reject                                                                                                                    |
| Direct JSONL edits for navigation/control                  | Avoids bridge work                                                              | Bypasses hooks/context rebuild; confuses leaf with append cursor; corruption risk              | Reject; bounded read-only discovery remains useful                                                                        |

## Completion graph

These are planning group IDs, not registered task packets. Split broad groups into independently reviewable vertical slices when the parent authors Build tasks. One active writer per checkout. G02 runs after G01 in the replacement workflow, so no worker result is presumed here.

```text
G01 + G02
  -> S0 compatibility proof
  -> S1 prompt/submission/run correctness
      -> S2a complete suite-root resource set
      -> S2 extension state projection
          -> S3 native operation controls
          -> S4 rich dialogs/editor
          -> S5 deterministic Takomi state/control
               -> S6 routing and prerequisites
               -> S7 native session/tree fidelity
                    -> S8 native mobile completion
               -> S9 auth/diagnostics/shortcuts/remaining equivalents
  G02 + S0 + selected bridge decisions -> S10 managed runtime
  S10 -> S11 isolated Pi utility generation
  all implemented slices -> V integrated all-client proof + focused final review
```

Mobile can implement fixed shared contracts after each backend slice, rather than waiting for all session work. S8 is a final completeness gate, not permission to defer every mobile control until the end. Packaging design can proceed once G02 identifies real inputs, but must not ship mismatched suite/Pi pins or claim SDK-host functionality that does not exist.

## First Build scope: S0, reproducible compatibility evidence

### Objective

Make `PiProtocolConformance.test.ts` truthfully distinguish frozen 0.84.4 fixtures from installed-native 0.99.1 integration. Establish a green focused compatibility baseline, or leave the native integration failure explicitly blocked. This is the first bounded implementation task. It does not change provider behavior, capabilities, the catalog allowlist or app UI.

### Builder intake

Read:

- `apps/server/src/provider/Layers/PiProtocolConformance.test.ts`, especially lines 375-481.
- `PiProtocolConformance.ts`: `probePiProtocol`, `assertPiRpcOperations`, `validatePiRpcConformanceFixture`.
- `apps/server/src/provider/testFixtures/pi-v0.84.4-rpc.json`, `pi-v0.84.4-session.v3.jsonl`, `piMockPeer.mjs`, `piSessionManagerConformance.mjs`.
- `PiProvider.ts`: `PI_ADVERTISED_RPC_OPERATIONS`.
- `packages/takomi-pi-host/src/sessionCatalog.ts`: exact verified catalog list, and `docs/operations/pi-compatibility.md`.
- Native 0.99.1 declarations/docs at the path in the ledger, plus public SessionManager exports.

Allowed implementation scope is the conformance test and, only if necessary to express separate fixture/native evidence, a small conformance helper or copied version-specific test fixture. Preserve existing fixtures and their provenance. No suite changes, dependency installation, provider code changes, live sessions, full-suite runs or documentation churn.

### Minimum truthful repair

The decoder/synthetic peer cases retain the frozen 0.84.4 label and fixture contract. The installed test must assert the identity of the configured native integration target, currently 0.99.1, separately from the replay fixture version. Merely changing every 0.84.4 string to 0.99.1 would falsely relabel old recordings.

Bind installed-native evidence to the exact resolved package path, version and metadata/declaration hashes. Keep meaningful operation checks: the actual declaration union contains the advertised methods, missing-method rejection still fails, command discovery remains distinct from RPC methods, and the checked current method union matches an explicitly attributed compatibility reference. Read-only comparison found the current union has 33 commands. A target-version parameter or a small curated target record is acceptable; accepting every version with a nonempty string is not.

Do not reuse the catalog version allowlist as proof of every RPC behavior. It verifies the bounded storage reader, not all provider semantics. Unsupported/unconfigured native integration must report a reason, never silently count a skip as compatibility success.

Keep the copied-fixture public SessionManager test. It verifies branch/custom-entry read, append and reopen with a disposable file; it does not run a model. Parent observed it fail in the eight-suite run and pass alone. Reproduce standalone and in that focused set before diagnosing. If it fails again, capture resolved target metadata and failure output. Inspect the actual cause before expanding allowed files. Do not guess timing/concurrency and add a sleep.

### Acceptance criteria

- Synthetic framing, malformed/oversized output, out-of-order responses, isolated child reaping and fixture validation remain checked against the unchanged frozen fixture.
- The installed-native group identifies its actual target and checks package/declaration evidence and advertised operations. Installed Pi 0.99.1 does not fail merely because an old fixture is 0.84.4.
- A deliberately missing advertised operation still fails the existing assertion. No assertion is deleted merely to make the suite green.
- Copied-fixture source checksum stays unchanged, native append parents the active leaf, reopened custom state/tree remains valid, and only disposable copies are written.
- Standalone and the original focused multi-file baseline are run and recorded separately, including skips and failures. Any unexplained native failure remains a blocker rather than being relabeled success.
- Narrow lint/typecheck for changed files passes. No source or state writes outside owned files/disposable test directories.

### Focused checks

Start with `vp test run apps/server/src/provider/Layers/PiProtocolConformance.test.ts`. Then rerun the exact eight-file set from the parent's previous transcript. The master plan records counts, not all eight names, so the builder must obtain the original command rather than invent it. If unavailable, report that limitation and run a clearly labeled new focused set covering conformance, PiProvider, catalog, attach, history, sync, lifecycle and relevant picker logic. It is not an exact reproduction of the reported baseline.

Do not run repo-wide test/typecheck/check. Relevant host fixture checks, if touched, use `node --experimental-strip-types --test <specific host test files>`. G01 has not executed any of these commands.

## S1: correct command lifecycle before adding controls

This is the first app-behavior slice after S0. Read A's `handleMessage`, `sendTurn`, `completeTurn`, pending Vault state, process generation checks and T1's synthetic scenario helper. Read N prompt preflight and EC commands before designing settlement.

### Settlement contract

Represent submitted requests and native runs as separate facts inside the adapter:

- Each submitted prompt has native request ID, generation, T3 turn association, disposition, submitted command identity if present, command error and terminal/acknowledged state.
- Each observed native run has a generation-local sequence and active/settled state. Track `agent_start` as well as `agent_settled`; model/tool events also cannot be dropped if they precede acknowledgement.
- `started` acknowledges acceptance, not completion. `queued` acknowledges submission to native queues and must not complete the active run. `handled` acknowledges consumed input or finished command handling, not absence of independently started model work.
- Command-only completion needs a matching handled acknowledgement plus proof no run is outstanding for that submission. Use ordered processing and a post-acknowledgement state check where needed; never overwrite an active run with idle solely from the response.
- Known canonical no-model commands may carry explicit suite-declared execution semantics. That declaration belongs with the suite handler, not a hard-coded wildcard based on slash names. `/takomi-status` is grounded no-work behavior; `/takomi routing <text>` is not.
- If work starts after handled settlement, it is an independent run with its own visible runtime lifecycle. Do not suppress it because the submission was handled or attribute its completion to a different later user turn. Stock RPC does not give a causal run ID for arbitrarily delayed extension work. S1 must state the supported attribution contract; S5 can provide explicit correlation for canonical extension-started work.
- A matching command extension_error marks that command outcome failed even when Pi subsequently emits success handled. Success false is preflight rejection. Stale generation/ID responses cannot settle a replacement or unrelated request.
- Dialog and Vault cancellation remain one-use and generation-scoped. Preserve private logging interception, secret redaction and export transfer ownership while generalizing request tracking.

The parent should confirm whether independent native runs become their own provider turn or a separate thread activity before authoring the final S1 packet. Existing turn/checkpoint semantics must remain truthful. An adapter-only fix is preferred if it can express both run orders without losing events. A provider-neutral event addition is justified only by a demonstrated case the existing contract cannot represent.

### Required red-first cases

1. A discovered `/takomi-status` emits notify then prompt handled and no agent events. Exactly one terminal command outcome, ready state, no fake assistant message.
2. A handled input handler, not only a slash command, starts no run.
3. An extension command starts independent model work before handled. Busy remains truthful and one run completion settles it.
4. Handled arrives before independent agent_start. Later work is visible and settles once; no orphaned content or false idle while it runs.
5. Started normal prompt and queued steer keep existing behavior. A handled command during an already running turn cannot complete that run.
6. Command extension_error then handled produces failed command outcome; rejection, duplicate response and replacement-generation cases remain isolated.
7. Stop/timeout/dialog/secret races produce one settlement; Vault add/import/export/delete behavior remains private.

Use synthetic events and receipts/deferred worker drains, not sleeps or provider network calls. Extend T1 and the synthetic peer only for these meaningful orderings. Integration into runtime ingestion gets a focused test if turn/run mapping changes. Client proof remains pending until V, even if server tests pass.

## Later vertical slices

| Group | Ownership and bounded deliverable                                                                                                                       | Dependencies                                                | Measurable acceptance and checks                                                                                                                                                                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2a   | App R/T3/T1 only. Include canonical Vault in shared explicit suite resource set; preserve companion deduplication and trust                             | S0, preferably S1 first                                     | Suite-only disposable layout discovers and starts all seven canonical extensions; no global Vault needed, no duplicate tools. Focused PiProvider/PiAdapter launch-resource tests                                                                                                                                                                                 |
| S2    | App F/A/J plus client-runtime, web/RN consumers. Keyed status/widget/title/editor-text projection                                                       | S1; Design decides draft/title ownership                    | Set/replace/clear keyed state; reset generation; bounded snapshot reconnect; severity retained; router-status report visible/dismissible; editor text never auto-sends or overwrites another client's draft. T1/T6/schema/connection tests and real clients later                                                                                                |
| S3    | App provider service/adapter/contracts and current client controls. Split manual compaction/stats first, then queues, retry, then direct bash           | S1/S2 fixed contract; Design for interaction                | Native calls and rejection/cancel paths, capability gating independent of slash discovery, queue modes and actual contents, clear before abort, include/exclude bash context. Extend ProviderCommandReactor/ProviderService tests and T1 per behavior; all clients consume same contract                                                                         |
| S4    | Canonical suite rich-dialog descriptor/fallback, app F/A/Q. Keep private Vault path separate                                                            | G02, S2; Design for rich question/editor                    | Preserve option IDs/values/descriptions, multi-select and multi-question answers, bounded preview and actual editable prefill. Invalid answer stays pending with reason; cancel/timeout/replacement resolves once; old hosts retain safe basic fallback. Focused suite question/subagent tests identified by G02, T1/Q/shared helpers                            |
| S5    | Canonical runtime/control bridge, then app routing/projection/client controls in separate commits                                                       | G02, S1/S2/S4; Design for mode/board/run controls           | Read authoritative state without a model turn; direct mode/stage/gate/reset/workflow/board mutations; task reopen/checklist; persistent state reconciles after CLI use; subagent preview/start/status/stop/resume have real run IDs and legal transitions. Tests cross bridge and app authorization; never infer success from a card                             |
| S6    | Canonical routing/prerequisite read-preview-apply methods; app configuration UX                                                                         | S5                                                          | Whole authored policy preserved, project/global source explicit, deterministic preview/confirmation, expected-revision conflict, cancel makes no write, executable routing distinct from prose; actual skill/policy load/gate reflected. Extend existing suite routing safety/gate tests via G02 and focused app control tests                                   |
| S7    | App session contracts/adapter/host readers/hydration and web/mobile session journeys; narrow suite navigate/reload bridge where needed                  | S1/S5; S0 fixture correctness; Design for tree/history      | Entry-ID append cursor and leaf diverge correctly; multiple roots/abandoned branches shown accurately; native fork/clone hooks/veto/text preserved; rename/stats/import/export on owning environment; older selection paging bounded; sequential release/CLI append/reopen/sync no duplicates. T2/T4/T5 plus actual disposable CLI/GUI handoff                   |
| S8    | Native RN implementation using fixed shared contracts. Split catalog/release/sync from semantic board/subagent detail                                   | Backend contract for each behavior                          | Android/iOS flows stay native; no webview replacement; catalog attach/fork/release/sync work, child selection filters correctly, authoritative controls and rich dialogs usable, reconnect/cancel/accessibility states. Focused mobile behavioral tests then test-t3-mobile on available devices                                                                 |
| S9    | App and narrow suite APIs only where needed. Auth/router diagnostics, resource reload/trust, shortcuts/themes/context panels, sound and artifact access | S5/S6/S7; Design/auth ownership decisions                   | Account flow owned by initiating T3 auth session/environment; login cancel/logout state; reports safe and dismissible; exact command arguments validated; terminal-only features explain alternative; unknown tools remain legible. No account migration or secret-file access. Use Claude/Codex/Antigravity as patterns, not semantic replacements              |
| S10   | App packaging/maintenance plus canonical runtime pins/assets/license manifest; no installed-live mutations                                              | G02/S0, finalized bridge protocol                           | Disposable packed/extracted/installed trees match manifest and compatibility, owned vs user files separate, compatible runtime located in packaged desktop/server, overrides visibly external, controlled version swap never replaces leased runtime, manual external installs remain supported. T7, focused packaging tests, installed artifact proof by parent |
| S11   | App PiDriver/TextGeneration implementation using isolated SDK/model context                                                                             | S10 or explicit isolated runtime boundary                   | All four utility methods work without opening/writing chat sessions, running tools/extensions/hooks or polluting user context; correct instance auth/model, cancellation/reaping, bounded structured output and errors. Extend provider text-generation pattern tests, not chat prompt reuse                                                                     |
| V     | Parent integrated verification and reviewer, no hidden substitutions                                                                                    | All required rows implemented or approved native equivalent | Every ledger row has applicable focused checks and real-client proof; capture exact source/build/runtime versions, commits, client/device/mode, reversals and limitations; final review acts only on confirmed blockers                                                                                                                                          |

## Minimal proposed interfaces

Names below are design proposals, not existing APIs. Reuse existing provider/service/event contracts where possible. A narrow explicit operation union is preferable to a generic remote shell or arbitrary Pi-command endpoint.

### Native controls

An authenticated environment operation accepts threadId, operation discriminant and its typed arguments. Server resolves instance/workspace/current process; clients do not submit native sessionFile paths. Read operations use orchestration-read scope; mutations use orchestration-operate, following `RpcAuthorization.ts`. Return explicit accepted/completed/cancelled/failed results with actual native data and current state. Long operations use existing receipts/events rather than holding a client-dependent lifecycle open.

Add `ProviderAdapter.compaction` with type native for Pi, following Codex's `compaction.start` pattern. Existing web `ContextWindowMeter.logic.ts` checks slashCommands for compact. Replace that inference with an explicit capability for all relevant consumers while preserving Claude's slash-command execution and Codex's native compaction. Other providers need no invented Pi settings; unavailable capabilities stay hidden with truthful explanations.

Queue state includes actual steering/follow-up strings and modes within strict limits. A single-item edit is a clear/read/requeue operation because stock RPC has no item mutation. Define interruption race behavior before presenting edit/clear controls. Bash results include excludeFromContext, cancellation, truncation and authorized artifact handle, not only a host path.

### Narrow suite control/state bridge

Protocol version 1 should carry requestId, supported action, schemaVersion, request generation/session identity, response outcome and bounded stateRevision. Required modules own their state; a runtime bridge coordinates access rather than duplicating board/routing/subagent databases inside T3.

Use an explicitly registered deterministic extension command with a bounded structured payload for requests through stock prompt. Do not invent a Pi registerRpc API or forward unrecognized stdin types, since native dispatch rejects them. Responses/state can use an explicitly versioned JSONL record intercepted by the adapter, like the existing private Vault record precedent, or a public custom-message contract if it preserves no-model-context and redaction requirements. G02 must choose the smallest actual suite mechanism after inspecting existing APIs.

Minimum actions:

- `state.read`, plus mode/stage/gate/reset and workflow catalog/start using existing handlers.
- board read and allowed task/checklist mutations with authored-artifact validation.
- subagent preview/start/read/stop/resume with stable run IDs, only if those transitions exist in the actual controller.
- routing/prerequisite read/preview/apply/load with source/scope and revision checks.
- session navigate and resource reload using public command-context APIs, not raw file writes.

Mutations should compare expected revision where concurrent clients can change durable state. A stale request fails with current revision rather than silently overwriting user work. Successful controls do not ask an LLM to choose a tool and do not insert artificial user/assistant messages into model context. Suite user-gate provenance must distinguish an authenticated user action from a model-issued tool.

Stock `ExtensionCommandContext.navigateTree` inside RPC returns only cancelled in the installed binding. If the GUI needs editor text, read the selected entry's user text safely before navigation and use the result/state to issue an explicit client editor suggestion. Do not claim the discarded AgentSession return fields are already transported. `get_entries/get_tree` and readonly session manager give native leaf IDs without starting a second owner.

### Rich dialogs and client state

Extend existing canonical questions only for information that cannot survive today. Native kind, editor prefill, structured preview, option value/description and multiSelect need versioned fields; existing clients already understand generic multiSelect. Do not replace the private secret-input method with ordinary thread.user-input.respond. Validation belongs in the suite handler and authenticated server; clients render errors and retain drafts. Responses are one-use and generation-scoped across multiple clients.

Status/widgets are keyed current state, not a growing warning stream. Cap count, line lengths and aggregate bytes, expose truncation, and handle key deletion. Strip terminal escapes without interpreting markup. Runtime title is thread-local metadata. Editor updates carry intended initiating-client ownership and apply only to the associated draft generation; on conflict, offer a suggestion rather than replacing typed content.

### Session state

Track nativeSessionId, opaque file binding, appendHighWaterEntryId, activeLeafId and branch/display revision separately. Historical visible messages map to immutable native entry IDs, not fuzzy text identity. Native entries distinguish model context, visible transcript and abandoned branches. Imported activities must be frozen historical records and have no live rerun/approval affordances.

Keep existing bounded catalog reads and cursor scope checks. Native get_entries/get_tree return potentially large data; normalize/bound in the environment host and paginate projected entries rather than pushing an unbounded tree over WebSockets. If a single native response exceeds transport limits, report an incomplete result or use a bounded public read boundary; never label valid large sessions malformed. Preserve both isolated fixes.

## Design decisions before implementation

Design owns interactions and existing visual patterns, not provider semantics. Its packets should decide:

- command-only outcomes vs independent run activity and the visible status/checkpoint boundary;
- queue steering/follow-up distinction, clear/edit/abort and draft restoration;
- multiline editor/rich preview/multi-question interaction on web and native phones;
- thread-local title and multi-device draft update conflict behavior;
- authoritative mode/gate/workflow/board/run controls with legal reverse states;
- native tree/active-branch/current-context distinction, older pages and fork provenance;
- remote account callback ownership, artifact download and terminal-only alternatives;
- mobile catalog and semantic-detail navigation using current RN components.

No new visual language is required. Reuse current Claude/Codex menus/questions/compaction entries where their behavior fits. ClaudeAdapter uses slash-command compaction; CodexAdapter uses native compaction. Neither pattern authorizes sending terminal-only Pi /compact as a prompt. Codex option IDs and async-question handling show why presentation labels and native response semantics must remain separate.

## Verification prerequisites and stop conditions

The parent currently lacks built-in Browser tools. Do not install or substitute Playwright, Puppeteer, an alternate browser system, screenshots/static markup or an HTTP request as a real-client round trip. Keep affected client rows open until authorized tools are available or a human supplies identified manual evidence.

G01 found node and vp on PATH. adb was not on PATH. No device/browser/server was queried or launched. The parent must identify an available Android/iOS target and authorized test-t3-mobile workflow. If the native client is missing/outdated, its authorized ensure/build/install step comes before Metro and integrated testing. Desktop proof requires installing/opening the built artifact on a confirmed test target, separate from shared web proof. No live builds or servers may be displaced.

Use disposable Pi sessions for release/CLI/GUI back propagation, including branched, compacted, multi-root, repeated-text, image/tool and large-record fixtures. Record the configured instance binary and suite source/version, not merely PATH Pi. The suite's 0.84.4 pin must be reconciled with target 0.99.1 and private pi-subagents 0.31.0 compatibility before packaging claims.

Verification matrix must cover local web, hosted/remote web, desktop local server and remote connection, Android/iOS, relay/tunnel, two environments and two clients racing a one-use request. Keep tests proportional: server checks prove contracts and races; one parent integrated pass per affected client proves the assembled behavior. Failed tests, unavailable clients and unfinished runtime packaging remain open.

Stop and report if suite allowed files overlap existing work, the native version/fixture failure cannot be reproduced truthfully, a required controller/API transition does not exist, secret handling would be widened, or a change requires external publishing/deployment/account migration. Ordinary bounded slices remain authorized by the master plan. The parent commits each verified/reviewed implementation slice with explicit owned files; orchestration artifacts stay out of those commits.
