---
name: takomi-upstream-migration
description: Safely migrate the Takomi-Code fork onto the latest upstream T3 Code main branch with a merge, while preserving Takomi features and upstream UI/stability improvements. Use when asked to sync, merge, update, or migrate Takomi-Code from upstream/main, resolve upstream conflicts, audit a completed upstream merge, or rebuild the Windows desktop and standalone Android artifacts afterward.
---

# Takomi Upstream Migration

Run from the repository root. Preserve upstream architecture and stability fixes; reapply Takomi behavior as the narrowest provider- or brand-specific delta.

## Branch model (read first)

- `Takomi-Code` — the live branch; upstream merges target it. Confirm this branch is checked out before making changes. The parity branches are historical work branches, not migration targets.
- `feat/pi-debrand` (worktree `worktrees/pi-debrand`) — dormant stock-flavor branch for stock demos and the eventual upstream PR. Never merge it into `Takomi-Code`; never rebase it as part of a migration. If it has drifted and the user asks for a stock build or the upstream PR, rebase it onto `Takomi-Code` at that point only (its delta is intentional string swaps; resolve conflicts accordingly), then delete it after the PR ships.
- `PI_PROVIDER_IDENTITY` in `packages/contracts/src/providerIdentity.ts` owns the Pi display name (`"Takomi"` on the live branch, `"Pi"` on `feat/pi-debrand`). See `docs/features/takomi-code-handoff.md` for the full branch rules.

## 1. Establish a recoverable starting point

1. Inspect `git status --short --branch`, remotes, current HEAD, and `upstream/main`.
2. If tracked changes exist, stop and ask how to preserve them. Do not stash, discard, or mix them into the migration without approval.
3. Create a timestamped backup branch before fetching or merging:

   ```bash
   git branch backup/takomi-before-upstream-merge-YYYYMMDD-HHMMSS HEAD
   ```

4. Record the original HEAD and backup ref in the final report.
5. Fetch without modifying the working tree:

   ```bash
   git fetch upstream main --tags
   ```

Never rewrite or delete the backup during the migration.

## 2. Merge deliberately

Start:

```bash
git merge upstream/main
```

For each conflict:

1. Read the full conflicting file, its current Takomi version, its upstream version, related types, and focused tests.
2. During a merge, `ours` is the current Takomi branch and `theirs` is `upstream/main`. Do not resolve by label alone.
3. Preserve upstream refactors, UI changes, data migrations, lifecycle behavior, and stability fixes.
4. Preserve the Takomi intent where it remains compatible: Pi provider support, Takomi tool presentation, visible branding, separate desktop identity/state paths, and documented local Android behavior.
5. When both sides implement the same goal, prefer upstream's implementation and delete the obsolete Takomi workaround.
6. When behavior genuinely differs, scope the exception to Pi/Takomi where possible. Do not silently override every provider or client.
7. Stop and ask the user about ambiguous product choices instead of guessing.
8. Stage only resolved files, run `git diff --check`, then finish without opening an editor:

   ```bash
   git -c core.editor=true merge --continue
   ```

Repeat until `git status` reports no merge in progress.

## 3. Audit the result against the backup

Do not treat a successful merge or compile as proof that behavior was preserved.

Run:

```bash
git log --left-right --cherry-pick --oneline \
  backup/takomi-before-upstream-merge-<timestamp>...HEAD
git diff --stat upstream/main...HEAD
git diff --name-status upstream/main...HEAD
git diff --check
git grep -n -E '<<<<<<<|=======|>>>>>>>' -- ':!pnpm-lock.yaml'
```

Review the backup comparison for missing Takomi commits and unexpected changes. Inspect the merge commit and every conflict resolution; confirm that upstream changes and the intended Takomi behavior both survived.

Pay special attention to:

- desktop environment/state paths and application identity;
- right-panel kinds and upstream UI replacements;
- timeline folding and rendering behavior;
- provider runtime ingestion and generic provider semantics;
- Pi driver environment requirements and Effect/Schema API changes;
- mobile package IDs, schemes, Expo updates, Clerk configuration, and signing;
- Pi's read-only session catalog, installed-package verification, v3 session-format compatibility, effective provider-instance enabled state, and attach/clone/import limitations (do not restore an exact package-version allowlist);
- documentation links, versions, artifact names, branch names, and stale commit hashes.

If Takomi behavior overrides upstream globally, either narrow it to Takomi/Pi or present the user with the tradeoff.

## 4. Verify proportionally

Do not run repository-wide checks by default.

1. Run typechecks only for touched packages.
2. Run focused tests for changed behavior and conflict resolutions.
3. Use `git diff --check` and inspect the final diff.
4. Do not launch browsers or dev servers without permission.
5. Build artifacts only after the source audit is complete.

Typical package checks:

