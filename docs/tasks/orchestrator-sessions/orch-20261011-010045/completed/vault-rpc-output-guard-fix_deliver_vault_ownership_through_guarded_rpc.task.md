# Task 21: Deliver Vault ownership through guarded RPC

## Agent setup
Follow Build. Read AGENTS, completed bridge/review packets in orch-20261011-010045, packages/provider-pi/src/server/adapter.ts and its tests/fixture, docs/features/takomi-pi-provider.md, and the two approved installed Vault code files. Read complete relevant Pi SDK/extensions/RPC documentation and linked examples before choosing an API.

## Objective
User tested a fresh thread on the separate port4889 server and still saw Cancelled by user, while /vault-add worked. Fix the confirmed native transport defect, not user behavior or guessed version mismatch.

## Context
The installed secret-input.ts emits ownership records with process.stdout.write. Pi1.1.0 dist/modes/rpc/rpc-mode.js calls takeOverStdout at RPC startup. dist/core/output-guard.js redirects ordinary stdout writes to stderr; native UI uses the saved raw output path. Parent read native source and ran .t3/vault-code-backups/probe-stdout-guard.mjs in an isolated child. Synthetic ownership landed on stderr, native UI on stdout. No session, auth, model or Vault store opened. Existing VM fixture replaced stdout and missed the native boundary. Thus actual supported RPC input can arrive without its required ownership assertion.

## Scope
Keep registered-execute ownership, per-request IDs, live child/session/turn/tool checks, answer revalidation and the private response path. Deliver assertions through a documented public native RPC UI method, for example a reserved bounded ctx.ui.notify envelope intercepted before normal notifications. Native notify uses the guarded RPC writer. Do not use direct fd writes or private SDK output-guard imports in production. Never modify SDK or disable its stdout protection.

Advertise this envelope capability only from adapters that consume it. Existing T3_TAKOMI_VAULT_SECRET_UI also appears on old hosts and cannot prevent an old adapter exposing the reserved notification. A new non-secret versioned capability hint may gate tool-owned envelopes; it negotiates support, not authentication. Old combinations must fail closed without sending ownership data to ordinary notifications or stderr. Preserve slash secret/import restrictions and TUI. Consume and validate private envelopes before warnings/client/model/log/persistence, including malformed reserved envelopes. Strip native ownership placeholders before client events.

Confirm active extension selection through safe code/metadata where possible. A duplicate suite/package copy remains a separate deployment possibility; do not assume the edited loose file wins. Do not dump settings, env, transcripts or private state. If another external implementation path is loaded and needs editing, stop and name it for permission.

## Definition Of Done
A native transport regression fails on the old direct stdout implementation and passes with the supported envelope. Use the actual installed output guard and native UI output path, preferably actual runRpcMode with a minimal fake host/captured UI context. No live SDK auth/session/model/Vault store. Execute real changed installed tool code with all persistence dependencies mocked. Do not substitute a fake stdout sink again.

Verify no ownership or secret values in stderr/client/model/log/persisted output, proper ordering, unsupported old-host behavior, native validation before execute and existing spoof/replay/concurrency/abort/settlement/replacement checks. Run focused tests, provider and installed-code typechecks, lint/format/diff. Report actual source-selection evidence or its limitation. Live success remains unverified until user tests a corrected runtime.

## Expected Artifacts
Minimal checkout adapter/tests/fixture correction, updated feature explanation, and edits only to C:/Users/johno/.pi/agent/extensions/takomi-vault/tools.ts and C:/Users/johno/.pi/agent/extensions/takomi-vault/secret-input.ts. Preserve original code backups; any round2 code snapshots belong inside ignored .t3/vault-code-backups. Return native regression evidence and a safe separate-output recommendation for later standalone testing. No extra services/dependencies or broad redesign.

## Constraints
Only source writer. User has work running. Do not stop/restart servers/apps/providers, run real Vault requests, launch browser/device, build native artifacts, or overwrite apps/server/dist used by port4889. Research separate build output but do not build/launch yet. No Vault data/credentials/signing/env/.npmrc access, extra external writes, commits/pushes/CI/npm/GitHub publication or agents. Preserve mobile/desktop artifacts and source changes.

No auth/account-picker/browser popups. If network is truly necessary use GIT_TERMINAL_PROMPT=0, GCM_INTERACTIVE=never, GCM_GUI_PROMPT=0, GH_PROMPT_DISABLED=1, plus per-command Git credential.interactive=never, credential.guiPrompt=false and usernameJStaRFilms. No remote Git operation is needed. Fail instead of login/picker fallback.

## Dependencies
The prior source repair and its review completed, but live testing exposed this transport gap. Do not launch a second source writer.

## Review checkpoint
Parent independently runs native transport checks and one focused review. Then prepare an isolated standalone runtime without disturbing existing servers. Source-only tests must not be presented as proof of live UI success.
