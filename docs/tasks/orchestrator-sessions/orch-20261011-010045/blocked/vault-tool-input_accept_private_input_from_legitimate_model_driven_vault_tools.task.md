# Accept private input from legitimate model-driven Vault tools

## Objective
Fix confirmed Vault RPC input regression: a model calling vault_request in a regular turn is cancelled because the adapter admits only slash-command-owned private inputs. User reports desktop Vault closes; earlier tools falsely returned Cancelled by user.

## Prime context
Read AGENTS and packages/provider-pi/src/server/adapter.ts (private extension_ui_request around1330–1425, pendingVaultCommand around2725, tool start/end and turn finalization), adjacent adapter tests and source UI response redaction/nonpersistence tests. Architect report is T3 task node:delegated-task:command%3Amcp%3A2fd84742-5844-4bb6-a5f5-f9d9c25d5153%3Adelegate-task%3Atakomi-send-vault-audit-20261011-r1. External installed extension C:/Users/johno/.pi/agent/extensions/takomi-vault/secret-input.ts exposes prefixed RPC input and tools.ts maps absent answer to Cancelled by user; inspect only relevant source, never state/credentials, do not edit external files. Both v0.1.1 and HEAD26c0ea982d contain confirmed defect.

## Scope
Only legitimate model-invoked Vault secret-entry context, owning live turn and matching private response. Preserve slash commands including vault-import, normal approval/question flows, private transport, masking, cancellation and nonpersistence. Track legitimate actual tool execution, not arbitrary prefixed titles. No UI redesign or auth relaxation. If a secure minimal correction requires undocumented assumptions or schema/identity redesign, report blocker rather than broadening trust.

## Definition of done
Normal model-driven vault_request private input stays pending until matching answer/cancel. Sensitive values never persist into ordinary events/timeline/provider transcript/tool logs or leak in wrong-session/stale responses. Preserve spoofed title rejection and settled-turn rejection. Focused behavioral regression and existing sensitive input tests pass, scoped typecheck/lint/format. Validate exact legitimate secret-producing Vault tools from source rather than accepting all vault_* names speculatively.

## Expected artifacts
Small adapter and focused tests diff, clear result with exact checks and changed trust decision. No docs unless changing a documented interface/security assumption.

## Constraints
No real secrets/password requests, vaultstate/env/.npmrc/signingarea reads; no TUI/browser/device/app launches, server restarts, external/liveuserdata writes, dependencies, release/build dispatch, commit/push or unrelated worktrees. Only one source-writing agent active. Android monitor is paused after failure; parent investigates SDK compatibility read-only. Mobile Send issue is separate and not yet root-caused; do not speculate-fix it in this slice.

## Verification
Test actual ordinary model prompt, tool-start/private-request/response with event fixtures and existing effect worker/event promises, not sleeps. Include tool context termination cleanup and run/session ownership where tests already cover them. One focused review, not recursive cleanup. Report source test proof separately from actual installed desktop behavior.
