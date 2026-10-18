# Restore model-driven Vault input with execution ownership

## Objective
Restore private input for a model-driven vault_request without restoring V1's prefix-only admission. User approved the proposed repair and explicitly approved modifying C:/Users/johno/.pi/agent/extensions/takomi-vault/tools.ts and C:/Users/johno/.pi/agent/extensions/takomi-vault/secret-input.ts. No other external writes or Vault data changes are authorized.

## Workflow and prime context
Follow Build after the completed vault-provenance-plan architecture task in this session. Read AGENTS, packages/provider-pi/src/server/adapter.ts and adapter.test.ts, related private response paths, docs/features/takomi-pi-provider.md and existing provider security documentation. For Pi APIs, read complete relevant SDK/extensions/RPC documentation and linked examples before changing integration. The architect inspected installed Pi1.1.0 and found tool_execution_start precedes registration and argument validation. It is not execution proof.

## Confirmed regression
V1 f59fedb3e1ef76395f3f70d77865be7dfa5665ff:apps/server/src/provider/Layers/PiAdapter.ts admitted secret prefixes without tool ownership. V2 and current adapter require a pending slash Vault command. Thus installed tools.ts calls maskedSecret during vault_request, but the adapter cancels before showing the form. Parent independently checked both admission predicates. Restore valid behavior, not the unsafe old predicate.

## Approved scope
Use a cooperative versioned protocol from the actual registered vault_request.execute body after native validation. Give maskedSecret an explicit per-invocation context containing its real toolCallId, native session identity and abort signal. Emit only bounded, secret-free ownership assertions to the Pi child's JSONL stream. Associate each secret UI input with a fresh correlation ID in the native placeholder, consume once and strip it before any client event, logging or persistence. Match live child/session/current turn and tool lifecycle; no global current-tool state because concurrent calls are supported. Close scopes in finally and on abort, settlement, replacement and shutdown. Recheck ownership before delivering a private answer.

Reuse existing private input transport and guards in adapter.respondPiSecretInput and server providerRespondPiSecretInput. Keep slash-command and archive restrictions. Authorize only vault_request tool-owned secret input, not every vault_* tool or archive input. No name/title-only trust. No secrets or model-visible bearer token in ownership metadata. A correlation ID identifies a request; it does not authenticate code.

## Trust boundary
The adapter trusts installed Vault and other extensions in its Pi process. The assertion comes from registered execution code. This is not protection against a malicious extension or compromised native process that can forge stdout or read memory. State this limit honestly. Do not add same-process cryptographic machinery and claim it authenticates against that attacker.

## Compatibility
Preserve terminal Pi behavior and existing slash commands. Ownership records must not pollute normal terminal output. Use a documented RPC distinction or a non-secret, adapter-set capability hint if required; do not invent ctx.mode or another absent API. Older adapters/extensions must fail closed or retain their existing slash behavior. No required web/desktop/mobile private UI or public contract changes are anticipated. A new desktop/server runtime and user-controlled new/reloaded Pi session are needed before the repair works live. Do not restart or modify the live app while coding.

## Expected artifacts
Minimal repo adapter and focused tests, plus the two explicitly approved installed extension code files. Update the existing feature/security explanation only for the new cross-process ownership constraint. If an extra external file or a broader execution host is needed, stop and ask first. Keep code idiomatic and strongly typed, reuse existing services, and avoid extra abstractions or dependencies. Do not stage or commit unrelated source work.

## Completion criteria and verification
A registered-tool conformance fixture must exercise actual validation/execute/UI flow with synthetic data, not only fabricated tool_execution_start events. Verify valid model-driven requests open private input, and unknown/invalid/blocked executions do not. Cover unowned prefix/name spoofing, missing/mismatched metadata, wrong session/turn, replay/duplicate correlations and stale responses. Show concurrent requests cannot borrow ownership, and exit/abort/reload prevents later secret delivery. Synthetic secrets must not enter normal answers, model results, logs, tracing or persisted events. Preserve existing slash Vault/import tests. Run focused adapter tests and relevant scoped typecheck/lint/format. Parent runs one focused review and relevant checks; no claim of live private form verification without authorized testing.

## Dependencies and execution gate
Do not launch while mobile-splash-local-apk is still building. The root source snapshot and build remain single-writer. Parent will read existing docs and record the approved design before implementation starts. Previous vault-tool-input attempt stays blocked and superseded by this approved task, not automatically retried.

## Constraints
Do not read or modify Vault storage, real credential values, signing state, env files or .npmrc. No real Vault requests, browser/app/device/server/emulator launches, native builds, account changes, broad kills, worktree resets, liveuserdata writes, dependency installs, commits/pushes/CI/npm/GitHub publication. Only the two exact installed extension paths above may be changed outside the checkout. Preserve approved mobile Send and splash source/assets, APKs, signing key and private state.

## Review checkpoint
Report exact files, test results, remaining limitations, how older runtime versions behave, and the user-controlled rebuild/session reload steps. No publication or live installation.
