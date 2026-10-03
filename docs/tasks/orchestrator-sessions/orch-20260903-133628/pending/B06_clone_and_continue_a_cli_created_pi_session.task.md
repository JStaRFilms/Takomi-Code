# B06 — Clone and continue a CLI-created Pi session

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B03, B05, D01, D02, D03

## Objective
Create the server command flow that clones a cataloged native Pi session through Pi, binds the child to a new T3 thread, and continues safely. Original-file Attach is explicitly unavailable until Pi supplies an enforceable cross-process lock.

## Implement
- Accept an opaque environment/provider/workspace-bound catalog session ID.
- Revalidate canonical path, file identity/checksum, format, cwd, Pi version, provider instance, authorization scope, and source stability at execution time.
- Clone through Pi's own fork/clone/session APIs, never a handcrafted JSONL rewrite.
- Verify source identity/checksum did not change during clone; fail safely if it did.
- Launch one owner for the child and wait for state to confirm the exact child session.
- Persist source and child provenance, resolved runtime versions/integrity, append high-water entry ID, active `leafId`, transport identity, and transcript fidelity in a versioned resume cursor.
- On failure, release the child lease and avoid creating a half-bound thread.
- Provide stop/release/handoff before opening the child in another CLI.

## Tests
Successful clone and prompted continuation; parent-link correctness; source checksum stability; cancelled clone; stale catalog token; source changed during clone; missing cwd; incompatible version; failed Pi startup; duplicate child ownership; process/server restart; Takomi custom-state restoration; release and CLI handoff.

## Definition of done
A synthetic/copied CLI fixture becomes a T3 thread, continues through Pi, restarts with the same active leaf and Takomi state, and leaves the source unchanged.
