# Local Windows builds

From a source checkout on Windows, build both local installables with:

```bash
vp run dist:local
```

Use `vp run dist:local:desktop` for only the Windows NSIS installer, or
`vp run dist:local:android` for only Android. Generated output is kept out of Git in `release/`.
See [`../../release/README.md`](../../release/README.md) for the complete versioning and release
checklist.

The Android command needs a working Android SDK, Java, and Gradle-compatible Windows setup. It
builds `Takomi Code Preview` (`com.t3tools.t3code.preview`) in a managed short-path worktree at
`C:\takomi-local-build`, with a short pnpm virtual store at `C:\tp`. These paths avoid
the React Native/CMake path-length and mixed-drive failures that affected the normal checkout. The
script overlays your tracked working-tree changes and copies root `.env` and `.env.local` when
present. The resulting arm64 APK is standalone, internal, and debug-signed for direct installation.
It is **not** Play Store uploadable.

The command refuses to touch an existing short-path directory unless its ownership marker and Git
worktree registration identify it as this checkout's managed local-build worktree.

To see the local checkout against both remotes without changing branches or merging anything:

```bash
vp run dist:local:status
```

That command fetches `upstream/main` and `origin/main`, then reports commits, desktop/mobile
versions, and ahead/behind counts.

Store production signing, remote EAS version auto-increment, fingerprint-gated OTA updates, and
store submission remain GitHub CI/EAS-only.
