# Task 24: Show safe context in Vault private-entry forms

## Objective
User explicitly asked to fix the generic private form. Screenshot says Vault secret twice and only This value won't be saved in the thread. They cannot tell which field/value is requested without our external guide. This is app-side loss, not missing agent arguments. User reported live A-D passing on port4890: target denial, injected two dummy fields, once-grant replay denial and ephemeral deletion. Preserve that working path.

## Prime context
Read AGENTS, Tasks21-23, docs/features/takomi-pi-provider.md, packages/provider-pi/src/server/adapter.ts plus tests/native fixtures. Read installed tools.ts and secret-input.ts. tools.ts builds FIELD for SERVICE on HOST; helper sends native title. Adapter around1509 replaces all sensitive titles/header with Vault secret and generic notice. Do not simply restore raw titles; their suppression is a privacy safeguard. Review actual web/mobile question renderers and shared contracts to choose existing title/header/question fields, not new UI machinery.

## Scope
For actual registered vault_request execute, carry explicit non-secret display context for the current field from known validated request arguments: field name, service, host, optional purpose. Prefer a small optional additive display object in the already-private owned notification record, derived before entering the value. No context from entered values, storage contents, raw native title, placeholder or arbitrary notification payload. Bound/validate known metadata fields within existing envelope size; invalid/missing context should safely retain generic behavior rather than weaken ownership. Correlations, native/session/tool identifiers stay private.

Only show context after existing ownership/session/turn/tool checks pass. Make it clear which value to enter, with actual field name and service/host, plus purpose when supplied and existing privacy notice. Existing title/header/question fields should feed web, desktop and mobile through the shared adapter. Keep masking/private response path, no plain-text credential values in model/client/history/logs, and no new contract/schema/database layer unless genuinely required. Keep old helper/adapter combinations and slash/import/TUI behavior safe; unrelated manual command improvements are not this task. Do not authorize a raw-title pass-through for slash inputs.

No redesign, optional field-description API, external dependencies, broad refactor, credential storage or grant behavior changes. Existing envelope and capability gating must stay compatible or fail closed. The approved trust boundary is trusted installed extensions/native process; no same-process authentication redesign.

## Definition Of Done
Tests prove two fields get their own correct names/service/host/purpose, not stale context, using actual installed runRpcMode/stdout guard and registered source with persistence mocks. Assert new safe context reaches emitted question metadata while deliberately malicious/raw native title, placeholder/ownership metadata and entered synthetic values never reach client/model/history output. Preserve registration/native-validation and ownership/replay/concurrency/lifecycle/answer-time tests. Invalid/missing context and legacy fallback are covered proportionally.

Run focused adapter/injection tests with explicit installed-source/package opt-ins, provider and approved-installed-code typechecks, scoped lint/format/diff. Record exact results and surface decisions: shared adapter covers web/desktop/mobile; no provider switch or separate native rebuild needed. No browser/device test without permission. Parent does one focused review and reruns checks.

## Expected Artifacts
Minimal repo adapter/tests/fixtures diff and only previously approved external edits to C:/Users/johno/.pi/agent/extensions/takomi-vault/tools.ts and C:/Users/johno/.pi/agent/extensions/takomi-vault/secret-input.ts. Code-only before snapshots/diffs/result under ignored .t3/vault-code-backups/round3-labels, preserving all original/round2 backups. Update existing feature explanation only where necessary. No files outside authorized paths.

## Constraints
One source writer. No real Vault/auth/model/session requests or storage reads, credential/signing/env/.npmrc files, network/install/account-picker/browser popups, userdata mutations, app/server/provider/browser/device launch/restart, commits/push/CI/npm/GitHub publication or agents. Protect ALL active outputs: apps/server/dist and .t3/vault-rpc-preview-r2/server are running or may be reused. Do not overwrite either or other artifacts. No build yet; after review a worker will prepare a fresh isolated output. Preserve mobile Send/splash and other unrelated edits.

No Git remote commands needed. Process scoped GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never GCM_GUI_PROMPT=0 GH_PROMPT_DISABLED=1 if a command might invoke network; fail rather than login. No cleanup of C:/tp, other worktrees or global packages.

## Dependencies and review checkpoint
Native notify repair, source tests/review and separate build completed; user confirmed live functionality. Only labels/context change now. Report source completion honestly, not live UI or runtime readiness. Parent review and new isolated bundle follow before asking user to start anything.
