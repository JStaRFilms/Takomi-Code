# B17 — Own, package, and version the Pi/Takomi environment runtime

**Role:** Coder
**Stage:** Build
**Depends on:** B00, B02, B08, B11, B12

## Objective
Establish version-controlled Takomi source ownership and make every environment-host form reproducible without destroying bring-your-own-install flexibility.

## Read first
Desktop/server packaging and updater paths, release scripts, provider maintenance contracts, Pi package/install docs, installed Takomi sources, `~/.pi/src/pi-takomi-core`, both resolved pi-subagents installations, licenses/provenance, and Windows/macOS/Linux/SSH/WSL process behavior.

## Implement
Before feature code depends on mutable external files, establish version-controlled Takomi runtime/core source, package manifests, licenses, provenance, public exports, and exact Pi/pi-subagents dependency constraints. Remove private `pi-subagents` path imports or pin and guard them behind a tested compatibility boundary until a public API exists. Record exact resolved paths, versions, and integrity because multiple installations may coexist.

Adopt a managed environment-host runtime bundle/sidecar as the supported default for desktop-hosted and standalone server environments, with exact compatibility checks and rollback. Preserve custom binary/agent-directory/suite-root overrides. Verify companion extension discovery and prevent duplicate Takomi registration. Updates require explicit user action and must not overwrite user config, models, credentials, themes, skills, prompts, or sessions. Cover local desktop, standalone `npx t3`, SSH, and WSL; runtime assets live where the environment executes.

## Tests
Manifest/license/provenance validation, private-import compatibility failure, multiple resolved pi-subagents versions, fresh environment-host install, missing binary, incompatible version/integrity, update success/failure/rollback, custom path, spaces/non-ASCII, duplicate extension, offline, Windows/macOS/Linux/SSH/WSL smoke, and no mutation of existing Pi home.

## Definition of done
A new desktop user can reach a known-compatible Takomi runtime, while advanced users can retain external installs and receive precise diagnostics.
