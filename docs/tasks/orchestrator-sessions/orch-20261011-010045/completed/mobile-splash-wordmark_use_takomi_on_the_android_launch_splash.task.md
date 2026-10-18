# Use Takomi. on the Android launch splash

## Objective
User confirmed Takomi Send now works on the phone, but Android Preview startup still looks like T3. Replace only the native Android splash wordmark with the literal `Takomi.`. Keep the existing launch behavior and other branding paths unchanged.

## Prime context
Read AGENTS, apps/mobile/app.config.ts variant assets and expo-splash-screen plugin, scripts/export-android-icons.ts, relevant existing brand asset tests, existing mobile fonts and assets. Preview currently sets androidSplashIcon to androidAdaptiveForeground. Android12 masks the central two thirds of a288dp icon. Root brand icon is a stylized T, but user explicitly asks for readable Takomi. rather than another icon. scripts/lib/brand-assets.ts already points iOS PNGs to Takomi icon; do not change iOS, web, desktop or launchers for this Android request.

## Scope
Use a dedicated Android splash wordmark asset instead of reusing the launcher foreground. Reuse existing sharp and project fonts/source asset conventions. Keep generation reproducible via the existing export script, never a one-off untracked font rendering or OpenAI image generation. Provide readable dark-on-light and light-on-dark treatment, preserving current Preview navy and production/development background configuration. Fit the actual nontransparent glyph bounds inside Android12 circular safe zone, not merely the full canvas. No app/package/version/preview-channel/permission changes.

## Completion criteria
Android splash configurations reference assets showing Takomi. in Preview and stable/development variants, correct contrast for each existing light/dark background. Static asset inspection proves dimensions/transparency and safe glyph bounds. Run relevant narrow tests/typecheck/lint/format. Do not add trivial source-text assertion tests or UI snapshot churn. Existing export can regenerate the shipped assets without overwriting this correction. Identify exactly new asset paths that need staging for local builder's tracked-file overlay.

## Expected artifacts
Minimal mobile app config/export-generator diff and required generated PNG assets. Existing fonts/dependencies reused. Concise report and checks. No local/native build yet; parent reviews and stages new tracked assets before build. No new docs unless existing documented generation assumptions become inaccurate.

## Constraints
Only source-writing agent. Preserve uncommitted verified Send correction in modelOptions and its two tests, old APKs, signing material and task notes. No browser/device/emulator/app/server, secret/env/.npmrc/signing/Vault reads, external files, accounts/worktrees, commit/push/CI/npm/GitHub publication. No deleting or restyling unrelated launcher/background assets. If font rasterization is used, pin a font already shipped in the repository, not whichever system font happens to be installed. No image-generation quota. Parent can inspect generated PNGs via file read, no computer use.

## Review checkpoint
Parent checks only launch identity changed, reviews final assets and Android config, then builds a fresh local Preview using authorized C:/takomi-local-build and existing C:/tp cache. Actual launch appearance is user device verification, not implied by static checks.
