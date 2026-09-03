# D01 — Specify web and desktop parity journeys

**Role:** Designer
**Stage:** Design
**Depends on:** G01, G02, G03, G04
**Execution:** Orchestrator owns product/UX decisions and the final specification. The retained Antigravity proposal is exploratory input only; future Antigravity use is limited to actual UI code writing/refinement.

## Objective
Produce build-ready interaction specifications for discovering Pi resources, importing/resuming a CLI session, viewing transcript fidelity, controlling Pi/Takomi, and handing a session back to the CLI.

## Read first
`master_plan.md`, `Upstream_Strategy_and_Resilience_Addendum.md`, current web `ChatView`, composer, command menu, command palette, provider/settings panels, right-panel store/tabs, `TakomiToolCallCard`, `TakomiInspector`, and equivalent Codex/Claude flows. The final design must inspect and preserve the existing T3 visual language; concrete alternatives are reviewed with the user before implementation.

## Required journeys
1. New Takomi thread with model/thinking/runtime capabilities.
2. Discover commands, templates, and skills from the selected environment/workspace.
3. Continue-session picker with Clone into Takomi Code as the only stock action. Original-file Attach is unavailable until Pi provides an enforceable lock.
4. Source-changing-during-clone, compatibility error, missing cwd, moved workspace, stale session, and cancellation.
5. Hydrated historical transcript with custom/unsupported-entry disclosure.
6. Tree navigation, fork, clone, rename, stats, HTML/JSONL export.
7. Queue/steer/follow-up, compact/retry/bash controls.
8. Takomi mode/workflow/board/subagent/routing/policy/todo Run Details.
9. Stop owning the cloned child before opening that child in another CLI; the untouched source remains independently usable.

## Deliverable
Orchestrator-authored concrete UI directions plus a concise screen/state map with exact entry points, labels, empty/loading/error/reconnecting states, confirmation copy, keyboard behavior, focus restoration, and reverse paths. Include at least two visually comparable options where a consequential choice exists, then record the user's selection. Reuse T3 primitives; do not invent a parallel navigation system.

Final artifacts:
- `Design_D01_Antigravity_Proposal.md`
- `Design_D01_Constraint_Review.md`
- `Design_D01_Final.md`

## Definition of done
- Every journey has entry, success, cancellation, failure, and return paths.
- Provider-host filesystem paths are clearly environment-local.
- Unsupported terminal-only UI is explicitly represented.
- No control appears without a server capability.
