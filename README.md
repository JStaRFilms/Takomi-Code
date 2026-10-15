# Takomi Code

Run coding agents on your computer and work with them from a desktop app, browser, or Android phone. Takomi Code is a fork of [T3 Code](https://github.com/pingdotgg/t3code) with Takomi/Pi integration and its own stable releases.

[Download the latest stable release](https://github.com/JStaRFilms/Takomi-Code/releases/latest) · [npm package](https://www.npmjs.com/package/takomi-code) · [Documentation](./docs/)

## Install Takomi Code

| What you want            | Install                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Windows x64 desktop app  | Download `Takomi-Code-<version>-x64.exe` from the [latest release](https://github.com/JStaRFilms/Takomi-Code/releases/latest). |
| Android arm64 app        | Download `Takomi-Code-<version>-android-arm64-v8a.apk` from the same release.                                                  |
| Server with a web client | Run `npx takomi-code@latest serve` on Windows x64, Linux x64, or an Apple Silicon Mac.                                         |

These are Takomi's published builds. There is no Takomi macOS or Linux desktop download, Intel Mac server package, or iOS store release at present. Upstream T3 Code store apps and package-manager installers are separate products.

### Windows desktop

1. Download the `.exe` from the [latest stable release](https://github.com/JStaRFilms/Takomi-Code/releases/latest).
2. Run the installer, then open Takomi Code.
3. Open **Settings → Providers** and set up a coding agent on the machine where it will run.
4. Choose a project and start a thread.

The installer includes the local server and web client. You do not need to run the npm command separately to use the desktop app.

Windows installers are not yet code-signed, so SmartScreen may warn. Check that the download comes from `JStaRFilms/Takomi-Code`; each release includes `SHA256SUMS` for verifying downloads.

### Android

The Android app connects to a computer running Takomi Code. It does not run coding agents on the phone.

1. Download the stable `.apk` from the [latest release](https://github.com/JStaRFilms/Takomi-Code/releases/latest) on your phone.
2. Open the downloaded file and approve installation. Android may ask you to allow your browser to install apps.
3. Open Takomi Code and pair it with your computer using the [connection steps below](#connect-your-phone-or-another-computer).

For a stable-to-stable upgrade, install the new APK over the existing app. Do not uninstall first if you want to keep its saved data. Stable and Preview are separate apps with separate data; installing stable does not replace Preview.

### Server and browser

Install [Node.js](https://nodejs.org/) to get `npm` and `npx`, then run this on the computer that will host your projects and agents:

```sh
npx takomi-code@latest serve
```

Keep that terminal running and open the local URL it prints in your browser. `serve` does not open a browser automatically. The phone or another computer can connect to this same server.

To install the command globally instead:

```sh
npm install -g takomi-code@latest
takomi-code serve
```

For the command reference:

```sh
npx takomi-code@latest --help
```

The npm launcher selects the matching server package automatically. On an Apple Silicon Mac, use a native ARM64 Node installation, not an x64 installation under Rosetta. Self-contained server archives are also available in [GitHub Releases](https://github.com/JStaRFilms/Takomi-Code/releases/latest).

The public app command is `takomi-code`. You do not need to install the `@johnsax/takomi-code-*` platform packages yourself.

## Set up your coding agent

Takomi Code supports Takomi/Pi alongside Codex, Claude Code, Cursor, Grok Build, OpenCode, Antigravity, and Muse Code. Enable and configure providers in **Settings → Providers** on the environment where your projects live. Install and authenticate the provider there before starting a thread.

For Takomi/Pi, install [Pi](https://pi.dev) on the server machine, run `pi` once to configure its models and authentication, and keep the provider's binary path set to `pi`. Your existing Pi models, extensions, skills, and session history are used by the app. See [Takomi and Pi setup](./docs/user/providers-pi.md).

The app does not bundle the separate Takomi suite or Vault extension. Install those on the server if you use them. Desktop and web can also [continue compatible Pi CLI sessions](./docs/user/cli-continuity.md); mobile does not yet expose session discovery.

## Connect your phone or another computer

The host computer must stay running and reachable. Pairing does not move your projects or agents onto the phone.

For a desktop host, open **Settings → Connections**, enable **Network access**, and create a pairing link using an address your other device can reach. Enabling network access restarts the desktop app, so finish active work first. Scan the QR code or open the pairing link in the Android app.

For a command-line host over Tailscale, connect both devices to the same tailnet and run:

```sh
npx takomi-code@latest serve --tailscale-serve
```

In another terminal on that host, create a pairing link for the running server:

```sh
npx takomi-code@latest pair --tailscale
```

Use the same server data-directory options if you set a custom directory. Do not start a second server if one is already running. Pairing links authorize access to your host; keep them private.

See [remote access](./docs/user/remote-access.md) for LAN, Tailscale, SSH, and T3 Connect options. T3 Connect retains its upstream name.

## Update Takomi Code

### Windows desktop

The desktop app checks the fork's stable release feed. When an update is available, download it through the app, then confirm installation and restart when your work is finished. Updating can interrupt running agents and terminal commands.

Older or locally built Preview installers may have no update feed. Install the latest stable `.exe` manually once to switch to the normal stable update path.

### Android

Stable Android checks GitHub for newer stable APKs when you open or return to the app. You can also use **Settings → About Takomi Code → Check for updates**.

Choose **Download APK**, open the downloaded file, and approve installation in Android. Update detection is automatic; installation is not silent. You can always download the APK directly from the latest release.

### Command-line servers

For an `npx` server, finish active work, stop the running server, and relaunch it with your usual options:

```sh
npx takomi-code@latest serve
```

For a global npm installation, stop the server, update the package, then restart it:

```sh
npm install -g takomi-code@latest
takomi-code serve
```

Update the machine hosting the agents, not just the device you use to control it. Keep your usual host, data-directory, and Tailscale options when restarting. See [app and server updates](./docs/user/updating.md) for connected-environment controls and version compatibility.

## Documentation

- [Takomi/Pi integration](./docs/features/takomi-pi-provider.md)
- [Working with threads](./docs/user/thread-sidebar.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Remote access](./docs/user/remote-access.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Local Windows and Android builds](./docs/user/local-builds.md)
- [Architecture](./docs/internals/overview.md)

Some inherited guides still use T3 Code names and commands. Use this README's download links and npm commands to install Takomi rather than the upstream app.

## Build from source

Install [Vite+](https://viteplus.dev/guide/) and Node.js 24, then clone this fork:

```sh
git clone https://github.com/JStaRFilms/Takomi-Code.git
cd Takomi-Code
vp i
vp run dev
```

For Windows desktop and Android Preview artifacts, follow the prerequisites and build instructions in the [local release guide](./release/README.md). Local Preview builds are not the published stable installers.

Report Takomi-specific bugs in [this repository's issues](https://github.com/JStaRFilms/Takomi-Code/issues). For development conventions, read [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md).

## Credits and license

Takomi Code is maintained by [JStaRFilms](https://github.com/JStaRFilms) and builds on [T3 Code](https://github.com/pingdotgg/t3code) by T3 Tools and its contributors. Upstream architecture, compatible identifiers, and T3 Connect remain part of the project. Some internal executable and archive names still use `t3`; the npm launcher exposes `takomi-code` without replacing a separately installed `t3` command.

Licensed under the [MIT License](./LICENSE), with the upstream copyright notice retained.

<details>
<summary>Earlier Takomi projects</summary>

These experiments preceded this fork and are kept for historical reference:

- [TakomiDX](https://github.com/JStaRFilms/deprecated-TakomiDX), Next.js and agentd.
- [Takomi Code](https://github.com/JStaRFilms/deprecated-Takomi_Code), WinUI 3 and the Codex SDK.
- [Takomi Code Remastered](https://github.com/JStaRFilms/deprecated-Takomi_Code_Remastered), Electron and React.
- [Takomi Mobile](https://github.com/JStaRFilms/deprecated-Takomi_Mobile), Expo and the Pi SDK.

</details>
