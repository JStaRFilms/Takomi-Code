# Fix mobile prompt submission with the Takomi provider

## Objective
The user installed the newly verified production Android0.1.2 APK from sourced92e9bd5a5. Renaming works now, but mobile prompts still do not send with Takomi selected. Switching to Codex or other providers works. Fix that defect and hand off source for a local Android preview build.

## Runtime evidence
Send leaves draft text in the composer and no message appears. Failure also affects new threads and different models, specifically GPT6.1Sol. The same report persists on the new APK, so do not dismiss it as merely an old client mismatch. Desktop/server is the installed0.1.1 app unless newer information shows otherwise; provider runtime itself works for this parent and delegated tasks. Do not assume no message means backend never received it without tracing outbox state.

## Prime context
Read repository AGENTS, apps/mobile/src/features/threads/ThreadComposer.tsx (canSend around553 and handleSend around590–650), its parent callback and mobile outbox/model-selection/provider-config/RPC code. Trace imports to exact implementation and tests. Check packages/client-runtime shared selection and protected RPC command helpers, contracts and server Pi/Takomi submission only where code evidence leads. Previous source audit found no confirmed send cause. It separately found Vault slash-command admission defect, which is blocked pending private request ownership support. Vault is outside this slice.

## Scope
Identify the provider-specific failure at composer gates, draft/send callback, outbox/command construction, model/instance identity resolution, authentication permissions or RPC/startup. Use a faithful behavioral regression and source-grounded cause before changing code. Preserve exact Takomi instance ID, Pi driver and provider-qualified model distinctions. No disabling auth/permissions, silently substituting Codex, wiping sessions or changing storage IDs. Fix only the confirmed send defect. Keep working providers and queued/offline sends intact.

## Completion criteria
Focused test reproduces the old failure and passes with the correction. Draft submission returns a queued or sent message rather than silently doing nothing for a valid enabled Takomi provider. Codex and relevant offline/reverse cases preserve existing behavior. Run targeted tests and scoped mobile/client-runtime/server typecheck/lint/format only where touched. No whole-repo checks. If runtime evidence is insufficient, identify precise metadata needed rather than applying a speculative fallback or error-message-only patch and claiming Send fixed.

## Expected artifacts
Minimal source/test diff, exact cause and checks, any real remaining limitation. No APK claim in this task; parent reviews then runs local preview builder. If backend Effect code changes, read docs/internals/effect-services.md and .repos/effect-smol/LLMS.md, and drain effect worker or await events, never sleeps in tests.

## Constraints
Only source-writing agent. Do not run native/CI builds, browser/device/app/server, install dependencies, change accounts or credentials, read vault/password/signing/env secrets, mutate live userdata or other worktrees, commit/push/publish. Read-only authorized diagnostics must be redacted and narrowly related. Current source clean except untracked session notes and ignored downloaded artifacts; preserve them. Never dump transcripts. A local preview will use already-authorized disposable C:/takomi-local-build, but only parent may start it after review. No changes to C:/tp or feat/pi-debrand.

## Review checkpoint
One implementation and one focused parent review. Report which web/desktop/mobile/shared code applies and whether a server rebuild is necessary to test the correction. User asked for local testing of the fixed behavior, not another download of the unchanged CI APK.