```bash
vp run --filter @t3tools/web typecheck
vp run --filter t3 typecheck
vp run --filter @t3tools/desktop typecheck
vp run --filter @t3tools/mobile typecheck
vp test run <focused-test-files>
```

## 5. Keep documentation synchronized

Audit every Takomi-modified document against current source. Check relative links, referenced files, package versions, artifact names, commands, limitations, and completed/deferred feature claims.

Treat raw conversation transcripts and old implementation plans as historical. Mark them archived and point readers to maintained documentation rather than rewriting history as current guidance.

Canonical maintained files include:

- `README.md`
- `release/README.md`
- `docs/README.md`
- `docs/internals/providers.md`
- `docs/features/takomi-code-handoff.md`
- `docs/features/takomi-pi-provider.md`
- `docs/features/takomi-tool-call-ui-audit.md`
- `docs/features/takomi-desktop-and-android.md`

## 6. Give the built web/server test commands

After the source audit, tell the user how to test the merged code without the dev runner. From the repository root, use the server's `build` task, not `build:bundle` on its own. The `build` task depends on the web build, packs the server, and copies the current web assets into `apps/server/dist/client`:

```powershell
vp run --filter t3 build
node apps/server/dist/bin.mjs serve --base-dir .t3/production-test
```

Open the local URL or pairing link printed by `serve` yourself. `serve` runs headless and does not open a browser; leave the terminal open and stop it with Ctrl+C. The explicit data directory keeps this test server away from `~/.t3/userdata` and the checkout's existing `.t3` state. Check that the directory is not already in use before starting it. Do not start a server, open a browser, or mutate live state on the user's behalf without permission. Include these commands in the final report even when no build or server was run, and say which checks and artifacts actually exist.

For a dedicated Mac host, build with the same `vp run --filter t3 build`, then run `node apps/server/dist/bin.mjs serve --tailscale-serve --no-browser` with the host's intended data directory. The machine-local `release/mac-server.md` runbook, when present, describes Mac pairing; it is ignored by Git and may not exist in other clones. Tailscale hosting and pairing are separate from local web testing; never add `--tailscale-serve` to a local test by default. The root CLI without `serve` opens a browser by default, so the launch commands are not interchangeable in presentation or data-directory effects.

## 7. Build release artifacts

Each local release build reserves a unique `release/local-<UTC-date>.<build-number>/` directory through repository scripts. Separate target commands reserve separate directories; use `vp run dist:local` for both artifacts in one attempt. Do not bump source versions merely to avoid output collisions. Desktop previews embed a dated preview version and have no auto-update feed. These are optional for a merge unless the user requests artifacts. They do not replace the built web/server test commands above.

### Build both applications

From the repository root on Windows:

```powershell
vp run dist:local
```

### Windows x64 desktop only

```powershell
vp run dist:local:desktop
```

Read the desktop version from `apps/desktop/package.json` at build time. Expected output:

```text
release\local-<UTC-date>.<build-number>\Takomi-Code-<desktop-version>-preview.<UTC-date>.<build-number>-x64.exe
```

Report the warning if no WSL `node-pty` prebuild is supplied: normal Windows operation works, but the packaged WSL backend does not. If the desktop build fails while probing temporary directories, set `$env:TEMP` / `$env:TMP` / `$env:TMPDIR` to `C:\t3code-tmp` as documented in `release/README.md`.

### Standalone Android preview APK only

```powershell
vp run dist:local:android
```

Read the mobile version from `apps/mobile/app.config.ts` at build time. Expected output:

```text
release\local-<UTC-date>.<build-number>\Takomi-Code-Preview-<mobile-version>-<sha>-<UTC-date>.<build-number>[-dirty].apk
```

Uncommitted tracked changes are included (the artifact name appends `-dirty`). The build uses the managed worktree `C:\takomi-local-build` and `C:\tp` pnpm virtual store. It resets and cleans that worktree: inspect its status and preserve any needed work before building. Consult `scripts/local-build.ts` and `release/README.md` for current Windows native-build path handling; do not infer clean-source reproducibility from an earlier one-off APK. The output is an internal, debug-signed preview APK and is not Play Store uploadable. If Gradle owns a locked build directory, stop the daemon cleanly via `C:\takomi-local-build\apps\mobile\android\gradlew.bat --stop`; never kill Java or Gradle processes by broad name/path matching.

## 8. Finish safely

Before reporting completion:

1. Confirm the merge base of `HEAD` and `upstream/main` is exactly `upstream/main`.
2. Confirm the working tree is clean.
3. List the merge commit and any corrective commits created afterward.
4. State focused checks and artifact paths truthfully. Give the built web/server build and launch commands from step 6, and distinguish those from any release build commands actually run.
5. State unresolved limitations, especially WSL packaging and Android's upstream-compatible infrastructure identity.
6. Do not push unless explicitly requested. A merge-based update uses a normal push; do not force-push for this workflow.
