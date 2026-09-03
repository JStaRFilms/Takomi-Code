# B19 — Run the cross-surface interoperability verification matrix

**Role:** Worker
**Stage:** Build
**Depends on:** B00, B01, B02, B03, B03A, B04, B05, B06, B07, B08, B09, B10, B11, B12, B13, B14, B15, B16, B17, B18

## Objective
Prove the integration against real process boundaries and all applicable clients before release.

## Matrix
- Pi versions: pinned supported version plus one older/newer compatibility case.
- Sessions: new, CLI-created, clone-only continuation, source checksum stability, branch, active-leaf-only change, compaction/effective context, custom entries, crash gap, restart, handoff; verify original Attach is unavailable.
- Transports: local, remote/relay, and tunnel.
- Clients: web, Electron desktop, iOS, Android.
- Resources: global/project extension command, template, model-invoked skill, user-only skill, model-only skill.
- Interactions: confirm/select/input/editor/unsupported custom UI.
- Takomi: mode, each workflow, board, todo, single/parallel/chain/async, status/interrupt/resume, routing and policy gate.
- Controls: steer/follow-up/queue/abort/compact/retry/bash.
- Security/performance: RPC scope denial, opaque token binding, canonical/symlink path escape, ownership conflict, secret redaction, payload/file/time limits, long history with bounded underlying scans, high-frequency updates, and dirty-baseline preservation.

## Rules
Use synthetic or copied test data, never live writable Pi sessions. Wait on typed receipts/drains, not sleeps. Run focused package/file checks; do not run repo-wide checks unless requested. A real browser/simulator integrated pass requires explicit user permission.

## Deliverable
A parity ledger marking each row exact/approximate/unsupported, test evidence, defects, and release blockers.

## Definition of done
All advertised capabilities have executable evidence and every remaining limitation is visible in product copy and docs.
