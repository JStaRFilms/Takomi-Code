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
