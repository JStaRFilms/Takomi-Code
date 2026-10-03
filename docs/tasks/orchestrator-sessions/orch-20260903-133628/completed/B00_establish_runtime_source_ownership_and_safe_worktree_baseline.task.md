# B00 — Establish runtime source ownership and a safe worktree baseline

**Role:** Coder
**Stage:** Build
**Depends on:** D01, D02, D03
**Execution gate:** Must be explicitly approved before any other Build task

## Objective

Make the implementation reproducible and protect the user's existing work before multiple agents touch Pi, web, mobile, or packaging files.

## Required baseline gate

Ask the user to choose one non-destructive baseline: commit the existing changes, shelve them outside the worktree, or record an exact `git diff --binary`, file hashes, and named file ownership. Never reset, clean, checkout over, or discard the current modifications. Record which files B03/B13/B14/B15 may edit and the reconciliation rule.

## Runtime source gate

Treat `C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite` as canonical Takomi source and `~/.pi/agent` only as an installation target. Do not copy Takomi implementation into generic T3 Pi modules. Consume the canonical `takomi` package through a pinned published/local artifact boundary, preserving its manifests, licenses, provenance, exact Pi and `pi-subagents` constraints, and integrity metadata. Detect multiple resolved installations and report the exact path selected. Remove private `pi-subagents` TypeScript imports or isolate them behind an explicitly pinned compatibility adapter with failing conformance tests.

Add canonical → packed artifact → isolated install validation and a per-file ownership manifest capable of reporting added, changed, removed, conflicted, and unmanaged files. Do not use `scripts/sync-pi-global.ps1` as a production deployment model. Any emergency edit under `~/.pi/agent/extensions` must be ported to canonical source before packaging.

Define the package/process boundary for one long-lived isolated Takomi Code Pi Host using Pi public SDK APIs. The host is the sole owner of any maximum-fidelity session and is distributed to every environment host form: desktop-hosted server, standalone server, SSH, and WSL.

## Verification

- Baseline artifact reproduces every pre-existing modification byte-for-byte.
- Canonical, packed, and isolated-installed manifests/licenses/provenance plus per-file integrity validate.
- A private dependency/API mismatch fails before a user session starts.
- Host package skeleton starts and reports versions/capabilities without loading a real writable session.

## Definition of done

No Build agent can silently overwrite user work, and no feature depends on mutable unmanifested files in `~/.pi` or an ambiguous pi-subagents installation.

## B00 baseline record

- Design baseline: `a9095eef2a29e3710821d48b69c1088ef2e2e95e` (`docs(pi): define Pi and Takomi parity plan`).
- Release baseline: `a63641ba261626b8b7dec5fc02bcc2ab9c08d928` (`chore(release): bump packages to 0.0.39 with windows desktop docs`).
- The product tree was clean before B00. The expected workflow-only deltas are the B00 task move from `pending/` to `in-progress/` and the Orchestrator Summary provenance update. B00's host package and lockfile entry are its own scoped deliverables; no source scratch patch is part of this baseline.
- Canonical Takomi compatibility changes were committed separately at `f6c352c` (`fix(runtime): pin Pi compatibility boundary`). The fresh real artifact pipeline records that exact clean commit with `dirty: false`; T3 consumes the packed artifact boundary and never treats `~/.pi/agent` as source.

### Named overlap ownership and reconciliation

| Task | Exclusive first owner                                                                                                                                                | Explicit overlap rule                                                                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B03  | `apps/server/src/provider/Drivers/PiDriver.ts`, `apps/server/src/provider/Layers/PiAdapter.ts`, and Pi provider-runtime contracts required for those lifecycle fixes | Does not edit web/mobile. If a B03 contract change reaches another task's file, the later task rebases its focused change on the recorded baseline and preserves both hunks; no reset, checkout, clean, stash, or broad formatter rewrite. |
| B13  | `apps/web/**` session/resource entry points and desktop shell wiring                                                                                                 | B13 does not change `TakomiInspector`/`TakomiToolCallCard` semantics reserved for B14. On a shared web-file overlap, retain B13's resource/session entry behavior and add B14's detail behavior in separate hunks.                         |
| B14  | `apps/web/**/TakomiInspector*`, `apps/web/**/TakomiToolCallCard*`, and their focused semantic-detail tests                                                           | B14 does not rewrite B13's session/resource entry points. Resolve any shared component by preserving stable IDs and B13 launch behavior, then layer B14 details incrementally.                                                             |
| B15  | `apps/mobile/**` and mobile-only tests/assets                                                                                                                        | B15 owns no web/server implementation. Contract changes are additive and must be reconciled with B03 before use; preserve existing mobile changes byte-for-byte outside the intended hunk.                                                 |

Before an overlapping edit, the task owner records `git diff --binary a63641ba2 -- <affected paths>` outside the repository, reviews the other owner's hunk, and applies only the combined focused change. No scratch patch is committed or stored in this repository.

## B00 completion checklist

- [x] Baseline commits, clean product-tree state, expected workflow deltas, and named overlap rules recorded.
- [x] Canonical-to-isolated provenance verifier and host capability boundary complete.
- [x] Fresh canonical pack, separate extraction, isolated install, verify, and probe passed from `/tmp/takomi-b00-clean-UEAuFE` without opening a session.
- [x] Focused package verification and diff check complete.
