# Build Windows Preview with the reviewed Vault adapter

## Objective
User explicitly approved a new local Windows Preview installer containing the reviewed Vault fix. Do not install or launch it. This rebuild supplies the new server adapter; the two approved global Vault code files were already updated locally.

## Prime context
Read AGENTS, scripts/local-build.ts and docs/user/local-builds.md. Source HEAD is d92e9bd5a5 with uncommitted reviewed changes. Read completed vault-trusted-input-bridge/review records. Parent101adaptertests with installed conformance paths enabled and no skips passed, provider+installed-code typechecks/lint/fmt/diff passed. One read-only SolHigh review found no blockers. Mobile Send and Takomi. splash source changes coexist and must be preserved. New PNG/SVG assets and provider test fixture are staged for tracked-file overlay; no commit or publication.

## Scope
Run node scripts/local-build.ts --desktop once from current root. Verify C:/takomi-local-build marker, registration/common Git directory before already-authorized reset/clean. Never reset, clean or delete C:/tp dependency cache, main checkout, feat/pi-debrand or any other worktree. Normal existing cache reuse is allowed. Preserve all old APKs/EXEs and completed release folders.

## Definition of done
A new unique feedless local Windows Preview installer appears under release/local-* with nonzero size and SHA256. Compare root versus managed adapter.ts, updated feature doc and conformance fixture source to prove current overlay. Inspect packaged backend, not only source: locate server code in staged/unpacked desktop ASAR or bundle and verify it includes takomi_vault_secret_input versioned ownership and private owner placeholder support. Confirm existing native runtime payload safety/ASAR pack verification passes. Report unsigned Windows status honestly. This does not establish a live Vault form result.

## Expected artifacts
Installer path/bytes/hash, ignored build log under .t3/local-build-logs, source-overlay checks and packaged backend verification. Existing local builder also packages required runtime/server dependencies; no new npm or GitHub release. Do not package private installed extension data or copy external signing/Vault state.

## Constraints
Only active build worker. No product-source edits, installed extension changes, credential/Vault/signing/env/.npmrc reads, native app/server/browser/device launch or installation, worktree/account/profile/liveuserdata changes, commits/pushes/CI/npm/GitHub publication. No global icon exporter, which would rewrite legacy launcher assets. Redirect build logs to ignored file and return bounded relevant redacted lines. Never kill processes by name/path; only captured spawned PIDs if required. Network noninteractive, pinned JStaRFilms for GitHub if needed, no global credentials changes. Stop on ownership/access/compile failures and report root cause, not repeated blind builds.

## Review checkpoint
Parent independently hashes artifact and checks packaged source evidence. User controls installer launch/install and starts a new/reloaded Pi session before testing private input. Existing Android splash Preview remains intact. Global extension updates can overwrite local code edits; this installer does not distribute those extensions to other machines.
