# Takomi Pi Host

`takomi-pi-host` is intentionally probe-only. It verifies a packed Takomi runtime and its isolated installation before it loads private `pi-subagents` modules through Pi's public extension loader. It does not create a Pi session.

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

The commands only write the disposable `run` directory: `npm pack` is script-free and writes the artifact outside canonical source, and the dependency installation is prefix-scoped with scripts and lockfile writes disabled. They neither install globally nor target `~/.pi`. The final `probe` verifies the manifest and reports `session: "not-opened"`.
