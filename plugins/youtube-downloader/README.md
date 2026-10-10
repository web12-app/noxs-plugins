# YouTube Downloader for Noxs

**YouTube Downloader** is a Noxs plugin that saves a single YouTube video as a
video file (MP4, MKV or WebM) or as audio (MP3, M4A or Opus). It runs
[yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://ffmpeg.org)
inside your Noxs Linux environment, so the files land in a folder of your
choice in that environment's home directory.

> **Only download content you own or are authorized to download.** This plugin
> does not bypass DRM, paywalls, logins, age gates or any other access control.
> It does not read cookies or browser sessions.

## Install

After the first release is published, install it from the Noxs Plugin Store
(sidebar → **Plugins** → search **YouTube Downloader** → **Install**) or from a
terminal:

```sh
nx plug install youtube-downloader
```

The plugin window opens when it is activated. Required tools can be installed
from inside the window (see [Install the tools](#install-the-tools)). From
version 0.2.0 the install also adds a `yt` command to the Noxs shell — see
[Run it from the shell](#run-it-from-the-shell--the-yt-command).

## Run it from the shell — the `yt` command

Installing the plugin (0.2.0 or newer) also installs a `yt` command into the
Noxs shell, so you can download straight from any terminal session without
opening the plugin window:

```sh
yt https://youtu.be/VIDEO_ID                 # best MP4 video
yt -a https://youtu.be/VIDEO_ID              # best MP3 audio
yt -a -f opus -q 192 https://youtu.be/VIDEO_ID
yt -q 720 -f mkv https://youtu.be/VIDEO_ID
yt -d '~/Music/YouTube' -a https://youtu.be/VIDEO_ID
yt -l https://youtu.be/VIDEO_ID              # list the available streams
yt --help
```

Options mirror the plugin window:

| Option | Values | Default |
| --- | --- | --- |
| `-a`, `--audio` | switch to audio mode | video mode |
| `-f`, `--format` | video: `mp4` `mkv` `webm` — audio: `mp3` `m4a` `opus` | `mp4` / `mp3` |
| `-q`, `--quality` | video: `best` `1080` `720` `480` `360` — audio: `best` `320` `192` `128` | `best` |
| `-d`, `--dest` | a folder inside your home directory | `~/Downloads/YouTube` |
| `-l`, `--list` | list the streams yt-dlp sees for the link, then exit | |
| `-V`, `--version` | print the yt-dlp version | |

The same safety rules as the window apply: only YouTube links, single videos
only (playlists, channels and search pages are refused), `--no-playlist` always
enforced, and the destination is always a folder inside your home directory.

The first run offers to install `yt-dlp` (official release, SHA2-256 verified
against the project checksums) and `ffmpeg` (Debian apt) — nothing is installed
without your confirmation. On a bare Debian base without `curl` and `wget`, the
command first tries to install them via apt; if apt itself cannot find packages
(empty package lists), run `nx cert-fix` once (Noxs 0.13.1 or newer) and retry. The download then runs in the foreground of your own
shell: progress is live and Ctrl+C stops it. Use the plugin window instead when
you prefer the progress bar, stage display and Cancel button for detached
downloads.

## Requirements

| Requirement | Why | How it is handled |
| --- | --- | --- |
| Noxs **0.12.0** or newer | `terminal.exec` and guest integration | `minimumNoxsVersion` in `plugin.json` |
| `terminal` permission | every check, download and cancel runs as a guest command | granted at install |
| `yt-dlp` | downloads the video | detected; installable with consent |
| `ffmpeg` | merges video and audio, converts to MP3/M4A/Opus | detected; installable with consent |
| `setsid`, `base64` | detached downloads and safe argument encoding | detected; part of the base system |
| `curl` or `wget` | downloading the yt-dlp release (only needed for the install) | either works; when both are missing the `yt` command tries `apt-get install curl wget` and suggests `nx cert-fix` (Noxs 0.13.1+) |
| A JavaScript runtime (`deno` or `node`) | current yt-dlp needs one to solve YouTube's page challenges | detected and reported; not installed automatically |
| Network access in the guest | fetching the video, and the tool install | used only when you start a download or confirm an install |

## Usage

1. **Check tools.** Press **Check tools**. The Tools section shows the version
   of every required tool, or `MISSING`.
2. **Create the request file (once).** Press **Create request file**. This
   creates `~/.noxs/youtube-downloader/request.txt` with commented
   instructions. An existing file is never overwritten.
3. **Edit the request.** In the Noxs terminal, open the file with any editor,
   for example:

   ```sh
   nano ~/.noxs/youtube-downloader/request.txt
   ```

   Set the options (see [Request file](#request-file)).
4. **Check request.** Press **Check request**. The window shows a summary of
   the job, or the exact field that needs fixing. Nothing is downloaded yet.
5. **Start download.** Press **Start download**. The progress bar, the current
   stage and the last yt-dlp log lines update every few seconds. When the
   download finishes, the window shows the saved file path.

### Request file

`request.txt` contains `key=value` lines. Lines starting with `#` and empty
lines are ignored. Keys are case-insensitive.

```ini
# Save a video as MP4, up to 720p
url=https://youtu.be/VIDEO_ID
mode=video
quality=720
format=mp4
dest=~/Downloads/YouTube
```

```ini
# Save only the audio as a 192 kbps MP3
url=https://www.youtube.com/watch?v=VIDEO_ID
mode=audio
quality=192
format=mp3
dest=~/Music/YouTube
```

| Key | Values | Default |
| --- | --- | --- |
| `url` | a single YouTube video link (see below) | *required* |
| `mode` | `video` or `audio` | `video` |
| `quality` | video: `best`, `1080`, `720`, `480`, `360` (maximum height in pixels)<br>audio: `best`, `320`, `192`, `128` (kbps) | `best` |
| `format` | video: `mp4`, `mkv`, `webm`<br>audio: `mp3`, `m4a`, `opus` | `mp4` (video) / `mp3` (audio) |
| `dest` | a folder inside your home directory, written `~/folder/sub` | `~/Downloads/YouTube` |

**Accepted links:** `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`,
`youtube.com/live/…`, `youtube.com/embed/…`, on `youtube.com`, `m.youtube.com`,
`music.youtube.com` and `youtu.be`. Links must use `https://`. If a link also
contains a `list=` playlist parameter, only the single video is downloaded.

**Refused:** playlists, channels, search pages, other websites, `http://`
links, links with credentials, links longer than 200 characters, and
destinations outside your home directory (absolute paths, `..`, or the home
folder itself).

## Install the tools

Missing tools are never installed silently. Press **Install tools…**: the
window lists exactly what would run for the missing tools. Nothing changes
until you press **Confirm install** within two minutes. **Cancel install**
aborts without changes.

What the approved install does:

- **ffmpeg** (only if missing): `sudo -n apt-get update` and
  `sudo -n apt-get install -y ffmpeg` from the Debian repositories. `sudo -n`
  never prompts; it needs passwordless sudo.
- **yt-dlp** (only if missing): downloads the official standalone release
  for your CPU (`yt-dlp_linux` on x86_64, `yt-dlp_linux_aarch64` on arm64) from
  `github.com/yt-dlp/yt-dlp`, verifies its SHA2-256 checksum against the
  project's `SHA2-256SUMS` file, and installs it to `~/.local/bin/yt-dlp`
  without root.

The plugin does **not** install Node.js or Deno. If the tool check reports no
JavaScript runtime, install one yourself, for example `sudo apt-get install -y nodejs`.

If the install reports that sudo needs a password, run the apt command shown
in the window yourself in the Noxs terminal, then press **Check tools**.

The plugin always looks for yt-dlp in `~/.local/bin` itself. If you want to run
`yt-dlp` by hand in a terminal and it is not found, open a new terminal session
or run `export PATH="$HOME/.local/bin:$PATH"`.

## Window reference

| Button | What it does |
| --- | --- |
| Check tools | Read-only probe of yt-dlp, ffmpeg, the JavaScript runtime and helpers |
| Install tools… | Shows the install steps for missing tools and waits for consent |
| Confirm install / Cancel install | Approves or aborts the pending install (expires after 2 minutes) |
| Create request file | Writes the commented template if the file does not exist |
| Check request | Validates the request file and shows a summary; downloads nothing |
| Start download | Validates again, checks the tools, then starts the download in the background |
| Cancel | Stops the running download and its ffmpeg/yt-dlp children |

Status messages start with a label: `OK`, `INFO`, `WARNING` or `ERROR`.

## Progress, completion and cancellation

- **Progress** is the percentage yt-dlp reports for the video stream, plus the
  current stage: *Fetching video information*, *Downloading*, *Merging video and
  audio*, or *Converting to audio*.
- **Success** shows `OK Download finished` and the saved path.
- **Failure** shows the last `ERROR:` line from yt-dlp, with common causes
  (private, removed, age- or region-restricted or members-only videos; an
  outdated yt-dlp; a missing JavaScript runtime; no network).
- **Cancellation** stops yt-dlp and ffmpeg together. Partly downloaded files
  (`*.part`) may remain in the destination folder; delete them if you do not
  need them.
- **Closing the window does not stop a download.** Reopen the plugin to see its
  progress again, or press **Cancel**. Only one download runs at a time.

Plugin state lives in `~/.noxs/youtube-downloader/`: `request.txt`, `status`,
`pid`, `result.txt` (the saved path) and `download.log` (yt-dlp output, including
video titles). Delete `download.log` whenever you like; the next download
recreates it.

## Limitations

- **No text box in the window.** The documented Noxs Plugin API has no way for
  a plugin window's text fields to reach plugin code, and it has no file
  picker. The URL and the destination are therefore entered in the request
  file, and the window shows the summary and the progress.
- **One video per request.** Playlists, channels and search pages are refused.
- **No folder picker.** Use `dest=~/…`. Destinations must be inside your home
  directory of the Noxs environment.
- **No subtitles, thumbnails, chapters or metadata options.**
- **No cookies, logins, DRM or access-control bypass.** Private or restricted
  videos fail with yt-dlp's error message.
- **YouTube changes often.** Keep yt-dlp current. The standalone install can
  update itself with `yt-dlp -U`; the Debian package in the default repositories
  is much older and is not used by this plugin.
- **Progress is approximate.** It comes from yt-dlp's output and is polled every
  2.5 seconds. Install progress is not shown; the window waits for the install
  to finish.
- **Command length.** Noxs limits a terminal command to 2000 characters. The
  plugin's commands stay well below that.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing: yt-dlp` or `ffmpeg` | Press **Install tools…**, review the steps, then **Confirm install**. |
| `ffmpeg install failed (needs passwordless sudo)` | Run `sudo apt-get install -y ffmpeg` in the Noxs terminal, then **Check tools**. |
| `yt-dlp install failed or checksum mismatch` | Check the network connection and retry. A checksum mismatch is refused on purpose; do not install the file manually. |
| `No JavaScript runtime found` | `sudo apt-get install -y nodejs`, then **Check tools**. |
| `Video unavailable`, `Private video`, `age-restricted` | The video cannot be downloaded without access you do not have. The plugin does not use cookies. |
| `HTTP Error 403` or `Sign in to confirm you're not a bot` | Update yt-dlp first: run `yt-dlp -U` (standalone install). If the error remains, YouTube is blocking this environment; the plugin does not use cookies, so the video cannot be downloaded from here. |
| `Requested format is not available` | Pick a lower `quality`, or `best`. |
| `Could not create the destination folder` | Use a `dest=~/folder` inside your home directory. |
| `A download is already running` | Wait for it to finish, or press **Cancel**. |
| `The download stopped before it finished` | The process ended without a final status (for example after the environment restarted). Start it again; `.part` files can be deleted. |
| `Could not read the request file` / `No request file yet` | Press **Create request file**, then edit it in the Noxs terminal. |
| Progress does not move | Large videos can spend a while in one stage. Check the log lines below the progress bar. |

For details, read `~/.noxs/youtube-downloader/download.log` in the Noxs terminal.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `ui` | Shows the plugin window. |
| `terminal` | Runs the tool checks, the request-file read, the download and the cancel through `noxs.terminal.exec`, and the approved install. |

The plugin declares no `network` permission because the plugin code itself makes
no network requests. All network traffic happens inside the guest environment,
through yt-dlp and the approved install commands.

## Security notes

- Values from the request file (URL and destination) are validated before use.
  The URL must be a single YouTube video link. The destination must be a folder
  inside your home directory.
- Commands never contain raw user text. The URL and destination are encoded as
  base64 and decoded inside the shell, and yt-dlp receives the URL after `--`, so
  a link can never be read as an option or break out of its quoting. Format and
  quality values come from fixed lists.
- The download runs in its own session so that **Cancel** can stop every
  process it started.
- Nothing is installed or fetched without your confirmation, and the yt-dlp
  binary is checked against the project's published SHA2-256 checksum before it
  is installed.

## Files

| File | Purpose |
| --- | --- |
| `plugin.json` | Plugin metadata, permissions and entry point |
| `src/main.js` | Plugin window, status polling and actions |
| `src/request.js` | Request-file format, validation and yt-dlp option mapping |
| `src/shell.js` | Guest command builders (safe encoding) and output parsers |
| `bin/yt` | Guest command shim — the `yt` terminal command (installed into `/usr/local/bin`) |
| `icon.svg` | Logo shown in the Plugin Store |
| `README.md` | This document |

## Development

From the repository root:

```sh
npm install
npm run validate
npm run build
```

or from this plugin directory:

```sh
npm run validate
npm run build
```

`npm run build` writes `dist/plugin.js`, `dist/plugin.json`, `dist/README.md` and
`dist/icon.svg`. The plugin is released with the repository's `youtube-downloader-v<version>`
tag workflow.
