# Takomi Code handoff

**Updated:** 2026-10-09

**Branch:** `Takomi-Code`

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

## Branch model

- `Takomi-Code` is the live branch and the target for upstream merges. The parity branches are
  historical work branches, not migration targets.
- `feat/pi-debrand` (worktree `worktrees/pi-debrand`) — a dormant stock-flavor branch: the same
  features with visible Takomi chrome swapped for stock T3 equivalents (sidebar wordmark, tab and
  inspector labels, connection client labels, provider icons, driver comment). It exists for
  stock-build demos and the eventual upstream PR.

Rules for `feat/pi-debrand`:

1. Never merge it into `Takomi-Code` — that would strip Takomi branding from the live
   branch.
2. It is agent-owned. Rebase it onto `Takomi-Code` only when a stock build, demo, or
   the upstream PR is actually requested; treat conflicts as trivial string swaps.
3. Delete it once the upstream PR ships.
4. App identity (`productName`, `APP_BASE_NAME`, splash, package display names) is intentionally
   still Takomi-branded on that branch and must be handled separately at PR time.

`packages/contracts/src/providerIdentity.ts` keeps `PI_PROVIDER_IDENTITY` for stock Pi and
`TAKOMI_PROVIDER_IDENTITY` for the separate Takomi instance. Both use the Pi driver. Other app
branding stays in the clients and desktop identity modules.

## Current state

### Complete

- Pi/Takomi is registered as a first-party provider and runs as a structured JSON-RPC child process.
- Text, reasoning, tools, images, questions, confirmations, compaction, model switching,
  interruption, and persistent session resumption are bridged into the provider runtime.
- Project-scoped Pi slash commands, prompt templates, and skills are discovered for web and mobile
  command menus, with trust and freshness reported through provider capabilities.
- Pi session catalogs can be listed with bounded pagination and ownership diagnostics. Continuation requires a compatible v3 session file, not an exact Pi package version.
  Attaching a catalog session to a fresh, empty T3 thread (bind the live file) and forking it
  (clone into a new session file with the source as parent, then bind the fork) are supported
  through `provider.attachPiSession` / `provider.forkPiSession`. Continuing backfills visible
  CLI history (user/assistant text); importing terminal sessions any other way remains
  unavailable.
- Takomi tools retain canonical V2 work-log items and an optional web/desktop inspector.
  Todo and subagent items use the shared upstream rendering.
- Windows desktop identity and state paths are separate from upstream T3 Code.
- Repository scripts build a Windows x64 installer and a standalone arm64 Android preview APK into
  `release/`.
- Desktop, web, and mobile use the shared Takomi icon under `assets/takomi/`.

### Deliberately incomplete

- Pi permission modes use upstream\'s blocking tool hook, not an OS sandbox. Trusted extension
  code outside a tool call still follows Pi\'s trust policy. Utility text generation uses
  upstream\'s restricted Pi helper rather than the interactive suite-enabled process.
- Pi session listing follows Pi's documented storage layout; attach/fork require a v3 file.
  Continuation includes visible CLI history hydration (user/assistant text); tool-call history
  hydration and automatic terminal-session import are not implemented.
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
- Mobile names, icons, package IDs, and schemes are Takomi-specific. Expo/EAS releases remain
  gated on Takomi-owned configuration; updates are disabled without that project ID.
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
Runtime mode: supervised, auto-accept edits, or full-access
```

For suite development, set **Takomi suite root** to the VibeCode Protocol Suite checkout. Do not set
`Pi agent directory` to the suite unless it is intentionally structured as a complete Pi agent home.

## Current local release workflow

Current source versions match the merged upstream: desktop `0.0.45` and mobile `2.0.0`.
Each attempt reserves a separate output directory:

```text
release\local-<UTC-date>.<build-number>\Takomi-Code-<desktop-version>-preview.<UTC-date>.<build-number>-x64.exe
release\local-<UTC-date>.<build-number>\Takomi-Code-Preview-<mobile-version>-<sha>-<UTC-date>.<build-number>[-dirty].apk
```

The desktop preview embeds its dated version and has no auto-update feed. Source versions are not
bumped to avoid collisions.

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

1. **Mobile distribution:** configure Takomi-owned Expo/EAS, Clerk/OAuth, updates, and release signing.
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
- Do not describe Pi permission modes as a sandbox or as permission enforcement for extension startup code.
