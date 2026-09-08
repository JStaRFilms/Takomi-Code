# Takomi Pi Host

`takomi-pi-host` verifies a packed Takomi runtime and its isolated installation before it loads private `pi-subagents` modules through Pi's public extension loader. Its `catalog` request is read-only: it discovers bounded Pi session metadata without opening a session or mutating Pi userdata. It does not create a Pi session.

## One-time isolated runtime pipeline

Run this from a disposable directory. Set `host_cli` to the packaged `takomi-pi-host` executable; while developing this repository, use `node packages/takomi-pi-host/bin.mjs`.

```sh
canonical='C:/CreativeOS/01_Projects/Code/Personal_Stuff/2025-12-02_VibeCode-Protocol-Suite'
host_cli='node packages/takomi-pi-host/bin.mjs'
run="$(mktemp -d)"
mkdir -p "$run/artifacts" "$run/extracted" "$run/isolated"

npm --prefix "$canonical" pack --ignore-scripts --pack-destination "$run/artifacts"
artifact="$(find "$run/artifacts" -maxdepth 1 -name '*.tgz' -print -quit)"
tar -xzf "$artifact" -C "$run/extracted"

printf '%s\n' '{"private":true}' > "$run/isolated/package.json"
npm --prefix "$run/isolated" install --ignore-scripts --no-package-lock \
  "$artifact" '@earendil-works/pi-coding-agent@0.84.4'

$host_cli verify "$canonical" "$artifact" "$run/extracted/package" \
  "$run/isolated/node_modules/takomi" --manifest "$run/takomi-runtime-manifest.json"
$host_cli probe "$run/isolated/node_modules/takomi" "$run/takomi-runtime-manifest.json"
```

The commands only write the disposable `run` directory: `npm pack` is script-free and writes the artifact outside canonical source, and the dependency installation is prefix-scoped with scripts and lockfile writes disabled. They neither install globally nor target `~/.pi`. The final `probe` verifies the manifest and reports `session: "not-opened"`. Its host-local diagnostics bind the Takomi runtime, Pi, and pi-subagents to each selected resolved path, exact version, and package.json SHA-256; these filesystem paths are never part of a client contract.

## Catalog limitation

Pi 0.84.4 exposes `SessionManager.list()`, but that public method loads every session before returning and therefore cannot safely back a remote paginated picker. For verified Pi 0.84.4 only, the host applies the documented storage precedence (`--session-dir` before `--`, then `PI_CODING_AGENT_SESSION_DIR`, then `sessionDir` in Pi settings, then the encoded default directory) and reads bounded JSONL prefixes. It never imports private Pi modules or opens a `SessionManager`, because opening a legacy session can migrate it.

The scanner has an explicit 2,000-file ceiling, bounded filename/record/file-prefix sizes, bounded read concurrency, abort-aware I/O, and descriptor identity checks. The server snapshots those internal results and exposes only random, expiring environment/provider/project/workspace/generation-bound handles. `hardCapped` is distinct from `nextPageAvailable`; metadata truncation is distinct from pagination.
