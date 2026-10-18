# Task 23: Build the corrected Vault server separately

## Objective
User wants to test a local server while ongoing work continues. Prepare the corrected ownership transport in a new ignored output. Do not start it or stop existing servers. First repair's installer and old apps/server/dist are not the corrected runtime.

## Prime context
Read AGENTS, Task21/22, .t3/vault-code-backups/round2/result.md, apps/server/vite.config.ts, apps/server/scripts/cli.ts, scripts/lib/cli-external-packages.ts and server static client resolution. Parent112native/adapter/injection tests with opt-ins and no skips passed, both typechecks/lint/fmt/diff passed, review found no blockers. Correct production needs takomi_vault_secret_input handling, [takomi-vault-ownership:v1] envelope, [takomi-vault-owner:v1] placeholder and T3_TAKOMI_VAULT_OWNERSHIP_NOTIFY capability. Public notify replaces ordinary stdout because Pi guards it.

## Scope
Create an owned new directory under .t3/vault-rpc-preview-r2, or a unique suffix if occupied by someone else. Record its marker/provenance before cleaning any output. A temporary Pack config must not import the ordinary server/root Vite config that reads env files. Reuse existing external-dependency predicates and ordinary server bundle entries. Use explicit local-only safe build constants, blank relay/Clerk/telemetry defines where required, existing dependencies, correct server tsconfig. No installs or network. Direct vp pack supports --config/--out-dir; avoid normal build wrapper because it writes apps/server/dist/client.

Capture hashes of the current apps/server/dist tree before work. This is the running port4889 runtime. Compile only to the owned separate server output. Copy the existing apps/server/dist/client directory read-only into the corresponding new client path; no web rebuild or icon exporter. Retain the old runtime untouched. Local native externals may resolve from existing repo dependencies; no new dependency closure/distribution work is required for this local test.

## Definition Of Done
New server entry and chunks exist and contain corrected notify/capability/ownership handling. Check CLI --version in a short hidden-console subprocess, not serve. No ports, SDK sessions, provider execution or private requests. Compute output hashes and compare complete old-dist inventory, proving no active files were overwritten or removed. Server/client output should be usable with a fresh base directory and new local port. No actual live UI success claim.

## Expected Artifacts
Separate ignored server/client tree, temporary safe Pack config, ignored log and small provenance manifest. Exact user command like node <newentry> serve --base-dir <freshhome> --host127.0.0.1 --port4890 --no-browser, adjusted to verified paths. No existing server termination needed. Do not put pairing tokens/private URLs in the report. Native source selection on port4889 remains unverified; report that limitation and, if available, a supported metadata-only way for the user to confirm /vault-add command sourceInfo. No live RPC or credential read to close that gap.

## Constraints
Build-only worker, no product-source or installed-extension changes. No native desktop/Android rebuild, standard server/web build, old-dist overwrite, server/provider/app/browser/device launch/restart, real Vault/auth/session data, env files, signing/.npmrc, account changes, commits/push/CI/npm/GitHub publication or agents. Do not touch managed Android worktree or C:/tp. No auth popups. All commands noninteractive; if network unexpectedly needed, fail and report instead of login/install.

## Dependencies
Reviewed source correction and parent checks are complete. No other writing agent is active.

## Review checkpoint
Parent verifies new hashes/markers/version and unchanged old dist. User starts the new local-only server manually and creates a fresh Takomi thread. Model-driven Vault UI remains unverified until user reports it works.
