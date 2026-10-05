# G02: Inventory canonical Takomi extension behavior

## Agent setup

Launch cwd `C:/CreativeOS/01_Projects/Code/Clones/takomi-parity-next`. Read `docs/tasks/orchestrator-sessions/orch-20260930-032143/master_plan.md` and this task completely. Load `unslop`. This task is explicitly read-only, including reports: return the inventory inline so the parent can persist it. No subdelegation, board updates, code/doc edits, tests that write source/state, runtime launches, installs, servers, browsers or commits.

The canonical source is `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite`. It has another session's staged/unstaged artifacts. Preserve all work and inspect metadata/source only. Do not read credentials, private sessions, account databases or unrelated user content. Installed `~/.pi/agent` is not canonical source and is not a deployment target for this task.

## Objective

Inventory every canonical extension's tools, commands, state and user interactions, then determine which have an actual functional equivalent in the current app. Provide a precise boundary for suite changes needed to finish parity.

## Scope and sources

Inspect package.json, suite-specific AGENTS guidance, current compatibility/configuration contracts, `.pi/extensions` registration points and their referenced source, `.pi/prompts`, theme/shortcut hooks, and relevant extension tests. Cover takomi-runtime, takomi-context-manager, takomi-subagents, takomi-vault, oauth-router, antigravity-provider and notify-sound. Verify the real current Pi/pi-subagents version pins rather than assuming the older 0.84.4 audit baseline. Companion questionnaires/todo/context/browser are separate installed packages; identify supported fallback boundaries without assuming bespoke app renderers.

Compare app `PiAdapter.ts`, `PiLaunchResources.ts`, tool presentation contracts, `TakomiToolCallCard.tsx`, `TakomiInspector.tsx`, mobile task/work-log/question/Vault code, and RPC endpoints. Native Pi 0.99.1 docs live at `C:/Users/johno/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/docs/`.

## Required output

Return a structured report, with source file/line references, covering:

1. Current source revision, dirty-work categories and exact dependency version evidence. No staged-content changes.
2. Per-extension command/tool inventory and native behavior categories: model execution, command-only result, dialog, rich/custom TUI, status/widget/editor updates, durable filesystem state, async lifecycle, auth/account operation and host-only effects.
3. Per behavior, app support as execute/display/control; web/desktop/mobile differences; reduced fidelity or lost fields; runtime limitation vs adapter omission.
4. A minimal versioned deterministic control/state interface for Takomi if stock RPC cannot expose the needed action. State read/changes and run control must not depend on a model choosing to call a tool. Existing `/takomi` commands may already be deterministic; identify those before proposing new APIs.
5. Rich-question/subagent clarification transport requirements and backwards-compatible fallback. Explain which layer owns validation, secret redaction and cancellation.
6. OAuth-router login/status/usage GUI parity and safe host/client boundaries without requesting credentials or starting login.
7. Managed-runtime packaging inputs, ownership/licensing/version pin issues; installed runtime vs canonical source distinction.
8. A ranked, bounded list of necessary suite changes, allowed-file suggestions and meaningful existing tests to extend. Report any active-file overlap as a blocker, not a license to overwrite.

## Definition of done

Every canonical extension is accounted for; concrete registrations and handlers substantiate the mappings; current dependency pins are checked; display-only vs direct-control behavior is explicit; necessary suite changes have scope/test references. Return findings and uncertainties inline, not an unsupported claim of complete parity. The parent persists `G02.report.md` and records board completion after checking the report.

## Expected artifacts

A returned structured extension parity inventory and suite-change recommendations. No files written by this task.
