# D01: Define build-ready functional equivalents across clients

## Agent setup

Launch cwd `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`. Read root AGENTS.md and this session's master_plan.md, parity_ledger.md, completion_strategy.md and G02.report.md. Follow UI/UX Design workflow. Load unslop. Prime from the actual web/mobile design system and first-party Claude/Codex interactions, not a new visual concept.

This task is read-only. Return the design report inline for the parent to persist. B01 is the only writer. No files, edits, commits, subdelegation, installs, code execution, clients, dev servers or browsers. Design is UI/UX, not replacement-provider architecture. Existing tools are not a license to invent backend APIs.

## Objective

Define testable all-client interaction contracts for the ledger's missing functions, reusing current T3 UI and Pi/Takomi native authority. Resolve the minimum product decisions needed to author bounded Build packets without repeatedly asking the user.

## Sources to inspect

Web `ChatView`, composer/toolbar/menus, `components/piContinue`, `TakomiToolCallCard`, `TakomiInspector`, question/secret cards, command palette, settings sections and shared components. Mobile composer/command menu/question/task/work-log/settings/navigation and environment selectors. Contracts for provider capabilities, runtime events and questions. Existing Claude/Codex compaction/queues/lifecycle/actions and native Pi 0.99.1 RPC references. G02 establishes suite widget/status/control sources.

## Required interaction contracts

For each group, specify entry points, native action/equivalent, visible states, errors/cancel/reverse actions, authorization/ownership, source of truth, mobile equivalent and a meaningful real-client acceptance scenario:

1. Command results without assistant messages; preserving notification severity; settled command vs actual running agent.
2. Native steering/follow-up choice and queue state/edit/clear/modes; what Stop returns to the editor and what it actually cancels.
3. Manual compaction/instructions, automatic-compaction toggle, retry status/cancel/toggle, direct Pi bash with context inclusion, session usage/context stats. Reuse provider capabilities; unsupported paths must not pretend to run.
4. Keyed status and string widgets, runtime titles and editor updates. Status clear/replacement, reconnect snapshot and process-replacement semantics. Initiating-client draft ownership; never overwrite unsent user text from another device silently or auto-send a remote editor update.
5. Rich questionnaire descriptions/stable values/previews/multi-select/multiple questions/editor prefill. Make stock basic-dialog fallback and rich negotiated transport distinct; preserve private Vault input and cancellation.
6. Takomi mode/stage/gates/workflow launch, board tasks/checklists, routing preview/apply, context/prerequisites, subagent preview/confirmation/status/interrupt/resume/child detail. Separate deterministic actions from observations. Existing slash handlers already implement some direct actions; use those semantics. No model-mediated button pretending to be a direct control.
7. Native tree/branch/fork/rename/stats/export and deep message selection, accurate historical transcript fidelity, original-file release/CLI-return/sync, fresh-thread attach, mobile continuation. Distinguish native append history, active branch and file checkpoints. Export must download to a remote client, not just show an environment-local path. Destructive deletion is not assumed available.
8. Auth/OAuth-router account/status/usage/resource diagnostics, keyboard equivalents, terminal-only alternatives and managed-runtime override/update diagnostics. No account migrations, publishing, secret displays or decorative redesign.

## Constraints

The user wants functional parity on web/desktop/mobile, not terminal pixels. Preserve recognizable UI, responsiveness, remote multi-environment scope and performance. Do not add continuous animation or large catch-all dashboards. Existing inline cards remain the useful fallback when inspector is closed. Sensitive flows stay outside persisted chat/events. Arbitrary TUI components need declarative equivalents or honest unavailable/cancel behavior.

Web verification must use the authorized built-in Browser workflow, whose tools are currently absent in the parent. Mobile client/device availability is not known. Do not claim a mockup, static render or source check as integrated proof.

## Expected artifact

Return a compact but complete design report, preferably under 3500 words, with exact component references, grouped interaction tables, source-of-truth decisions, first implementation UI slice, dependencies on shared/backend interfaces, measurable acceptance scenarios and genuine unresolved choices. The parent persists D01.design.md. Do not write boilerplate task packets.

## Definition of done

Every group has concrete all-client behavior and reverse/error states; designs reuse actual existing primitives; state ownership and partial-fidelity/unsupported behavior are explicit; initial UI implementation can be scoped without guessing. No code/files/client activity occurred. Questions that truly require user permissions stay explicit rather than defaulting to external effects.
