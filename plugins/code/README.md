# Code — Spck Editor for Noxs

**Code** is a Noxs plugin that gives your terminal a `code` command. Run it from
**any path** to open files for editing inside [Spck Editor](https://spck.io) — a
fast, full-featured code editor with syntax highlighting, git integration and a
language server, available as a mobile app or directly in your browser.

Under the hood the plugin ships the official
[Spck CLI](https://www.npmjs.com/package/spck) (`npm install -g spck`) and starts
it rooted at the directory of the file you want to edit. Spck Editor then
connects to your device over a secure WebSocket and can open, edit and save any
file inside that directory.

## Quick start

```bash
# 1. Install the plugin (Noxs Plugin Store)
nx plug install code

# 2. Open a file from any path
code ~/projects/myapp/main.py

# or a whole directory
code ~/projects/myapp

# 3. Follow the first-run prompts (Spck sign-in), then open Spck Editor
#    on your device (app or https://spck.io) and connect to this Noxs
#    environment.
```

## Command reference

| Command | Description |
|---------|-------------|
| `code [path]` | Serve `path` (a file or a directory) to Spck Editor. Without an argument the current directory is served. |
| `code --help` | Show the full usage text. |

Any options placed **after** the path are forwarded to the Spck CLI, for
example `code . -p 8080` to change the port or `code . --no-language-server`
to disable the remote language server.

## What happens on first run

1. **Node.js and npm** — if the environment does not have them yet, the plugin
   installs them from the Debian repositories (`apt-get install nodejs npm`).
   Debian 12 ships Node 18.x, which satisfies the Spck CLI requirement of
   Node >= 18.
2. **Spck CLI** — installed globally with `npm install -g spck`, so the same
   installation is reused by every later run.
3. **Sign-in** — the Spck CLI uses Firebase authentication. The first run
   starts in your terminal (not in the background) so you can complete the
   sign-in prompts. A free Spck account works (30 minutes per day); a Premium
   subscription removes the limit.
4. **Connect** — open the Spck Editor app (Android/iOS) or
   [spck.io](https://spck.io) in a browser, sign in with the same account and
   connect to this device. The served directory appears as a remote project.

## Requirements

- Noxs **0.12.0 or newer** (the plugin uses the guest command integration
  introduced in 0.12.0).
- Network access for the one-time `apt` / `npm` installation and for the Spck
  pairing service.
- A free [Spck Editor](https://spck.io) account.
- Recommended: `git` (2.20+) for the git integration and `ripgrep` for fast
  file search — both are optional; the Spck CLI degrades gracefully without
  them.

## Permissions

| Permission | Why it is needed |
|------------|------------------|
| `ui` | The plugin can show its quick-start window from the Plugin Store. |
| `terminal` | The `code` command runs in your shell and can install the Node.js, npm and Spck CLI prerequisites. |
| `network` | Installing the Spck CLI and pairing with Spck Editor require network access. |

The `code` script never reads files on its own — file access happens inside
your Spck Editor session, scoped to the directory you served.

## Security notes

- The `code` command is installed into the guest environment by the Noxs
  Plugin Manager and carries a Noxs ownership marker; uninstalling the plugin
  removes it again.
- Only directories you explicitly serve are reachable from Spck Editor, and
  the connection is authenticated with your Spck account credentials.
- The plugin runs entirely inside your Noxs Linux environment. It never
  touches Android storage outside the environment.

## Troubleshooting

- **`npm: command not found` after install** — the apt installation step may
  have been interrupted. Run `sudo apt-get install -y nodejs npm` and retry.
- **Sign-in page does not open** — the CLI prints a URL; copy it into any
  browser, sign in and return to the terminal.
- **Editor cannot connect** — make sure `spck` is still running in the Noxs
  terminal and that you signed in with the same account on both sides.
  `spck --logout` resets credentials.
- **Free account time limit** — the free tier allows 30 minutes per day;
  sessions beyond that require Spck Premium.
