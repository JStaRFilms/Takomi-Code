---
name: takomi-upstream-migration
description: Safely migrate the Takomi-Code fork onto the latest upstream T3 Code main branch with a merge, while preserving Takomi features and upstream UI/stability improvements. Use when asked to sync, merge, update, or migrate Takomi-Code from upstream/main, resolve upstream conflicts, audit a completed upstream merge, or rebuild the Windows desktop and standalone Android artifacts afterward.
---

# Takomi Upstream Migration

Run from the repository root. Preserve upstream architecture and stability fixes; reapply Takomi behavior as the narrowest provider- or brand-specific delta.

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
- Pi's version-gated, read-only session catalog and its attach/clone/import limitations;
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

## 6. Build release artifacts

Local release builds output to `release/` and are driven by repository scripts.

### Build both applications

From the repository root on Windows:

```powershell
vp run dist:local
```

### Windows x64 desktop only

```powershell
vp run dist:local:desktop
```

The desktop version comes from `apps/desktop/package.json` (currently `0.0.42`). Expected output:

```text
release\Takomi-Code-<desktop-version>-x64.exe
```

Report the warning if no WSL `node-pty` prebuild is supplied: normal Windows operation works, but the packaged WSL backend does not. If the desktop build fails while probing temporary directories, set `$env:TEMP` / `$env:TMP` / `$env:TMPDIR` to `C:\t3code-tmp` as documented in `release/README.md`.

### Standalone Android preview APK only

```powershell
vp run dist:local:android
```

The mobile version comes from `apps/mobile/app.config.ts` (currently `1.2.1`). Expected output:

```text
release\Takomi-Code-Preview-<mobile-version>-<sha>[-dirty].apk
```

Uncommitted tracked changes are included (the artifact name appends `-dirty`). The build uses the managed short worktree `C:\takomi-local-build` and `C:\tp` pnpm virtual store. The output is an internal, debug-signed preview APK and is not Play Store uploadable. If Gradle owns a locked build directory, stop the daemon cleanly via `C:\takomi-local-build\apps\mobile\android\gradlew.bat --stop`; never kill Java or Gradle processes by broad name/path matching.

## 7. Finish safely

Before reporting completion:

1. Confirm the merge base of `HEAD` and `upstream/main` is exactly `upstream/main`.
2. Confirm the working tree is clean.
3. List the merge commit and any corrective commits created afterward.
4. State focused checks and artifact paths truthfully.
5. State unresolved limitations, especially WSL packaging and Android's upstream-compatible infrastructure identity.
6. Do not push unless explicitly requested. A merge-based update uses a normal push; do not force-push for this workflow.
