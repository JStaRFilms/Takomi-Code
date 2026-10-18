# Review Vault request ownership and private response lifecycle

## Objective
One focused read-only review of the new Vault repair. Find confirmed privacy/correctness/compatibility defects or requirement violations. Do not turn this into broader security redesign or style cleanup.

## Prime context
Read AGENTS, completed vault-provenance-plan and approved vault-trusted-input-bridge task packet in this session, then docs/features/takomi-pi-provider.md private input section. Review current diff in packages/provider-pi/src/server/adapter.ts and adapter.test.ts, new src/testFixtures/piVaultTool.ts. Read code-only original/diff artifacts in ignored .t3/vault-code-backups and approved installed code paths C:/Users/johno/.pi/agent/extensions/takomi-vault/tools.ts and secret-input.ts. No Vault data/state, credential values, signing/env/.npmrc reads.

## Original brief and prior finding
Normal model vault_request was cancelled before client display because V2 required a pending Vault slash command. V1 accepted any secret-prefixed title. Do not restore that rule. Native tool_execution_start happens before registration lookup and validation, so name/start alone cannot prove execute. User approved a cooperative protocol from actual registered execute and exact installed code paths. No broader external mutations were authorized.

## Scope
Verify explicit invocation identity and one-use request correlation bind same live child/native session/current turn/tool lifecycle. Inspect ordering, cancellation/replacement/abort/exit cleanup, concurrent calls and answer-time ownership checks. Check private metadata is removed before model/client/events/logs and synthetic secret values stay in existing private response route. Preserve slash/import restrictions, TUI behavior and old-version fail-closed behavior. Review parser bounds and memory behavior only where there is a real correctness issue. Current reported caps are16384 replay IDs and64 simultaneous dialogs. Do not suggest speculative caps redesign without confirmed impact.

## Trust boundary
Installed extensions/native process are trusted. A compromised native process can forge stdout or inspect memory; same-process signing would not solve that. Correlation is not bearer authentication. Do not falsely report this explicitly approved boundary as a regression. Model-visible metadata leakage or admission without matching live ownership is in scope.

## Test evidence
Coder reports108 focused tests, actual installed tool execution/native validation with mocked persistence, scoped provider and installed-code typechecks, formatting/diff checks and lint with one pre-existing warning. Parent independently reruns focused checks; reviewer need not duplicate them. Inspect whether fixture loads real changed code and validates before execute, without loading live SDK auth/session/Vault storage. Check whether tests silently skip the meaningful path, depend on this machine or accidentally read credentials. Identify realistic untested blocking regressions, not test quantity complaints.

## Definition of done
Return pass or confirmed blocking findings with file/line references and minimal correction. Mention source/native fixture verification versus live UI absence. No edits, native builds, real Vault requests, installs, live sessions/server/browser/device/network/publish/commit or new agents.

## Expected artifacts
Read-only review report, nothing written. Parent addresses confirmed blockers once, not recursively until style comments vanish. Build/phone APK artifacts and unrelated mobile changes are out of scope.

## Review checkpoint
Acceptance requires no confirmed blocking regression and passing relevant parent checks. A new desktop/server runtime and user-controlled fresh/reloaded Pi session are still required for live behavior; no live private UI success claim.
