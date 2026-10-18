# Plan the approved Vault policy

## Objective
The user explicitly approved implementation, isolated tests, a Suite commit and code-only installed extension sync. First verify native SDK identity and a minimal safe compatibility plan. No product changes in this read-only task.

## Scope
Suite root is C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite. Read AGENTS, .pi/extensions/takomi-vault/, focused scripts/test-vault* and relevant docs/features/requirements. Installed code is C:/Users/johno/.pi/agent/extensions/takomi-vault/. Inspect public Pi SDK docs/declarations for stable native conversation identity and lifecycle, comparing Suite0.99.1 with installed1.1.0. Set explicit Suite cwd in every Suite subprocess; app remains coordination workspace. See master_plan.md for approved policy.

## Required findings
Make chat/up-to12h default; once5m and timed15m chat-owned; explicit remember30d across chats using same Vault. New grants treat arbitrary operation wording as purpose while retaining credential/destination/fields/tool restrictions and ordinary action approvals. Existing narrow grants never silently broaden. Preserve atomic once spend-before-effect and failure behavior. Fix global session shutdown revocation and preserve chat approval over ordinary restarts. Stable owner must come from trusted SDK context, not model parameters or generic pi; new chats/forks are distinct. Missing owner fails closed for chat scopes. Check every use adapter and slash command, lifecycle switches/forks/resume and synthetic strict fixtures.

## Definition of done
Write APP ignored .t3/vault-grant-policy/plan.md with exact public APIs and paths, touched files/schema/legacy compatibility, expiry/end/revoke semantics, focused tests and check commands. Capture existing Suite dirty/staged/untracked Vault baseline and preserve unrelated ai-media/skill work. Read required full Pi docs and related references before API choices. Explain whether any app-fixture change is actually needed. No invented API, private SDK import or dependency upgrade.

## Expected artifacts
Ignored plan report and baseline summary only. No Suite/global edits, commits, installs, live SDK/auth/Vault invocation, source builds or publication, app/browser/device/server/session start/stop/restart, new agents/threads/worktrees/schedules or remote writes. Never read C:/Users/johno/.pi/agent/takomi-vault/ or credentials/signing/settings/transcripts. No private-state migrations.

## Review checkpoint
Parent checks plan, then authors an implementation packet for Sol High and one focused review packet. No redundant permission questions for the already-approved design; report only genuinely different security decisions or unsupported owner identity as blockers.
