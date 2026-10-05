# A02: Define the smallest correct all-client extension projection

## Agent setup

Read-only architect in `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`. Read root AGENTS.md, master_plan.md, parity_ledger.md, G02.report.md, D01.design.md sections 1/4, actual provider runtime contracts/events, ingestion/projection/read model, shared client runtime and web/mobile state/components. B03 is the only writer and changes suite loading; do not write files or touch source. Return plan inline for parent persistence. No tests/builds/clients/native runtime/install/subdelegation/commits.

## Objective

Select a concrete minimal architecture and dependency-ordered Build slices to project supported Pi RPC setStatus/setWidget/setTitle/set_editor_text and command result/severity on web, desktop and mobile. Current adapter ignores supported non-dialog methods. This is not a rewrite, generic plugin framework or custom terminal renderer.

## Required source analysis

Inspect PiAdapter current handleUiRequest/eventBase/generation and new B02 command-outcome metadata; providerRuntime/server/RPC/orchestration contracts; ProviderRuntimeIngestion and actual persisted projections/snapshots; web store/ChatView/composer/inspector/tool notices; mobile feed/composer/activities; existing realtime and authorization patterns. Compare Claude/Codex reusable primitives. Read native Pi 0.99.1 UI definitions and canonical runtime/oauth-router producers, without launching them.

## Decisions that must be made

1. Exact typed payload/read-model and event or snapshot pathway. Evaluate existing durable activities versus dedicated keyed current-state projection or ephemeral provider state plus authorized snapshot/subscription. Avoid unbounded event growth, duplicate truth and polling-only state. Name precise existing contracts/files and any persistent schema/migration consequence. Propose the smallest functional path, not all variants as a menu.
2. Current state must be keyed set/clear/replace, bounded, serializable, escaped text only, with native placement and generation/thread/environment/instance scope. Reconnect must recover current state; replacement clears old generation. Preserve exact key identity within reasonable shared bounds. Arbitrary terminal component factories stay unsupported with an explicit fallback, not a silent success.
3. setTitle is thread-local runtime subtitle, not overwrite of manually named thread/native session/global desktop title. Editor replacement must target initiating-client draft revision where observable; otherwise display an unsent suggestion. Preserve competing device drafts; never auto-send. Describe exactly which current request data lets the server identify the initiating client and what to do if it cannot.
4. Native notifyType and B02 correlated command outcome/error need truthful severity and original turn association. A handled result is not fabricated assistant text or a full model completion. Keep private Vault notices/one-use secret transfers separate and never expand log contents to include secrets.
5. All-client minimal presentation through existing primitives, including mobile details and disconnected/stale state. Inline essentials work without inspector. No continuous animations or decorative dashboard.
6. Native lifecycle events and generation change ordering must make updates safe before/after agent turns and on restart/reconnect. Source-of-truth remains Pi, not inferred UI strings. Unsupported providers remain untouched/capability-gated.

## Required output and completion

Return under 2500 words: selected approach and rationale, exact source files/contracts/interfaces, diagram or concise data flow, payload/state bounds consistent with current code, lifecycle/draft/security rules, 2-4 bounded vertical implementation slices with DoD and focused tests, and genuine blockers. Identify first executable slice and meaningful cross-client acceptance scenarios. No guessed generic endpoints, no model-mediated controls and no fake client proof. Parent writes A02.plan.md and authors implementation packets only after verifying this plan against source.
