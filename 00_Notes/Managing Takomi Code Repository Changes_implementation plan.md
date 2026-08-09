# Desktop Build + Full Rebrand Plan

> [!NOTE]
> This plan is archived and has been superseded. Its open questions and proposed paths describe the repository before the Takomi desktop/mobile work was completed. Use [the current handoff](../docs/features/takomi-code-handoff.md) and [build documentation](../docs/features/takomi-desktop-and-android.md) instead.

## Part 1: Building the Desktop App

The desktop app uses Electron + Vite+. Here's the build sequence:

```bash
# 1. Install dependencies (if not already done)
vp i

# 2. Build the desktop app
vp run build --filter @t3tools/desktop

# 3. Or run in dev mode
vp run dev
```

> [!IMPORTANT]
> The dev server (`vp run dev`) starts both the server and web app. The desktop app requires the web app to be built first. We should run the full dev setup to verify everything works before attempting a standalone desktop build.

---

## Part 2: Comprehensive Rebrand

### Current State

Your existing branding commit touched **26 files** — mainly desktop app identity, icons, window titles, and the web splash screen. But there are **70+ files** still referencing "T3 Code" as a product name across:

- `apps/server/` — CLI help text, service descriptions, auth pages
- `apps/web/` — UI strings, settings panels, onboarding text
- `apps/mobile/` — app config, brand marks, settings screens
- `packages/` — contracts, shared utilities, client-runtime
- `scripts/` — release tooling, Discord notifications, smoke tests

### What MUST NOT be renamed

| Reference                                 | Why                                                     |
| ----------------------------------------- | ------------------------------------------------------- |
| `@t3tools/*` package names                | npm workspace identifiers — changing breaks all imports |
| `t3.codes`, `app.t3.codes`                | Domains you don't own — they're Ping's infrastructure   |
| `npx t3@latest`                           | Published npm package — not yours                       |
| `T3CODE_HOME` env var                     | Config compatibility with upstream                      |
| `.t3` directory references                | Data dir shared with upstream                           |
| `t3 checkpoint` in git refs               | Internal git machinery                                  |
| `T3Tools.T3Code` winget ID                | Published package registry entry                        |
| `discord.gg/jn4EGJjrvv`                   | Ping's Discord server                                   |
| File/folder names like `t3ProjectFile.ts` | Breaking rename causes import chaos                     |

### What SHOULD be renamed

**User-facing strings only** — what appears in the UI, help text, and documentation:

- `"T3 Code"` → `"Takomi Code"` in user-visible text
- `"T3 Code (Alpha)"` → `"Takomi Code (Alpha)"` window titles
- CLI `--help` descriptions mentioning "T3 Code"
- HTML `<title>` tags
- Mobile app display names
- Settings panel labels and descriptions
- Error messages shown to users
- Notification text
- About/splash screen text

### Proposed Approach

> [!WARNING]
> This is NOT a safe `sed` find-and-replace job. A blind replace of "T3" will break imports, env vars, package names, and URLs. Each file needs context-aware judgment.

**I'll do this as a focused sub-task:**

1. Grep all remaining `"T3 Code"` references (the exact quoted string is safest)
2. For each file, determine if the reference is user-facing text or internal plumbing
3. Replace only user-facing strings
4. Run `vp run typecheck --filter @t3tools/desktop @t3tools/web @t3tools/server` to verify nothing is broken
5. Run affected tests
6. Commit as a single `feat(branding): complete user-facing rebrand pass`

### Estimated scope

- ~50-60 string replacements across ~70 files
- Risk: **low** if we stick to quoted string literals in UI text
- Time: ~30 minutes of careful work

## Open Questions

> [!IMPORTANT]
>
> 1. **Mobile app name**: Should `apps/mobile/app.config.ts` show "Takomi Code" as the app name? This affects what shows on the home screen.
> 2. **Do you want to build the desktop app first** (to verify it works before the rebrand), or do the rebrand first and then build?
> 3. **Test depth**: Should I run the full test suite after the rebrand, or just typecheck + targeted tests on changed files?
