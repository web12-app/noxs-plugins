# SSL Inspector

Inspect TLS certificates and protocol support of a host with openssl.
Part of the Noxs **Security Tools** category.

## What it does

SSL Inspector performs a handful of TLS handshakes against a host and
reports:

- **Certificate details** — subject, issuer, serial, validity dates
- **Subject Alternative Names** — every hostname the certificate covers
- **Expiry countdown** — days remaining with an EXPIRED / CRITICAL (<15 d) /
  WARNING (<30 d) / OK status
- **Protocol support** — which of TLS 1.0 / 1.1 / 1.2 / 1.3 the server
  accepts, probed one version at a time with delays

Legacy protocol support (TLS 1.0/1.1) on a modern server is a hardening
finding, not an emergency — PCI DSS, for example, requires disabling them.

## Install

```sh
nx plug install ssl-inspector
```

Requires Noxs 0.12.0 or newer (Plugin SDK 0.0.2).

## Usage

1. Press **CHECK TOOLS** to verify `openssl`.
2. Press **EDIT REQUEST**, then edit `~/.noxs/ssl-inspector/request.txt`.
3. Press **RUN** twice (arm + confirm within 2 minutes).
4. The report streams into the console and the parsed certificate dump is
   saved to `~/.noxs/ssl-inspector/results-*.txt`.

## Request file reference

```ini
# ssl-inspector request — lines starting with # are comments
# host: hostname (SNI is used) — port: TLS port (default 443)
host = example.com
port = 443

# protocols: comma list of tls1,tls1_1,tls1_2,tls1_3
protocols = tls1,tls1_1,tls1_2,tls1_3

# delay: seconds between protocol probes (>= 0.5)
delay = 1
```

| Key         | Required | Notes                                            |
| ----------- | -------- | ------------------------------------------------ |
| `host`      | yes      | bare hostname (used for SNI), no scheme/port     |
| `port`      | no       | TLS port, 1-65535, default 443                   |
| `protocols` | no       | subset of `tls1,tls1_1,tls1_2,tls1_3`            |
| `delay`     | no       | seconds between probes, minimum 0.5, default 1   |

## Example output

```text
--- certificate ---
subject=CN = example.com
issuer=C=US, O=Let's Encrypt, CN=R3
notBefore=Sep  1 08:00:00 2026 GMT
notAfter=Nov 30 08:00:00 2026 GMT
expires in: 50 days (Nov 30 08:00:00 2026 GMT)
STATUS: OK

--- protocol support ---
tls1: supported
tls1_1: supported
tls1_2: supported
tls1_3: supported
```

TLS 1.0 and 1.1 accepted on a public site in 2026 is a finding: they are
deprecated (RFC 8996) and fail modern compliance scans.

## Monitoring your own sites

Because the expiry countdown includes day math and status, SSL Inspector
doubles as a poor-man's certificate monitor: run it monthly against your
own hosts and catch renewals before browsers do.

## Permissions

| Permission | Why                                        |
| ---------- | ------------------------------------------ |
| `ui`       | the control window and console output      |
| `terminal` | tool checks, openssl handshakes, polling   |

## Ethical use

- Every run requires a **two-press consent** (2 minute window).
- Permanent **AUTHORIZED USE ONLY** banner in the window.
- A few handshakes per run with delays — no session flooding.
- TLS handshake metadata is public by design, but probing third-party
  infrastructure may still be unwelcome; prefer your own systems.

## Legal disclaimer

This plugin is provided for authorized security testing, education and
defensive research. You are solely responsible for compliant use.
