# Takomi Code handoff

**Updated:** 2026-07-29

**Branch:** `feat/takomi-tool-call-ui`

**Repository:** `C:\CreativeOS\01_Projects\Code\Clones\2026-07-22_t3code`

## Read this first

This is the starting point for a new implementation thread. Detailed feature documentation:

- [Takomi / Pi provider](./takomi-pi-provider.md)
- [Takomi tool-call UI](./takomi-tool-call-ui-audit.md)
- [Desktop and Android builds](./takomi-desktop-and-android.md)
- [Provider architecture](../architecture/providers.md)
- [Repository management notes](../../00_Notes/Managing%20Takomi%20Code%20Repository%20Changes.md)

## Current state

### Complete and validated

- Pi/Takomi is registered as a first-party provider.
- Pi runs as a JSON-RPC child process rather than through terminal scraping.
- Text, reasoning, tools, images, questions, confirmations, compaction, model switching, interruption, and persistent sessions are bridged.
- Global Pi/Takomi discovery works with blank provider overrides.
- A Takomi suite checkout can be loaded explicitly for runtime development.
- Session startup waits for Pi's persistent session file, preventing duplicate sessions on server restart.
- Windows desktop branding is separated from upstream T3 Code.
- Electron archive extraction works on Windows without Python.
- A Windows x64 NSIS installer was built successfully.
- A standalone ARM64 Android APK was built successfully with an embedded JavaScript bundle.
- Core Takomi tool calls use bounded semantic inline cards with a synchronized optional inspector.
- Takomi Board state, subagent transcripts, child selection, and completion history persist in place.
- Main-agent and subagent thinking traces are presented when emitted by the model.
- Single subagents render directly; parallel, chain, and async executions remain distinguishable.
- Todo companion state collapses into one persistent progress card.
- Suite mode preserves globally installed Pi companion extensions without duplicate Takomi registration.

### Deliberately incomplete

- Pi supports only `full-access` T3 runtime mode.
- Pi utility text generation is not implemented.
- Terminal-created Pi sessions are not imported into T3 automatically.
- Rich/multi-question UI fidelity is partial.
- Unknown tools intentionally use generic T3 work-log cards.
- Pi/Takomi slash-command and live model/thinking-level discovery are deferred.
- Takomi runtime extensions/skills are not bundled into the desktop installer.
- Desktop, web, and mobile use the shared Takomi icon under `assets/takomi/`.
- Mobile visible names and icons are Takomi-branded, but package/scheme and Expo/EAS/Clerk infrastructure identifiers remain upstream-compatible until migration.
- The Android APK uses a local debug signing key.
- The packaged Windows WSL backend lacks a bundled Linux `node-pty` prebuild.

## Important commits

```text
63e3c96be feat(provider): add Pi/Takomi provider driver
f958d26da feat(web): register Pi/Takomi provider in frontend
0ae1acdc7 feat(provider): add Takomi suite support and rewrite Pi adapter
aed343097 fix(provider): fix RPC response ordering and validate session startup
928c17cbf feat(web): add Takomi tool call surfaces
c9f4bfba8 fix(provider): preserve Pi package extensions in suite mode
5a151963f fix(web): organize parallel subagent transcripts
deb31b173 feat(web): surface Takomi thinking traces
c004aa256 fix(web): flatten single agents and persist todos
d74b8f623 feat(branding): rebrand product from T3 Code to Takomi Code
06732a298 docs: add Takomi fork header and Old Tries section linking previous experiments
1b7f56e55 docs: update Old Tries links to deprecated repo names
73db0b6cb docs: add notes for managing repository changes and implementation plan
```

Use `git log --oneline --decorate -12` to account for newer commits after this handoff.

## Provider configuration

Normal global installation:

```text
Binary path: pi
Pi agent directory: blank
Takomi suite root: blank
Launch arguments: blank
Runtime mode: full-access
```

Takomi development suite:

```text
C:\CreativeOS\01_Projects\Code\Personal_Stuff\2025-12-02_VibeCode-Protocol-Suite
```

Set that path only as **Takomi suite root** when testing suite source directly.

## Build artifacts on the current machine

Desktop installer:

```text
release\Takomi-Code-0.0.30-x64.exe
```

Standalone Android APK:

```text
C:\Users\johno\Desktop\Takomi-T3-Code-Standalone.apk
```

Android build workspace and virtual store:

```text
C:\ta
C:\tp
```

Android helper:

```text
C:\Users\johno\Desktop\Build Takomi Android Standalone.cmd
```

The Android helper is machine-local and not currently versioned in this repository. Its procedure is documented in [Desktop and Android builds](./takomi-desktop-and-android.md).

## Recommended next work

Choose one bounded objective rather than attempting all items at once.

### Option A: Detach mobile distribution identity

1. Replace upstream Expo owner/project/update configuration.
2. Change mobile schemes and Android/iOS package IDs after migration planning.
3. Configure Takomi-owned Clerk/relying-party infrastructure.
4. Produce release signing credentials.
5. Rebuild and verify local pairing and Pi provider selection on a real phone.

### Option B: Pi interaction fidelity

1. Implement live Pi model and thinking-level discovery.
2. Add composer and role-routing controls for discovered options.
3. Improve question metadata, previews, and multi-select handling.
4. Add Pi/Takomi slash-command discovery and command-menu integration.

### Option C: Portable desktop distribution

1. Bundle versioned Takomi extensions/skills into desktop resources.
2. Define global-versus-bundled runtime precedence.
3. Include or document Pi installation.
4. Bundle the WSL `node-pty` prebuild if WSL support is required.
5. Sign the Windows installer.

## Verification commands

Provider/contracts/server/web:

```powershell
pnpm --filter @t3tools/contracts test
pnpm --filter t3 test
pnpm --filter @t3tools/contracts typecheck
pnpm --filter t3 typecheck
pnpm --filter @t3tools/web typecheck
pnpm --filter @t3tools/web build
```

Desktop:

```powershell
pnpm --filter @t3tools/desktop typecheck
pnpm --filter @t3tools/scripts typecheck
pnpm dev:desktop
pnpm dist:desktop:win:x64
```

Android standalone:

```powershell
& "$env:USERPROFILE\Desktop\Build Takomi Android Standalone.cmd"
```

## Safety notes

- Do not copy `.git` directories between legacy Takomi and T3 repositories.
- Do not merge unrelated histories merely to connect old and new implementations.
- Do not globally replace `T3` or `t3code`; many internal package names, environment variables, and compatibility identifiers should remain.
- Do not publish using the upstream `pingdotgg` Expo/EAS project.
- Do not open the same Pi session file in terminal Pi while Takomi Code is writing it.
- Do not claim safer Pi runtime modes until permission enforcement exists.
