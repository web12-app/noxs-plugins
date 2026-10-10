# DirScan Lite

Slow, polite directory and file discovery for websites you own or have
permission to test. Part of the Noxs **Security Tools** category.

## What it does

DirScan Lite probes a wordlist of common paths (plus optional extensions)
against a site root, one plain GET request at a time, and reports anything
that is **not** a 404:

- Built-in list of ~80 common paths (`admin`, `.env`, `.git/config`,
  `phpmyadmin`, `robots.txt`, `.well-known/security.txt`, ...) or your own
  wordlist file
- Optional extension sweep (`.php`, `.bak`, ...) per entry
- Hard caps: **max 300 paths** and **min 0.5 s delay** per run
- Sequential requests only — no parallelism, no stress

This is the tool for a quick exposure check of your own site (leftover
backups, debug files, admin panels), not a bulk crawler.

## Install

```sh
nx plug install dirscan-lite
```

Requires Noxs 0.12.0 or newer (Plugin SDK 0.0.2).

## Usage

1. Press **CHECK TOOLS** to verify `curl`.
2. Press **EDIT REQUEST**, then edit `~/.noxs/dirscan-lite/request.txt`.
3. Press **RUN** twice (arm + confirm within 2 minutes).
4. Hits stream into the console; the run summary and full log are saved to
   `~/.noxs/dirscan-lite/results-*.txt`.

## Request file reference

```ini
# dirscan-lite request — lines starting with # are comments
# base_url: site root you are authorized to test (no trailing path)
base_url = https://example.com

# wordlist: "builtin" or an absolute path to your own file (one path per line)
wordlist = builtin

# extensions: comma list without dot, applied to each entry (empty = none)
extensions = php,html,bak

# delay: seconds between requests (>= 0.5)   max_paths: hard cap (max 300)
delay = 1.5
max_paths = 100
```

| Key          | Required | Notes                                              |
| ------------ | -------- | -------------------------------------------------- |
| `base_url`   | yes      | site root like `https://example.com`               |
| `wordlist`   | no       | `builtin` or absolute path to a custom list        |
| `extensions` | no       | comma list without dots, e.g. `php,html,bak`       |
| `delay`      | no       | seconds between requests, min 0.5, default 1.5     |
| `max_paths`  | no       | cap per run, 1-300, default 100                    |

## Example output

```text
== dirscan-lite report for https://example.com ==
FOUND  /robots.txt                      200  68B
FOUND  /admin                           302  0B
FOUND  /admin.php                       200  1842B
FOUND  /.env                            200  917B

== done: 34 requests, 4 non-404 responses (polite mode) ==
```

A 302 on `/admin` may just redirect to a login page; a 200 on `/.env` is
almost always a real finding worth fixing immediately.

## Custom wordlists

Point `wordlist` at any file with one path per line (comments with `#` are
skipped). Custom lists override the builtin list entirely. Keep runs inside
the 300-path cap — split big lists across runs.

## Permissions

| Permission | Why                                       |
| ---------- | ----------------------------------------- |
| `ui`       | the control window and console output     |
| `terminal` | tool checks, curl probes, log polling     |

## Ethical use

- Every run requires a **two-press consent** (2 minute window).
- Permanent **AUTHORIZED USE ONLY** banner in the window.
- Politeness is enforced: delays are mandatory and parallelism impossible.
- Path brute-forcing on sites you do not own may be illegal and will show
  up in their WAF/IDS logs.

## Legal disclaimer

This plugin is provided for authorized security testing, education and
defensive research. Probing websites or applications without explicit
prior permission may be illegal in your jurisdiction (including under
computer misuse and fraud laws). You are solely responsible for compliant
use.
