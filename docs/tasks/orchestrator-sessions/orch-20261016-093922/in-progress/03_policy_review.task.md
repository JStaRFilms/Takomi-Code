# Task 03: Review the Vault grant policy implementation

## Objective

Perform one focused, read-only review of the completed Suite implementation against the approved policy. Identify confirmed correctness or permission regressions, not stylistic suggestions or unrelated cleanup. Parent will make any confirmed corrections and perform installed sync and the commit.

## Context

Read the master plan, APP ignored `.t3/vault-grant-policy/plan.md`, `baseline.md` and `implementation-result.md`. Authoritative Suite root is `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`. All Suite subprocesses must set that explicit cwd. Follow Suite AGENTS and unslop. The user approved implementation, tests, a scoped Suite commit and code-only installed sync, not publication or runtime data access.

## Scope

Read the fourteen changed Suite files listed in implementation-result.md and their combined diff, including prior reviewed R5 Vault repairs. Read relevant isolated tests and public SDK declarations if needed. The expected new policy uses trusted native session IDs and policy/file version 2. Both actual SDK 0.99.1 and installed SDK 1.3.0 scoped types passed. Installed code remains the older baseline until parent sync.

## Review questions

- Do all new approval paths default to this chat up to 12 hours, label the actual duration and access, parse only offered choices and require explicit remember? Are missing identity and unsupported persistence represented honestly?
- Does every use resolve trusted current native ownership, reject wrong or missing owners before effects/spend, survive ordinary restart/resume and isolate forks/new chats? Do approval and file confirmation awaits reject changed identity or cancelled invocations?
- Are fields, destination, credential, tool, agent, expiry, revoke, permanent-file and ordinary action restrictions retained? Is new operation prose purpose only without broadening old grants?
- Are legacy ownerless chat grants rejected, legacy once/target restrictions preserved and malformed/unknown records refused without writes? Does outer version 2 prevent old readers silently ignoring owner? Do rollback/revoke/expiry preserve the new envelope?
- Are atomic once spending, reuse on failed/nonzero commands, retries, audit rollback, temporary/ephemeral cleanup and fixed redacted errors correct? Does shutdown stop globally revoking permissions while retaining cleanup?
- Does this preserve private notify ownership, masking, input listeners and plaintext restrictions? Do tests actually prove behavior, with isolated stores and strict key-provider guards rather than mirroring implementation?

## Definition Of Done

Produce a focused PASS or a short list of confirmed blockers with exact files/lines, reproduction and required narrow correction. Distinguish security/correctness defects from optional suggestions. Run only proportionate isolated checks if needed, with synthetic state and explicit Suite cwd. Do not run whole-repository checks or start an SDK/provider/session. Do not change product files, tests, index or installed code. Preserve all unrelated dirty work.

## Expected Artifacts

Return findings, scope and checks actually run in your response. Parent will save that verdict to APP ignored `.t3/vault-grant-policy/review.md`. Do not create files. No new agents or extra review rounds. Parent will handle revisions only for confirmed blockers and report prior findings if a new delegated review round is necessary.

## Constraints

Never read actual data at `C:/Users/johno/.pi/agent/takomi-vault/`, credentials, settings, env/.npmrc, signing material or transcripts. No installed sync, Git stage/commit/push, package/dependency operations, source/native builds, publication, app/server/browser/device/auth/provider/session start/stop/restart, process kills or new agents/threads/worktrees/schedules. Public source and isolated synthetic tests only.
