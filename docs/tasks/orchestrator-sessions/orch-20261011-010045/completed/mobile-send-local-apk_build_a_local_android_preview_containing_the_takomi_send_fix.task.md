# Build a local Android preview containing the Takomi Send fix

## Objective
Produce a new locally built Android Preview APK with the reviewed mobile Takomi Send correction. Do not download or rebuild the unchanged prior CI APK. User explicitly requested local testing and authorized continued narrow build corrections; permanent reset/clean authority applies only to C:/takomi-local-build.

## Prime context
Read AGENTS, scripts/local-build.ts and docs/user/local-builds.md. Current HEADd92e9bd5a5 plus exactly three tracked modifications: apps/mobile/src/lib/modelOptions.ts, src/state/thread-task-permissions.test.ts, src/state/use-thread-outbox-drain.permissions.test.ts. Parent reviewed and ran94focusedtests plus mobile typecheck/lint/format/diff checks. Pi mode metadata fallback corrects pre-enqueue null return, no server update needed. Builder copies live tracked files into the managed worktree, including uncommitted code.

## Scope and target
Run node scripts/local-build.ts --android from this checkout. Builder uses already-authorized C:/takomi-local-build, validates ownership marker/git common dir/registration before reset/clean, overlays current tracked files and uses existing C:/tp dependency cache. Preserve main source and other worktrees, especially feat/pi-debrand; never reset/clean/delete C:/tp. Normal dependency cache reuse by the existing builder is allowed. No arbitrary external files.

## Definition of done
Actual local native build finishes, publishes a nonzero uniquely named Preview APK under release/local-*. Verify artifact exists, size andSHA256; check expected .preview identity/debug signing/arm64/embedded JS via available native tools. Verify worktree mobile modelOptions matches the reviewed source before or after build. Do not call this production-signed0.1.2 or claim actual phone sends verified. Parent repeats independent artifact verification and user installs/tests on phone.

## Expected artifacts
New release/local-*/Takomi-Code-Preview-*.apk, ignored local build log, concise status plus artifact SHA256 and exact source provenance. Build outputs only, no commits/push/releases.

## Execution
Only active build worker. Use one bounded native build command with enough time for Gradle and record exact log path under .t3. Async delegated task lets parent remain available. Keep terminal and GUI network authentication prompts disabled; pin GitHub username JStaRFilms per command if network Git is needed. Redact credentials/auth links from logs, report summaries rather than full output. No interactive login.

## Constraints
Never broadly kill Java/Gradle or discover PIDs by name. Only processes captured at spawn may be terminated. No app/browser/device/emulator/server launch or installation. No Vault/signing key/password/env/.npmrc reads, no accounts/globalcredentials/source/releaseworkflow changes or realuserdata writes. No CI dispatch/npm/GitHub publication. Preserve C:/tp and unrelated worktrees. If ownership proof or access fails, stop. For native failure inspect exact errors; do not make speculative repo changes or conceal failures. Any required product-source correction returns to parent review.

## Review checkpoint
Parent verifies source overlay/artifact independently, reports Preview identity separate from stableAPK, and asks user to retest actual Takomi sending rather than treating build success as runtime proof.
