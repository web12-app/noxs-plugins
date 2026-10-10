# Whois Lookup

Registrar, dates, nameservers and status flags from whois records. Part
of the Noxs **Security Tools** category.

## What it does

Whois Lookup runs **one** `whois` query per run and distills the record:

- **Key fields** — domain name, registrar, registrar URL, creation /
  updated / expiry dates
- **Status flags** — `clientTransferProhibited`, `serverDeleteProhibited`,
  redemption and pending-period states
- **Nameservers** — the delegated NS set
- **Raw record** — the first 60 lines for context

The full raw record is always saved to `~/.noxs/whois-lookup/results-*.txt`.

## Why it matters in security work

- **Expiry dates** — a domain close to expiry is a takeover risk
- **Status flags** — registry locks (`serverTransferProhibited` etc.)
  indicate hardened domains; their absence on high-value domains is a
  finding
- **Registrar + dates** — recently created domains with privacy-shielded
  registrars are a classic phishing indicator
- **Nameservers** — unexpected NS changes can signal DNS hijacking

## Install

```sh
nx plug install whois-lookup
```

Requires Noxs 0.12.0 or newer (Plugin SDK 0.0.2).

## Usage

1. Press **CHECK TOOLS** to verify `whois`.
2. Missing? Press **INSTALL TOOLS** twice (arm + confirm) to run
   `apt-get install whois`.
3. Press **EDIT REQUEST**, then edit `~/.noxs/whois-lookup/request.txt`.
4. Press **RUN** twice (arm + confirm within 2 minutes).

## Request file reference

```ini
# whois-lookup request — lines starting with # are comments
# domain: the domain to look up (no scheme, no path)
domain = example.com
```

| Key      | Required | Notes                    |
| -------- | -------- | ------------------------ |
| `domain` | yes      | bare domain, no scheme   |

## Example output

```text
--- key fields ---
Domain Name: EXAMPLE.COM
Registrar: RESERVED-Internet Assigned Numbers Authority
Creation Date: 1995-08-14T04:00:00Z
Registry Expiry Date: 2027-08-13T04:00:00Z

--- status flags ---
Domain Status: clientDeleteProhibited
Domain Status: clientTransferProhibited
Domain Status: clientUpdateProhibited

--- nameservers ---
Name Server: A.IANA-SERVERS.NET
Name Server: B.IANA-SERVERS.NET
```

## Permissions

| Permission | Why                                     |
| ---------- | --------------------------------------- |
| `ui`       | the control window and console output   |
| `terminal` | tool checks, whois query, log polling   |

## Ethical use

- Every run requires a **two-press consent** (2 minute window).
- Permanent **AUTHORIZED USE ONLY** banner in the window.
- Whois data is public registry information; one query per run keeps you
  well inside every registrar's acceptable-use policy.

## Legal disclaimer

This plugin is provided for authorized security testing, education and
defensive research. Whois data may contain personal information governed
by GDPR and similar regimes — handle stored results responsibly. You are
solely responsible for compliant use.
