# Updating Takomi Code

The app you use and the server running your agents can be on different machines.
When a server is behind your web or desktop app, an update notice appears in the
conversation and **Settings → Connections**. Update the machine named in that
notice.

## Takomi desktop updates

Takomi desktop uses stable releases only. Saved Nightly preferences are treated as
Stable, and Settings shows the stable update track without a channel selector.
Connected upstream servers and hosted T3 Code clients can still use their own
Nightly channels. Upstream mobile beta links are not guidance for Takomi desktop;
compatibility with the store apps has not been verified.

## Update everything at once

The update button at the bottom of the sidebar updates supported providers first,
then eligible servers, then the desktop app you are using. Identified Takomi servers
use Takomi releases and the `takomi-code` npm package. Background services stay on
their current release channel. Remote desktop apps use their own update feed.

A Takomi client version is not a T3 release target. The web and desktop bulk updater
leaves T3 hosts manual until a compatible target from that distribution is known.
Older hosts without distribution metadata also require a manual update. The app
never converts a connected host to another distribution.

While it runs, the button widens to show progress. It names a machine that is
taking longer than usual, and offers **Retry** for a server that failed. Click
it to see every machine. The desktop app restarts once each server has started
its own restart, after a short countdown. Choose **Later** to keep working and
restart from the update button when you are ready. A server still restarting
finishes on its own, and the button keeps showing it after the desktop app
restarts.

Server updates appear only after that version is published to npm. Remote
desktop apps do not wait for npm. The confirmation lists each machine it skips
and why, such as a machine that is offline or needs a manual update. Use the
notice or **Settings → Connections** for those.

If a desktop app restarts on its old version, T3 Code tells you the update did
not apply. It does not install that version again on its own, even when another
device asks. Use the update button on that machine to retry.

The confirmation counts the running threads that the restarts will interrupt,
and how many can resume afterwards. See **Continue threads after restarts**
below.

## Before you update

Server updates restart the connection and can interrupt active agents and
terminal commands. Saved threads, settings, and project files remain.

**Settings → General → Continue threads after restarts** is on by default.
It resumes supported active threads after an update, crash, or machine
restart. Changes are saved to connected environments that support this setting;
update older servers first. If a supported environment was offline or has a
different value, use **Apply to all** in Settings after it connects.
T3 Code must start again on that machine;
the setting does not enable automatic startup. Terminal commands may still be
interrupted, and threads without saved provider resume state need a new message.
A thread that finished its turn to wait on a monitor, subagent, or background task
is woken and told that this work stopped. A background shell, such as a dev server,
does not wake it; the thread learns about it with your next message.
A thread is not resumed while it waits for your approval, answer, or secret, or
while it is archived, snoozed, or settled. After three automatic resumes in a row,
the thread waits for your next message.

Updates from the previous orchestration system preserve conversation transcripts but cannot carry
every kind of runtime history forward. Read [Threads from older T3 Code versions](./thread-migration.md)
before continuing an important older thread.

## When versions don't match

A client and server must speak the same orchestration protocol. If they do not, the connection is
refused rather than running half-upgraded:

- An app newer than the server is blocked before connecting, with a notice telling you to update
  T3 Code on the machine named in the notice.
- A server newer than your app refuses the connection with an update message.

Update the side the notice names, then reconnect.

## Update a connected server

The offered action depends on how the server runs:

| Action                     | What to do                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Update server**          | Keep the client open while it installs and reconnects. Supported background services update remotely. For a desktop-hosted server, this also closes and relaunches the desktop app on the host. |
| **Update the desktop app** | Update the desktop app on the machine running the server, then reopen it if needed.                                                                                                             |
| **Copy update command**    | Run the command on the named host to update the detected global npm install, then restart the server with your usual options.                                                                   |
| **Copy relaunch command**  | Stop the command-line server on its host and relaunch with the copied command, keeping your usual subcommand and options. This does not update an installed server command.                     |

For a Takomi host with the installed command, run:

```sh
takomi-code update <takomi-version>
```

Use a version published by Takomi, not a version copied from a T3 client.
The command asks before restarting a background service. If you decline,
run `takomi-code service restart` when ready. For a server started by hand,
stop it and relaunch it with the same options, including `--host`, data-directory,
and `--tailscale-serve` options.

An `npx` host can relaunch with `npx takomi-code@<takomi-version>` and the same
subcommand and options. A detected global installation needs the offered
`npm install --global --prefix ... takomi-code@<takomi-version>` command first.
Keep T3 hosts on their own `t3` command, npm package, release channel, and releases.
If the app cannot identify a host, check its installation on that machine rather
than guessing a package from its label or version.

## If an update fails

Keep the client open until it reconnects or reports a failure. A failed service
update can roll back to the previous version. If the update still fails:

1. Retry the offered action once.
2. Check that you updated the server's machine, not only the device you are using.
3. For a command-line server, stop it and relaunch the exact version shown in the notice.

Only one server can use a T3 home directory at a time. If startup reports that
another server owns it, stop that server before retrying, or use a separate home
directory and pair with the running server.

## Update providers

**Settings → Providers** shows provider updates for the selected environment.
**Update all** updates every outdated provider on every connected environment
at once. Hover it to see which providers it will update. Providers that only
offer a manual update command are not included.

## Mobile updates

To update an environment from your phone, open **Settings → Environments** and
select it. **Check for updates** finds the latest release in that identified
environment's own distribution and current release channel. Unknown older hosts
show manual guidance instead of querying a guessed release feed. Keep the app open while the environment updates and
reconnects. Hosts that cannot update remotely show instructions for updating on
the machine instead.

The same page lets you refresh provider status and update supported providers.
These controls require a connected environment and permission to operate it.
Provider update checks and restart continuation preferences are in
**Settings → Maintenance**. If provider update checks are disabled, enable them
there before refreshing to find newer versions. The same setting controls whether
T3 Code downloads model catalog updates, so with it off new models may not appear
until you enable it and refresh provider status.

### Takomi Android APKs

The stable Takomi Android app checks for newer APKs when it opens and when you return to it.
You can also check in **Settings → About Takomi Code → Check for updates**. Only releases with
an Android APK are offered; release0.1.1 has none. **Later** keeps that version's automatic notice
quiet until the app next launches. A manual check can offer it again.

Choose **Download APK** to open the download in your browser. Once it downloads, open the APK
and confirm installation in Android. If asked, allow your browser to install unknown apps.
The app does not install silently or report download completion. If a check or browser launch
fails, retry from About Takomi Code.

Stable and preview use different Android packages and keep separate app data. A preview cannot
upgrade to stable in place. Keep it installed if you need its saved connections; stable installs
alongside it. Stable upgrades require the same release signing key.

### Other mobile builds

Install App Store or Google Play releases as usual. Builds with Expo updates enabled can also
download updates in the background and apply them when you next leave the app.
It saves drafts and queued messages before restarting. If you keep the app open
for a long time, it may ask to install immediately; choosing **Later** leaves the
update queued for the next suitable moment.
