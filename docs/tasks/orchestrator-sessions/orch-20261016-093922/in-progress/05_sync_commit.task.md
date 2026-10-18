# Task 05: Sync and commit the verified Vault policy

## Objective

Complete the user-authorized code-only installed extension update and scoped Suite commit. No publication, app build, restart or private-state access.

## Context

Suite implementation, four isolated scripts, both SDK declaration checks and selected synthetic APP private-input tests pass. The one reviewer blocker was corrected and the parent verified the narrow fix and regression. Evidence is in APP ignored `.t3/vault-grant-policy/`. The installed extension is still the captured older baseline. User approved both external locations and scoped commit, not push.

## Scope

Source Suite is `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`. Installed code target is `C:/Users/johno/.pi/agent/extensions/takomi-vault/`. Use only the eight changed extension source/README paths recorded by sync-manifest.json, with eight unchanged code files checked for parity. Commit the fourteen approved Suite source/tests/feature-document paths from parent-checks.json. Preserve unrelated dirty subagent files, other concurrent work, active processes and all private runtime data.

## Steps

1. Apply the existing planned sync only after accepted review, current source hashes, installed-before hashes, canonical paths and exclusive code backups all match. Replace files atomically in dependency order and verify all sixteen code-file hashes.
2. Run the selected two synthetic APP private-input cases against installed code, with mocked persistence and no Pi process. Typecheck installed extension code using public declarations and the reviewed file set. Preserve previous isolated-test evidence.
3. Verify Suite HEAD/branch/index and unrelated file bytes before staging. Stage only the fourteen approved files. Check staged path set and Git-cleaned blobs, inspect scoped diff and make one conventional commit. Do not push. If hooks change reviewed content, reverify before final parity claim.
4. Check committed blobs, remaining unrelated work, source/installed parity and actual tests. Record final source commit and limits.

## Definition Of Done

Reviewed code is present in the installed extension, source/installed parity holds, relevant checks pass and the exact scoped Suite commit exists. No private store was read or migrated and no active session was restarted. Existing loaded extension modules remain old until a later normal reload/new session. Report version-2 compatibility implications honestly.

## Expected Artifacts

APP ignored sync manifest/backups, installed conformance/type logs, commit receipt and final result. Suite commit contains only the approved Vault packet. No new app commit or release.

## Constraints

Forbidden data root is `C:/Users/johno/.pi/agent/takomi-vault/`. Do not read settings, credentials, grants, env/.npmrc, signing material or transcripts. No broad global sync, installs, dependency operations, actual grant issuance, live SDK/auth/Vault calls, app/server/browser/device/process start/stop/restart or process kills. Git local commit only, no push/tag/publish. Every Suite subprocess sets explicit Suite cwd. No unrelated cleanup.
