# Recon Scope

Passive-first reconnaissance for hosts and domains you are authorized to
assess. Part of the Noxs **Security Tools** category.

## What it does

Recon Scope bundles the three first steps of any authorized assessment into
one polite, rate-limited workflow:

- **dns** — resolves A, AAAA, NS, MX, TXT and SOA records with `host`
- **whois** — extracts the registrar block (registrar, dates, nameservers,
  status flags) with `whois`
- **http** — probes `https://` and `http://` once each and shows the server
  response line and headers

Nothing is fuzzed, brute-forced or exploited. Every lookup is a single,
standard query — the kind a browser or mail server would make anyway —
separated by a configurable delay.

## Install

```sh
nx plug install recon-scope
```

Requires Noxs 0.12.0 or newer (Plugin SDK 0.0.2).

## Usage

1. Open the plugin and press **CHECK TOOLS**. It reports whether `host`,
   `whois` and `curl` are present in the Noxs guest.
2. If tools are missing, press **INSTALL TOOLS** twice (arm + confirm) to
   run `apt-get install dnsutils whois curl`.
3. Press **EDIT REQUEST** — the plugin creates
   `~/.noxs/recon-scope/request.txt`. Open it in the Noxs terminal
   (`nano ~/.noxs/recon-scope/request.txt`) and set your target.
4. Press **RUN** twice: the first press arms the run, the second press
   (within 2 minutes) confirms it. Output streams into the console pane.
5. Results are also written to `~/.noxs/recon-scope/results-*.txt`.

## Request file reference

```ini
# recon-scope request — lines starting with # are comments
# target: hostname or domain (no scheme, no path)
target = example.com

# modules: comma list of dns,whois,http
modules = dns,whois,http

# delay: seconds between lookups (>= 0.5, be polite)
delay = 1
```

| Key       | Required | Notes                                             |
| --------- | -------- | ------------------------------------------------- |
| `target`  | yes      | bare hostname or domain, no scheme, no path       |
| `modules` | no       | defaults to `dns,whois,http`                      |
| `delay`   | no       | seconds between lookups, minimum 0.5, default 1   |

## Example session

```sh
$ nano ~/.noxs/recon-scope/request.txt
# target = example.com, modules = dns,whois,http

$ # back in the plugin window: RUN -> RUN
== recon-scope report for example.com ==
== DNS records for example.com ==
--- A ---
example.com has address 93.184.216.34
...
```

## Permissions

| Permission | Why                                                    |
| ---------- | ------------------------------------------------------ |
| `ui`       | the control window and console output                  |
| `terminal` | tool checks, whois/dig lookups, log polling            |

## Ethical use

- Every run requires a **two-press consent** (2 minute window).
- The window shows a permanent **AUTHORIZED USE ONLY** banner.
- Lookups are sequential with a delay — the plugin never floods.
- Only run against systems you own or have written permission to test.

## Legal disclaimer

This plugin is provided for authorized security testing, education and
defensive research. Running reconnaissance against systems without prior
permission may be illegal in your jurisdiction (including under computer
misuse and fraud laws). You are solely responsible for compliant use.
