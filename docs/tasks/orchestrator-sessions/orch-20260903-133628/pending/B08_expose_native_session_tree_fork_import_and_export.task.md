# B08 — Expose tree, fork, clone, import, export, name, and stats

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B03, B06, B07

## Objective
Provide the remaining native session operations with exact Pi semantics and no JSONL surgery.

## Architecture constraint
A session has exactly one long-lived owner. Compatibility sessions may use stock RPC. Maximum-fidelity sessions use one isolated public-SDK Pi Host implementing both the baseline stream/control protocol and SDK-only operations. Never keep RPC and SDK owners open together. Do not import Pi SDK into the T3 server process or call private Pi internals.

## Implement
Version/capability/integrity handshake, typed request/response schemas, per-method `RPC_REQUIRED_SCOPES`, opaque IDs, server-managed upload/download artifacts, cancellation/timeouts/size ceilings, scope cleanup, source/child provenance, and thread-binding updates after runtime replacement. Specify stop/handoff/restart ordering, generation fences, subscription replacement, and partial-failure behavior. Every mutating operation requires an idle solely owned session. Same-file tree navigation remains unadvertised until B07's active-leaf projections are complete.

## Tests
Single-owner enforcement and transport handoff; navigate before/at user/assistant/tool/root entries; leaf-only changes; branch summary; fork versus clone semantics; parentSession provenance; HTML and JSONL export through managed artifacts; upload import, missing cwd override, same-basename collision; rename/stats; scope denial; path/symlink escape; byte/time limits; interrupted replacement; host crash; unsupported Pi version. Session deletion and `/share` stay unsupported.

## Definition of done
Each advertised operation matches Pi's documented tree/session behavior under one owner. Where Pi replacement cannot be rolled back atomically, the capability reports a truthful transitional/failure state and never claims the old runtime is still live.
