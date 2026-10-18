# Task 29: Build the readable web client and server separately

## Objective
Ship actual readable private card to local user testing. Unlike R2/R3, server-only plus old copied client is insufficient: old web p collapses newlines. Build NEW web client AND updated server after accepted Task27/28.

## Prime context
Read AGENTS, .t3/vault-code-backups/round4-readability/result.md, R3 safe Pack config/provenance, apps/web/vite.config.ts, web vite/tailwind helper, route plugin installed public types/options, server static-client resolution. Parent113native+14client tests passed, provider/installed/web/mobile typechecks passed, scoped lint/fmt/diff and review pass. Combined check timed out initially; split checks succeeded. No unresolved source blocker.

## Scope
Create owned new .t3/vault-rpc-preview-r4-readable or unique suffix if occupied, marker first. Capture complete file/size/hash inventories BEFORE work for apps/server/dist, apps/web/dist, R2server, R3-labels/server, plus generated web route-source file. These are protected, not targets. Never clean/write them, change source routes or disturb user data. Temporary config/logs/output stay inside owned ignored directory.

Build server using prior safe Pack config and existing external dependency predicates, normal entries and local blank relay/Clerk/telemetry defines. No normal wrapper/env config. Build web directly into new owned web output using safe temporary Vite config rooted at apps/web, preserving production React/compiler/Tailwind and route splitting/asset/alias behavior as needed. DO NOT import root/web/server Vite configs or loadRepoEnv/env files. Vite envDir must point to an owned empty directory and envPrefix must disable automatic environment exposure; known public define keys explicitly safe/blank, app version from public package metadata. Never bake VITE_HTTP_URL/VITE_WS_URL localhost origins; leave blank/single-origin.

Route generation must be disabled through VERIFIED installed plugin API while preserving necessary route splitting. Read actual types/docs before choosing option; use existing generated route tree read-only. No generated-source writes or normal build tasks. Existing dependencies only; no network/install. Preserve public assets/licensing behavior where necessary, same compiled CSS toolchain, no unrelated UI rebuilding fixes. Copy only this fresh web output to new server/client path, not old client. Do not build mobile/desktop/Android.

## Definition Of Done
New index/assets available, fresh compiled JS contains private-card paragraph rendering/accessibility changes and CSS contains actual whitespace-pre-line rule. Updated server carries separated Enter FIELD/destination/purpose/privacy paragraphs and existing safe owned metadata/capability/answer checks. Run short --version with needed repo NODE_PATH only, no serve/browser/provider/session request. All protected tree paths/sizes/hashes AND route-source hash compare identical afterward. Compute complete new output inventory and provenance. Build logs must not expose credentials/env values/private URLs.

## Expected Artifacts
New ignored web+server/client tree, temporary safe web/Pack configs, build/check logs, baseline/output inventories, provenance and result.md. Provide exact manual PowerShell command for new entry, fresh base-dir and loopback4892 --no-browser, noninteractive Git/GCM/GH flags. Old servers remain usable and running; version label may stay0.0.45. Clearly no actual browser/client/device verification. Mobile paragraph copy updates from server; new mobile accessibility source is not yet packaged, no APK needed for this desktop/web test.

## Constraints
Build-only worker, no source/installed-code/docs/routes/env/settings/Vault/auth/model/session/signing/.npmrc/data changes or real requests. No server/provider/browser/device/app launch/stop/restart, accounts/popup, dependency installation/network, commits/push/CI/npm/GitHub publication or agents. Ctp/worktrees/global dependencies untouched. Only owned ignored config/output/log files. Source code/public installed plugin metadata may be read; no secrets/full environments.

Process scoped GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never GCM_GUI_PROMPT=0 GH_PROMPT_DISABLED=1. Root-cause-led ordinary local build corrections/retries within owned directory authorized, not blind retries or broad permission changes. Unexpected auth/install/network requirement must fail without interactive fallback. If a correct build genuinely requires protected/source mutation, stop and explain rather than bypass limits.

## Dependencies and checkpoint
Source/review/checks complete. Parent verifies actual fresh CSS/JS/server markers and baseline integrity, then user manually launches4892/fresh thread for simple token prompt. No browser/computer use approved; never claim pixel-level proof from bundle inspection.
