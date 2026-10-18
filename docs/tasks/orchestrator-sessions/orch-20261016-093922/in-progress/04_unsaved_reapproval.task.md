# Task 04: Keep reapproved unsaved credentials once-only

## Objective

Correct the single confirmed review blocker. An existing pending ephemeral credential must remain unsaved and once-only when selected again. Preserve saved credential reuse and the approved new grant policy.

## Context

Read APP `.t3/vault-grant-policy/review.md`, `implementation-result.md` and session master plan. Reviewer reproduced a pending createdBy=agent-once credential receiving a session grant through tools.ts:233 because approveGrant gets unsaved=false. Parent independently confirmed that exact call. All other focused checks passed. Do not reopen broad review or redesign.

## Scope

Only Suite `.pi/extensions/takomi-vault/tools.ts` and `scripts/test-vault-operations.js` unless a focused regression genuinely belongs in another existing Vault test. Suite root is `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`; every Suite subprocess must set that explicit cwd. Follow Suite AGENTS and unslop. Installed extension remains read-only.

## Required correction

Pass `isEphemeral(selected)` to the existing selected-credential approveGrant call instead of false. The helper is already imported. Reuse existing once-only prompt/cleanup paths; no new abstraction, alternate credential migration or broad filtering.

Add a synthetic regression that creates or seeds an unsaved pending credential, requests the same service/host again before use, selects it as existing, proves only Allow once/Cancel is offered despite a reusable requested scope, verifies issued once scope and unsaved metadata, performs its admitted attempt and proves the credential is deleted. Cover denial of another use and ensure a saved existing credential still offers/reuses session permission through the existing tests. Prove the regression fails without the one-line correction, using only a controlled in-memory source substitution or equivalent isolated negative control; do not temporarily rewrite reviewed source or touch private state.

## Verification

Run all four guarded isolated scripts and both existing scoped SDK declaration checks under APP `.t3/vault-grant-policy/`, plus scoped diff check. Preserve unrelated Suite dirty files and do not stage or commit. Save a short correction result and exact check outcomes under APP ignored `.t3/vault-grant-policy/unsaved-fix-result.md`. Parent will repeat final checks, inspect the exact two-file correction, sync reviewed installed code and commit.

## Definition Of Done

The reproduced widening is impossible through this path, the new regression fails on the uncorrected path and passes with the fix, all relevant checks pass, and the patch contains only the narrow correction and meaningful tests. No broad formatting or extra policy change.

## Expected Artifacts

- Minimal Suite correction and regression test.
- APP ignored unsaved-fix-result.md and focused evidence/logs.

## Constraints

No actual Vault data at `C:/Users/johno/.pi/agent/takomi-vault/`, credentials/settings/env/.npmrc/signing/transcripts, live SDK/auth/provider/Vault invocation, installed writes, staging/commit/push/publish/package operations/builds, app/server/browser/device/session restart/start/stop, process kills or new agents/threads/worktrees/schedules. Strict synthetic test stores and key-provider guards remain required. Do not edit other source or user work.
