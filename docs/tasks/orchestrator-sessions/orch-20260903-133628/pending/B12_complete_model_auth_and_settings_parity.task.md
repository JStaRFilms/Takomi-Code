# B12 — Complete model, provider, auth, and settings parity

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B01, B02

## Upstream reuse gate
Before implementation, read `Upstream_Strategy_and_Resilience_Addendum.md` and compare the task against upstream PR #7211 (`upstream/pr-7211`). Reuse or contribute focused upstream-safe work where architectures align; do not duplicate completed behavior, import Takomi into generic Pi code, or cherry-pick the incompatible provider stack wholesale.

## Objective
Expose the safe, environment-hosted subset of Pi model/provider/auth/settings management with correct scope and version behavior.

## Implement
- Preserve exact provider-qualified model IDs, reasoning support, input modalities, context windows, and sparse thinking-level maps.
- Show active/default model and in-session switching constraints.
- Add health diagnostics for exact resolved Pi/Takomi/pi-subagents paths, versions, integrity, agent directory, suite root, resource loading, duplicate/global version conflicts, and model warnings.
- Design host-side login/logout/auth-check flows only through Pi-supported public commands/APIs in the isolated host; handle `CredentialSynchronizationError` partial-success semantics and never transport credential values to clients or logs.
- Define an explicit authorization scope for credential/provider configuration; T3 currently has no generic admin scope. Expose custom-provider/model configuration as revision-checked, validated edits with preview/confirm, settings flush, deadlines, and active-runtime reload behavior.
- Reconcile Takomi advisory routing with executable registry/allowlists; unavailable model IDs remain errors, not silent fallback.

## Tests
No-auth/expired/refresh/error/partial-success, operation deadlines, model disappears after refresh, sparse thinking levels, custom provider, project trust `ask` versus saved trust, remote environment scoping, scope denial, revision conflict, settings write/flush/reload failure, duplicate resolved-package diagnostics, no secret serialization, backward-compatible snapshots.

## Definition of done
Users can understand and safely configure what Pi will run without Takomi Code becoming a second credential store.
