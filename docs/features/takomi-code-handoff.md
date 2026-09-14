# Takomi Code handoff

**Updated:** 2026-09-08

**Branch:** `feat/pi-takomi-parity`

**Repository:** `C:\CreativeOS\01_Projects\Code\Clones\2026-07-22_t3code`

## Read this first

This is the maintained status summary for the Takomi fork. Detailed documentation:

- [Takomi / Pi provider](./takomi-pi-provider.md)
- [Takomi tool-call UI](./takomi-tool-call-ui-audit.md)
- [Desktop and Android builds](./takomi-desktop-and-android.md)
- [Provider architecture](../internals/providers.md)
- [Local release procedure](../../release/README.md)

The material under `docs/tasks/orchestrator-sessions/` is historical planning evidence, not current
implementation or release guidance.

## Current state

### Complete

- Pi/Takomi is registered as a first-party provider and runs as a structured JSON-RPC child process.
- Text, reasoning, tools, images, questions, confirmations, compaction, model switching,
  interruption, and persistent session resumption are bridged into the provider runtime.
- Project-scoped Pi slash commands, prompt templates, and skills are discovered for web and mobile
  command menus, with trust and freshness reported through provider capabilities.
- Pi session catalogs (verified releases: 0.84.4, 0.85.1) can be listed with bounded pagination and ownership diagnostics.
  Attaching a catalog session to a fresh, empty T3 thread (bind the live file) and forking it
  (clone into a new session file with the source as parent, then bind the fork) are supported
  through `provider.attachPiSession` / `provider.forkPiSession`. Continuing backfills visible
  CLI history (user/assistant text); importing terminal sessions any other way remains
  unavailable.
- Core Takomi tool calls use bounded semantic inline cards and an optional synchronized web/desktop
  inspector. Board, Todo, and subagent state persist through updates and completion.
- Windows desktop identity and state paths are separate from upstream T3 Code.
- Repository scripts build a Windows x64 installer and a standalone arm64 Android preview APK into
  `release/`.
- Desktop, web, and mobile use the shared Takomi icon under `assets/takomi/`.

### Deliberately incomplete

- Pi supports only T3's `full-access` runtime mode.
- Pi utility text generation for titles and Git/PR text is not implemented.
- Pi session listing currently requires the supported Pi catalog boundary (verified releases: 0.84.4, 0.85.1).
  Attach/fork continuation is implemented with visible CLI history hydration (user/assistant
  text); tool-call history hydration and automatic terminal-session import are not.
- Hydrated history is deliberately messages-only: tool calls stay model context because
  rendering them as visible history would look re-runnable while being frozen, for no
  model benefit (the full context, tools included, is already bound).
- Rich and multi-question UI fidelity remains partial.
- Unknown tools intentionally use generic T3 work-log cards.
- Takomi runtime extensions and skills are not bundled as an installable managed runtime with the
  desktop application. Users still need a compatible Pi/Takomi installation or a suite-root
  override.
- Mobile has no native Takomi semantic tool cards or inspector.
- Mobile does not yet expose the Pi session catalog or CLI continuation flow.
- Mobile visible names and icons are Takomi-branded, but package, scheme, Expo/EAS, update, and Clerk
  infrastructure identifiers remain upstream-compatible pending migration.
- The local Android preview APK is debug-signed and cannot be uploaded to the Play Store.
- Without a supplied Linux `node-pty` prebuild, the packaged Windows application's WSL backend is
  unavailable; the normal Windows backend still works.

## Provider configuration

Normal global installation:

```text
Binary path: pi
Pi agent directory: blank
Takomi suite root: blank
Launch arguments: blank
Runtime mode: full-access
```

For suite development, set **Takomi suite root** to the VibeCode Protocol Suite checkout. Do not set
`Pi agent directory` to the suite unless it is intentionally structured as a complete Pi agent home.

## Current local release workflow

Current source versions are desktop `0.0.40` and mobile `1.1.1`. Artifact names are generated from
those version sources and the current commit:

```text
release\Takomi-Code-0.0.40-x64.exe
release\Takomi-Code-Preview-1.1.1-<sha>[-dirty].apk
```

From the repository root on Windows, build both:

```powershell
vp run dist:local
```

Or build one target:

```powershell
vp run dist:local:desktop
vp run dist:local:android
```

The Android script owns the managed worktree `C:\takomi-local-build` and pnpm virtual store
`C:\tp`. Do not replace this workflow with a machine-local helper. See
[Desktop and Android builds](./takomi-desktop-and-android.md) for requirements and troubleshooting.

## Recommended next work

Choose one bounded objective:

1. **Mobile distribution identity:** migrate package IDs, schemes, Expo/EAS/update ownership,
   Clerk/OAuth configuration, and release signing.
2. **Pi session interoperability round 2:** richer point-split UX (forking from a message
   deeper than the preview window carries).
3. **Pi interaction fidelity:** preserve richer question descriptions, previews, and multi-select
   semantics.
4. **Portable desktop distribution:** define, package, and version a managed Pi/Takomi runtime and
   optionally supply the WSL `node-pty` prebuild.

## Verification

Use focused package checks for the area changed. For local release preparation, follow the checks in
[`release/README.md`](../../release/README.md), then install and open each artifact on a test device.

## Safety notes

- Do not copy `.git` directories between legacy Takomi and T3 repositories.
- Do not merge unrelated histories merely to connect old and new implementations.
- Do not globally replace `T3` or `t3code`; internal package names, environment variables, and
  compatibility identifiers intentionally remain.
- Do not publish through the upstream `pingdotgg` Expo/EAS project.
- Do not open the same Pi session file in terminal Pi while Takomi Code is writing it.
- Do not claim safer Pi runtime modes until permission enforcement covers every Pi tool invocation.
