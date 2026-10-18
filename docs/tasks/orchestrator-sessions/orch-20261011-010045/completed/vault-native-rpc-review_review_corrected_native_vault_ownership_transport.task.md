# Task 22: Review corrected native Vault ownership transport

## Objective
One focused read-only review of the second Vault correction. The first review passed but missed that native Pi redirects ordinary stdout to stderr. User's fresh port4889 thread failed, and parent reproduced the lost ownership channel without live credentials. Review this concrete gap and its fix.

## Prime context
Read AGENTS, Task21 vault-rpc-output-guard-fix, original bridge/review packets and .t3/vault-code-backups/round2/result.md. Inspect round2 code-only diffs and current files. Actual SDK sources runRpcMode and output-guard show native UI uses a saved raw writer. Production must use public APIs, not fd writes, private SDK imports or disabled protection.

## Scope
Review adapter reserved ctx.ui.notify envelope handling before wake/warning/client/model/log/persistence routing, bounded decoding and malformed suppression. Review mcpInjection capability hint setup/clearing, disabled extensions/bridge absence/ephemeral launches and inherited hints. Existing secret UI flag alone must not enable unsupported old adapters to persist ownership notices. Keep actual registered invocation identity, live session/turn/tool checks, one-use correlations, answer-time recheck and cleanup. Preserve slash/import/TUI behavior.

External code remains limited to C:/Users/johno/.pi/agent/extensions/takomi-vault/tools.ts and secret-input.ts. Verify no ordinary stdout metadata writes, no leaked private envelope on unsupported hosts, and capability failure before persistence. Trust installed native process/extensions as explicitly approved; do not demand compromised-process authentication or crypto redesign.

## Definition Of Done
Return pass or confirmed correctness/privacy/compatibility blockers with lines and minimal correction. Inspect piVaultNativeRpc.ts/.mjs fixture: actual installed runRpcMode and output guard, actual changed tool registration/native validation, strict mocked persistence, no live SDK session/auth/model/store. The old helper must fail the native ownership assertion and corrected helper pass. Coder reports112tests/no skips, scoped typechecks/lint/fmt passed. Parent reruns checks; no duplicate test/native builds required from reviewer. Source selection on port4889 is still unverified and must not be claimed solved by fixture.

## Expected Artifacts
Read-only report, no files written. Mention any real source-selection/testing limitation without inventing a deployment failure. No stylistic comments, extra abstractions, speculative limits or unrelated improvements.

## Constraints
No code/docs/settings/env/Vault/signing/.npmrc writes or data reads, real requests, server/provider/app/browser/device launch/restart, build, network/credentials/push/publication or agents. Preserve apps/server/dist and all running work. Code-only original and round2 snapshots inside .t3 are allowed. Only this transport correction is under review.

## Dependencies and review checkpoint
Implementation completed but remains awaiting acceptance. Parent integrates confirmed corrections once, verifies native tests and prepares an isolated standalone output afterward. Do not claim live UI success before user testing.
