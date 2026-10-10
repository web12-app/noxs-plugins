# Port Probe

Gentle sequential TCP port checks with delays, for authorized network
audits. Part of the Noxs **Security Tools** category.

## What it does

Port Probe checks whether a list of TCP ports is open on a target, one
port at a time, with a configurable delay and per-connect timeout. It uses
`nc` (netcat) when available and falls back to bash's `/dev/tcp` mechanism
otherwise. A run is capped at 32 ports — this is an audit tool for known
services, not a bulk scanner.

- No SYN floods, no parallelism, no OS fingerprinting
- Prints a timestamped result line per port plus an open/closed summary
- Saves results to `~/.noxs/port-probe/results-*.txt`

## Install

```sh
nx plug install port-probe
```

Requires Noxs 0.12.0 or newer (Plugin SDK 0.0.2).

## Usage

1. Press **CHECK TOOLS** to verify `nc` and `curl` in the Noxs guest.
2. Missing tools? Press **INSTALL TOOLS** twice (arm + confirm) to run
   `apt-get install netcat-openbsd curl`.
3. Press **EDIT REQUEST**, then edit `~/.noxs/port-probe/request.txt`.
4. Press **RUN** twice (arm + confirm within 2 minutes).
5. Watch the console stream; results land in `results-*.txt`.

## Request file reference

```ini
# port-probe request — lines starting with # are comments
# target: hostname or IP you are authorized to test
target = 127.0.0.1

# ports: comma list, max 32 entries
ports = 22,80,443,465,587,993,3306,8080

# timeout: seconds per connect (1-10)   delay: seconds between ports (>= 0.5)
timeout = 2
delay = 1
```

| Key       | Required | Notes                                              |
| --------- | -------- | -------------------------------------------------- |
| `target`  | yes      | bare hostname or IP, no scheme, no port            |
| `ports`   | yes      | 1-32 TCP ports, each 1-65535                       |
| `timeout` | no       | connect timeout per port, 1-10 seconds, default 2  |
| `delay`   | no       | seconds between probes, minimum 0.5, default 1     |

## Example session

```ini
target = 127.0.0.1
ports = 22,80,443,8080
timeout = 2
delay = 1
```

```text
== port-probe report for 127.0.0.1 (timeout 2s, delay 1s) ==
port 22     open       18:04:11
port 80     closed     18:04:12
port 443    open       18:04:13
port 8080   closed     18:04:14

== summary: 2 open, 2 closed, 0 other ==
```

## Interpreting results

- **open** — the TCP three-way handshake completed; a service accepted
- **closed** — an RST came back; nothing listening (or a firewall rejects)
- **other** — neither happened within the timeout; often a drop firewall
  rule (the port may still be filtered rather than closed)

## Permissions

| Permission | Why                                            |
| ---------- | ---------------------------------------------- |
| `ui`       | the control window and console output          |
| `terminal` | tool checks, nc//dev/tcp probes, log polling   |

## Ethical use

- Every run requires a **two-press consent** (2 minute window).
- Permanent **AUTHORIZED USE ONLY** banner in the window.
- Sequential probes with delays — deliberately gentle on targets.
- Port scanning systems without authorization may be illegal in your
  jurisdiction, even when no data is retrieved.

## Legal disclaimer

This plugin is provided for authorized security testing, education and
defensive research. Scanning hosts, networks or services without explicit
prior permission may be illegal in your jurisdiction (including under
computer misuse, fraud and telecom laws). You are solely responsible for
compliant use.
