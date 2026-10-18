# Task 26: Build descriptive Vault prompts separately

## Objective
User asked to fix generic Vault secret prompts. Source and focused review passed; build the corrected runtime so user can see field/service/host/purpose without exposing values. Existing port4890 working server must remain intact and running.

## Prime context
Read AGENTS, Tasks23-25 and .t3/vault-code-backups/round3-labels/result.md. Parent113tests/no skips, both provider/approved-installed types, scoped lint/fmt/diff passed. Review found no blockers. Read .t3/vault-rpc-preview-r2/vite.config.ts and provenance.json as reusable build evidence, not data. R2 shows how to pack explicit normal entries/external dependency rules without importing root/server configs that read env files. It requires existing repo NODE_PATH for local native dependencies.

## Scope
Create new owned .t3/vault-rpc-preview-r3-labels with marker, or unique suffix if occupied by someone else. Capture complete file/size/hash inventories for BOTH apps/server/dist and .t3/vault-rpc-preview-r2/server before work. Never overwrite/clean either protected tree. Reuse/copy the safe no-env Pack configuration only into the new owned directory and adapt output path as needed. No normal build wrapper or web build because it writes active apps/server/dist/client. Direct local vp pack, existing dependencies and external predicates, safe local blank relay/Clerk/telemetry constants.

Compile only new server output. Copy existing client read-only into new client directory; shared question metadata renders labels, no frontend change or native rebuild needed. Keep protected R2 client/server unchanged. No dependency install/network or source changes. If build fails, diagnose narrow local root cause and retry within owned output; no blind retries/permission changes.

## Definition Of Done
Verify emitted production chunks include displayContext validation/handling, field name, formatted Enter FIELD for SERVICE on HOST and optional Purpose plus privacy notice, as well as working native notify capability/ownership handlers. No raw-private-title restoration. Run short CLI --version probe using needed existing repo NODE_PATH, not serve. Compute new output hashes and compare BOTH protected inventories completely. Provide exact loopback-only manual command for port4891 and a fresh data directory under new output, with --no-browser and noninteractive auth environment. No claiming actual live client rendering before user validation.

## Expected Artifacts
New owned ignored server/client tree, copied/adapted temporary safe config, build log and provenance/hash inventories. Small result.md with exact executable/data paths/command and checks. Public version may remain0.0.45; don't bump source version. No updater/release/native installers. State clearly old4890 retains prior generic labels and new entry/port needed; no stopping it needed.

## Constraints
Build-only worker. No product-source/installed-extension/helper/docs changes, Vault/settings/env/auth/transcript/signing/.npmrc reads, SDK/model/session/Vault requests, server/provider/app/browser/device launch/restart, commits/push/CI/npm/GitHub publication, account picker/browser popups or agents. Do not alter userdata under fresh-user-home or old data dirs. No Ctp/managed worktree/global dependency cleanup. Scope includes .t3 marker/config/log/output only; preserve other artifacts.

Use process-scoped GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never GCM_GUI_PROMPT=0 GH_PROMPT_DISABLED=1. No remote Git needed; if unexpected auth/network dependency appears, fail without interactive fallback. Existing installed dependencies only.

## Dependencies and review checkpoint
Task24/25 source and review completed. Parent verifies artifact hashes/markers/version and protection of both previous output trees. User manually launches new server/fresh Takomi thread and checks visible context with dummy fields. No agent launch or live UI test here.
