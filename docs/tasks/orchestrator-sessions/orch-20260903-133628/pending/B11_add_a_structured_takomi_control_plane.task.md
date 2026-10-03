# B11 — Add a structured Takomi control plane

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B03, B04, B08, B10, B12

## Objective
Expose Takomi modes, workflows, boards, routing, policy, skills, todos, and subagent actions through a deterministic public control API without duplicating their state machines in T3 or asking a model to invoke tools.

## Implement
First refactor/version Takomi so tool handlers and the isolated Pi Host share public domain services with schema validation, hooks, cancellation, progress, persistence, and result semantics. Do not directly call arbitrary tool `execute()` definitions and do not send prompts asking the model to call a tool. Add a versioned host control contract and typed T3 intents for: mode/status/reset; Genesis/Design/Build workflow lookup; board show/update; routing preview/apply/configure; policy manifest/load; skill index/manifest/load; todo CRUD; subagent list/models/status/interrupt/resume and preview-confirmed launch.

Persist only provider-neutral projections and stable identities. Pi/Takomi remains authoritative for gate state, board files, policy load state, child conversations, worktrees, and async runs. Do not use `clarify:true` remotely. Surface blocked/manual/review gates and model-policy failures as actions requiring user choice; never retry blocked/cancelled launches automatically.

## Tests
Direct invocation determinism without model tokens, schema rejection, hook/cancellation/progress semantics, state restoration from Pi custom entries, board replacement/update, single/parallel/chain/async projections, live and persisted resume, interrupt, preview-confirm, model gate, missing-policy prerequisite, worktree artifacts, process restart with degraded checklist provenance, and control API version mismatch.

## Definition of done
Every core Takomi operation is invokable and inspectable from structured UI while terminal-only dependencies have explicit alternatives.
