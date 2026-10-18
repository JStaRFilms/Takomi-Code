# Takomi and Pi

Takomi Code's default Takomi provider runs your installed Pi coding agent. It uses Pi's models,
auth, extensions, skills, context files, and native session history. Takomi and stock Pi are
separate provider instances, `takomi` and `pi`, using the same Pi RPC driver. The blue-green T
identifies Takomi; Pi keeps its own icon. Keep the binary path as `pi`: the `takomi` command
launches an interactive harness, not Pi's RPC mode.

## Set up Pi

1. Install [Pi](https://pi.dev) on the machine running the Takomi Code server. Compatibility
   checks use the installed package and its session format, not an exact-version allowlist.
   Continuing a CLI session requires a supported v3 session file.
2. Run Pi once in a terminal and finish the provider login or API-key setup you normally use.
3. Takomi Code enables Takomi by default, including in existing environments after upgrading.
   Stock Pi remains a separate, optional provider. Use Add provider → Takomi to add another
   Takomi instance if you previously removed the default; disabled or removed instances stay that
   way on later restarts. Keep the existing `pi` instance if you want both available.

For an npm installation, use:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

If `pi` is not on the server's `PATH`, set Pi's binary path to the executable. Provider environment
variables and launch arguments are also available for installations that need a custom agent
directory, endpoint, or model configuration. `--provider` must be paired with `--model`. Takomi Code
rejects launch arguments that change Pi's execution mode or select a session because Takomi Code owns those
parts of the process lifecycle.

On a remote or headless server, connect to that machine over SSH and run `pi`, then `/login`.
Open the authorization URL on your own computer. If the callback cannot reach the server,
paste the final redirect URL or authorization code back into Pi when prompted. You can also
set your model provider's API-key environment variable in the Pi instance's settings; mark
secret values as sensitive.

Update installer-managed Pi with `pi update`. If another package manager owns the installation,
update it through that manager instead. For example, a Nix profile installation uses
`nix profile upgrade pi`.

## What carries over

Takomi Code discovers the models reported by Pi and exposes their supported thinking levels. The
thinking picker marks the discovered active model's configured level as its default without
overriding it. Other models keep their Pi defaults when no level is selected. Threads
use Pi's native session files for resume, rollback, and forks within the same Pi instance. Forks
preserve the native conversation through the selected turn in the destination workspace.
Switching providers uses portable conversation context. Extension
dialogs appear in the Takomi Code composer, and the composer context meter follows Pi's own usage
reporting while a response streams and after it settles.

Pi skills appear in the composer's `$` menu. This includes user skills and project skills that Pi
loads for the current workspace; selecting one uses Pi's native skill expansion.

Pi loads its normal user and project extensions. Blocking `select`, `confirm`, `input`, and `editor`
dialogs work in Takomi Code. Notifications appear in the work log. Pi terminal decoration such as
titles, status lines, and widgets does not have a Takomi Code equivalent.

The server's `--base-dir` isolates Takomi Code's app database, not Pi. Unless you explicitly
configure another Pi agent directory, provider instances share the same Pi settings, credentials,
sessions, and extensions. The Takomi Vault extension also stores its data under your OS user's
`~/.pi/agent/takomi-vault` directory, so a second Pi instance or a test server does not isolate
Vault credentials. Private input uses a separate one-use response path owned by the live
Pi request, not an ordinary chat answer. The input and export paths still lack a live
browser-to-Pi verification. Use disposable values for testing; do not enter or export real
Vault secrets in the app until that check passes.

## Permission modes

Takomi Code applies the composer permission mode through Pi's blocking tool hook:

- **Supervised** asks before commands, file changes, and extension tools. Read-only tools continue.
- **Auto-accept edits** allows Pi's edit and write tools, but asks before commands and extension
  tools.
- **Full access** allows tools without T3 Code approval prompts.

The **Auto** option is not shown for Pi because Pi does not expose an AI approval reviewer.
Threads that already stored Auto before Pi support was added behave and display as Supervised.

Changing the mode restarts the Pi provider session and resumes the same native conversation. The
policy covers Pi tool calls; it is not an operating-system sandbox, and code that a trusted Pi
extension runs outside a tool call remains governed by Pi's own extension trust model.

Takomi Code's `delegate_task` tool creates durable child threads in the shared subagent UI. If the user
installs Pi's example `subagent` extension, T3 Code also shows its task progress and results in that
UI. Pi runs those children without a session, so they cannot be opened or resumed as Takomi Code
threads.

## Troubleshooting

- If Pi is unavailable, confirm that the configured binary runs on the server machine, then refresh
  the provider in Settings.
- If no models appear, open Pi directly and confirm its authentication and model configuration.
- If discovery cannot complete, Takomi Code keeps Pi available with the `Pi default` model. Start a
  thread to let the interactive Pi session handle any startup prompt.
- If a project extension is missing, approve the project in Pi, then start a fresh provider session.
- If a project skill is missing from the `$` menu, approve the project in Pi and refresh the provider.
- The context meter appears once Pi reports usage for the thread. Some model providers only
  report usage when a response completes, so the meter can wait for the first reply.
