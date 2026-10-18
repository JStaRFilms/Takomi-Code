# Task 02: Implement reusable conversation-owned Vault grants

## Objective

Implement the approved policy in the authoritative Suite. Default to reusable approval for this chat, up to 12 hours. Preserve private input, credential access boundaries and legacy restrictions. Parent will review, sync installed code and commit. No product changes outside the stated scope.

## Prime context

Read these APP files completely:

- `docs/tasks/orchestrator-sessions/orch-20261016-093922/master_plan.md`
- `.t3/vault-grant-policy/plan.md`
- `.t3/vault-grant-policy/baseline.md`

Suite root: `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`. Follow its AGENTS.md and unslop. Every Suite subprocess must use this explicit cwd. APP remains the coordination workspace. Global SDK is now 1.3.0; Suite development SDK is 0.99.1. Public native conversation identity APIs were verified in both. No upgrade is needed.

## Scope

Approved Suite source is `.pi/extensions/takomi-vault/`, especially types.ts, grant-store.ts, tools.ts, adapters.ts, index.ts, commands.ts, secret-input.ts as needed, and README.md. Tests are focused scripts/test-vault* and vault-test-loader.js. Update the existing `docs/features/Takomi_Credential_Gateway.md` for durable data-flow/schema reasoning. Avoid new modules unless necessary; the strict APP test import map currently expects the existing module graph.

Preserve unrelated dirty `.pi/extensions/takomi-subagents/index.ts`, `scripts/test-subagent-heartbeat.js` and any concurrent skill/ai-media work. Relevant R5 Vault repairs are a dirty baseline and must remain correct. Do not stage or commit. Do not write installed code. Do not edit APP product code.

## Implementation requirements

Use the plan's exact minimal schema and compatibility strategy:

- Keep wire scope names. Session is first/default human option, this chat for up to 12 hours. Turn means 15 minutes in this chat. Once is one attempt within five minutes. Target is explicit remember across chats for 30 days using the same Vault. Reuse never refreshes expiry.
- Resolve the trusted native session ID from each invocation's context. Never accept owner in model parameters, use generic pi, capture a registration-time ID, or rely on a PID/title. Recheck identity and cancellation after awaited approval, including saved credentials and file-write confirmation. Unsupported identity fails closed for selected chat scopes, not a silent fallback. Do not promise restart recovery for an unpersisted native session.
- New policyVersion 2 rows require explicit fields and terminal/file access. Chat scopes carry valid ownerSessionId. New arbitrary operation prose explains purpose, not exact-string authorization. Keep credential, normalized destination, fields, tool, agent, expiry, revocation, credential-match and persistent-write restrictions.
- Legacy once/target retain exact operation and all existing restrictions. Legacy ownerless turn/session fail closed with a clear reapproval reason. Never assign legacy rows to the active chat or widen them automatically.
- Use outer grant-file version 2 once new rows are written, retain it on subsequent writes, and preserve legacy rows. Old readers must refuse the new store instead of ignoring owner fields. Reject malformed or unknown policies/envelopes without overwrite. No private-state migration or actual grant issuance during development.
- Preserve atomic spend-before-effect, cross-process locking, audit rollback and durable revocation. Once remains nonrefundable after an admitted attempt. Reusable command failure, nonzero exit and retry do not revoke permission. Denied uses do not spend. Unsaved credentials remain once-only with cleanup.
- Stop globally revoking session grants on shutdown. Retain expiry, temporary-file and key-cache cleanup. Native owner mismatch isolates new/forked chats without deleting resumable grants. Normal process restarts do not end approval.
- Parse only offered scope choices. An agent-requested remember scope annotates but never preselects it. Present actual permission, expiry, current-chat usability, save-versus-approve and action-approval distinction. Avoid exposing owner IDs or values in public metadata.
- Preserve exact fixed/redacted operation errors and the R5 error reasons. Do not echo raw exception messages, paths, commands, purpose or secrets into errors. Preserve private notify ownership transport, masking, listener disposal, reveal restrictions and explicit revoke/delete behavior. No automatic approval when vault_request is called again; handles are reusable through use tools.

## Verification

All tests must use isolated synthetic stores and the strict key-provider loader before importing code. Never instantiate an SDK/auth/Vault session. Preserve six-process exactly-one-winner checks and all R5 tests. Cover default scope order, offered-choice validation, unsaved once, stable owner across fresh process/module reads and restart, different/missing/fork owners, fixed TTL and exact expiry, explicit cross-chat remember, revocation, new purpose wording, strict legacy behavior, mixed store versions and old-reader refusal, all three adapter boundaries, failure retries, once spending, audit rollback and stale/cancelled approvals. Preserve redaction and private UI conformance.

Run each with explicit Suite cwd:

- `node scripts/test-vault-operations.js`
- `node scripts/test-vault-grants.js`
- `node scripts/test-vault-input.js`
- `node scripts/test-vault-transfer.js`

Create scoped typeconfigs under APP ignored `.t3/vault-grant-policy/`, based on the prior round5 configs. Include all extension TS files, including index/commands. Check actual Suite 0.99.1 and global 1.3.0 public declarations without installing anything. Use scoped diff checks. Do not run whole-repository checks or broad formatting.

## Definition Of Done

The approved policy works without expanding legacy access. Meaningful isolated tests and both scoped declaration checks pass. Source changes stay within the approved Vault scope. Existing feature documentation explains the persisted version/owner model and compatibility reasoning. Final diff is small enough to understand, without a new framework, speculative fallbacks or unrelated cleanup. Report real blockers instead of weakening a guard. Do not claim installed, device or live-service success.

## Expected Artifacts

- Suite implementation and focused tests within the allowlist.
- Updated extension README and existing feature document.
- APP ignored `.t3/vault-grant-policy/implementation-result.md` listing changed paths, exact checks/results, actual SDK versions, schema decisions and remaining limits.
- Focused test/type logs and typeconfigs under that ignored APP directory.

## Constraints

Actual data at `C:/Users/johno/.pi/agent/takomi-vault/` is forbidden. Do not read credentials, settings, env/.npmrc, signing material or transcripts. Installed code at `C:/Users/johno/.pi/agent/extensions/takomi-vault/` is read-only for this task. No broad sync, source/native build, installs, package/dependency operations, publication, Git stage/commit/push/tag, process killing, app/server/browser/device/session start/stop/restart, new agents/schedules/threads/worktrees. Parent owns review, code-only sync and scoped commit.

## Review Checkpoint

One focused reviewer will check the completed source and tests. Parent will separately run selected synthetic APP private-input tests without launching Pi, verify source/installed hashes, sync reviewed code and commit the approved packet. Fix confirmed blocking regressions only.
