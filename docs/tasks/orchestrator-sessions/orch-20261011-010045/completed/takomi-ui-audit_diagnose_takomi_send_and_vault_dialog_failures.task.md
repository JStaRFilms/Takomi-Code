# Diagnose Takomi send and Vault dialog failures

## Objective
The user says Takomi cannot send prompts in their older installed app while another provider can, and desktop Vault UI closes whenever the model invokes it. Find narrow source-backed causes without attributing UI closure to user cancellation.

## Scope
Read composer submission/capability/busy state and Takomi/Pi provider invocation paths across web/desktop/mobile. Trace Vault private credential or Pi UI request lifecycle from provider tool through server/client reply. Existing vault_request returned Cancelled by user, but user now reports unexpected closure. Determine which source is in this repo versus the external installed Takomi/Pi extension. Inspect only authorized read-only metadata/logs and redact secrets.

## Prime context
Read relevant repository AGENTS, apps/web/src/state/piSessions.ts, ComposerPendingApprovalPanel.tsx, Pi/Takomi provider layers and packages/takomi-pi-host handlers, MCP requestSecret handlers and any credential dialog contracts/tests. Follow code to exact request lifecycle rather than guessing names. Current repo HEAD26c0ea982d includes unpublished fixes; installed release0.1.1 is older. Android verification continues under a separate monitor.

## Completion criteria
Source-backed root cause or clearly identified missing runtime evidence for both send and Vault. Recommend the smallest correction and meaningful focused test. Distinguish external extension failures, blocked credentials, UI cancellation and transport request lifecycle. Do not claim a send regression without tracing failed control state or server error.

## Deliverables
Concise audit with exact paths, relevant release/build differences, focused test plan and questions necessary to reproduce. No writes, credential requests, builds, commits, pushes, releases, app/browser launches, production mutations or other worktrees.

## Security boundary
Never read secrets, .npmrc tokens, vault values, key passwords or signing material. No bypassing authentication, disabling security or plaintext forms to make Vault appear functional. Do not retry the private form while diagnosing. Preserve unrelated work and Android signing/release pipeline. Read private session logs only if clearly related and summarize/redact sensitive material.
