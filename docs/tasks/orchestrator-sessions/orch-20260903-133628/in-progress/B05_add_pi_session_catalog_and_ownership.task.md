# B05 — Add an environment-local Pi session catalog and ownership model

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B01, B02, D03
**Status:** In progress — implementation revised after review; B06 integration remains blocked.

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

## Current implementation boundary

- Listing is available only when the provider reports verified Pi `0.84.4`; Clone and Attach capabilities remain false.
- RPC input carries provider instance and project IDs only. The server resolves and canonicalizes the authorized workspace and keeps native session paths and IDs server-side.
- The host scans documented Pi storage read-only with bounded filenames, files, records, bytes, concurrency, deadline cancellation, containment, no-follow descriptor checks, and a 2,000-file hard ceiling.
- A server-lifetime lifecycle owns random scoped handles, single-use scoped cursors, stable snapshots, HMAC-attested cloned-child provenance, exclusive leases, generation fencing, and reconciliation-required process-loss/restart states.
- B06 must call the internal clone-verification/lease API after it implements stock-Pi cloning. B05 does not execute clones and never leases source sessions.

## Requirement-to-test matrix

| Requirement                                                                 | Focused proof                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Exact Pi 0.84.4 storage precedence and version gate                         | `sessionCatalog.test.ts`: launch/environment/settings/default precedence; unverified-version rejection |
| Read-only bounded scan, oversized/malformed metadata, hard ceiling          | `sessionCatalog.test.ts`: no-write metadata scan; truncated/malformed metadata; 2,000-file cap         |
| Workspace isolation, moved/missing cwd, Windows-safe canonical paths        | `sessionCatalog.test.ts`: custom storage cwd filtering (suite runs on Windows)                         |
| Cancellation, symlink and TOCTOU defenses                                   | `sessionCatalog.test.ts`: pre-abort/symlink rejection; deterministic lstat-to-open replacement race    |
| Opaque bounded wire contract and cap/page distinction                       | `piSessionCatalog.test.ts`: bounded request and redacted page schemas                                  |
| Stable bounded pagination/cache invalidation beyond old 250-entry window    | `PiSessionLifecycle.test.ts`: all 301 entries across a stable snapshot; oldest-snapshot eviction       |
| Cursor replay and environment/provider/project/workspace/generation fencing | `PiSessionLifecycle.test.ts`: single-use cursor and scope rejection                                    |
| Server-side project routing and expiry before host I/O                      | `PiSessionCatalog.test.ts`: expired generation rejection without path access; non-Pi rejection         |
| Clone-only provenance, source ownership exclusion                           | `PiSessionLifecycle.test.ts`: source-handle requirement and attested cloned-child lease acquisition    |
| Exclusive owner, renewal/release fencing, process loss, restart recovery    | `PiSessionLifecycle.test.ts`: generation-fenced lifecycle and durable-secret restart reconciliation    |
| Explicit read authorization                                                 | `RpcAuthorization.test.ts`: both Pi RPC methods require orchestration-read scope                       |
| Truthful capabilities                                                       | `PiProvider.test.ts`: list version gate; Clone/Attach false                                            |

## Remaining blockers

- B06 is required to implement and integration-test actual clone creation, then feed verified child evidence into this lifecycle. Until then lease diagnostics are normally empty and no Clone action may be advertised.
- End-to-end desktop/SSH/WSL browsing and process supervision tests require B06/client integration; B05 covers their environment boundaries at the server lifecycle and contract layers only.
