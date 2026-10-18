# Compare V1 and V2 Vault input and plan a trusted repair

## Objective
User approved a trusted Vault bridge design, said Vault worked in OrchestratorV1, and agreed build/mobile Send first. Android delivery and phone Send now work; splash preview is building. Use this time for read-only Vault architecture analysis. No implementation retry until the ownership design is approved.

## Known defect and blocker
packages/provider-pi/src/server/adapter.ts admits prefixed sensitive input only while pendingVaultCommand belongs to a discovered /vault-* command. A normal model vault_request is cancelled before client display, producing misleading Cancelled by user. Native tool_execution_start occurs before registration/argument validation; extension_ui_request carries no tool-call or extension identity. Name+title is insufficient. Previous coder stopped without changes rather than assume trust. Existing private response lifecycle/wrong-session/stale/spoof/nonpersistence checks must remain.

## Prime context
Read relevant AGENTS, current adapter/private reply paths and tests, packages/takomi-pi-host repo-owned integration, existing UI/RPC secret handlers. Compare local historical source before V2 migration using backup55516b7922b751cb9ad781d169693138e9a4383c and merge b217d8ef4afe51f2e73a35861c920393106eff43 parents; discover actual paths with git tree, do not invent them. Prior user observation is a hypothesis, not proof. External source read-only allowed for C:/Users/johno/.pi/agent/extensions/takomi-vault/secret-input.ts and tools.ts, never vault storage/values. Pi API topics require full relevant harness documentation and links before recommendations.

## Scope
Determine whether V1 supported model-driven Vault safely and what V2 changed. Propose minimal trusted request-to-real-tool-execution ownership support using existing repo services/transport where possible. Bind private requests to active session/turn and actual validated invocation; keep values away from model text/logs/persisted events. Reject fake prefixes, wrong contexts, stale or multiple mismatched replies. Do not treat a tool-start name as proof or propose model-visible bearer nonces. Explicitly define trust in installed extensions and limits of protection against a compromised local process.

## Completion criteria
Source-backed V1/V2 comparison, small repair proposal with alternatives/trade-offs only if necessary, exact modified files and any external paths/permissions needed. Meaningful acceptance/security tests, compatibility/multi-client decisions. Explain if repo-owned change alone can fix it, or installed extension/upstream SDK must change. No unsupported API guessing or authentication relaxation. Do not overbuild cryptographic machinery if an existing registered-tool execution context can safely carry ownership.

## Expected artifacts
Concise returned architecture report only, no file writes. Parent authors any feature/security documentation after deciding implementation. Exact external mutation paths require explicit user permission before writing.

## Constraints
Read-only while local APK worker writes/builds. No source/docs/worktree changes, real Vault requests/retries, credential/signing/password/env/.npmrc reads, transcript dumps, account changes, network publication, browser/app/device/server/build launches, commits/pushes, subagents or liveuserdata writes. Local registered-code and git history inspection only; redact any diagnostic metadata. Splash/Send/APK/signing pipeline out of scope.

## Handoff
Parent reviews design and seeks any required approval. Keep existing vault-tool-input task blocked; do not restart its failed implementation automatically. Phone splash verification can proceed independently.
