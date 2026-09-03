# B05 — Add an environment-local Pi session catalog and ownership model

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B01, B02, D03

## Objective
List independently created Pi sessions safely and establish sole ownership only for Takomi Code-created cloned children.

## Read first
Pi session/session-format/security docs, `SessionManager` declarations, T3 environment/project/thread persistence, provider instance routing, desktop/SSH/WSL environment boundaries, and session picker patterns.

## Implement
A server-side catalog scoped to the selected environment and workspace. Return bounded metadata only: native session ID, path token (not unrestricted client path), name, cwd, timestamps, model/thinking, entry count, parent session, format version, compatibility, and active/owned status. Resolve encoded session directories using Pi's own conventions or public SDK.

Expose Clone only for stock Pi. Original-file Attach remains unavailable because CLI Pi does not honor a T3 lease. Add a lease for Takomi Code-owned cloned children with acquisition, renewal, process-death, stale-owner recovery, server-restart, stop, and handoff semantics. Never delete, migrate, or rewrite during listing. Remote clients operate on opaque environment/provider/workspace-bound IDs.

## Tests
Windows paths, WSL/SSH/local environments, moved/missing cwd, malformed/truncated JSONL, legacy versions, file/entry/byte ceilings, cancellation/backpressure, cache invalidation, huge catalogs without an unbounded underlying scan, active T3 owner, uncertain external owner, symlink/path traversal, scope authorization, and no writes during scan.

## Definition of done
A remote client can safely browse relevant host sessions without learning arbitrary filesystem contents or creating a second writer.
