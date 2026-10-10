# Header Auditor

Fetch and grade HTTP security headers for a website you are authorized to
test. Part of the Noxs **Security Tools** category.

## What it does

Header Auditor makes **one** request (HEAD, optionally following redirects)
to a URL, shows the raw response headers, then grades the standard
hardening set:

| Header                       | Why it matters                                   |
| ---------------------------- | ------------------------------------------------ |
| `Strict-Transport-Security`  | forces HTTPS for future visits (HSTS)            |
| `Content-Security-Policy`    | mitigates XSS and content injection              |
| `X-Content-Type-Options`     | blocks MIME sniffing (`nosniff`)                 |
| `X-Frame-Options`            | legacy clickjacking protection                   |
| `Referrer-Policy`            | limits referrer leakage                          |
| `Permissions-Policy`         | restricts powerful browser features              |
| `Cross-Origin-Opener-Policy` | process isolation against side channels          |

It also inspects `Set-Cookie` flags (`Secure`, `HttpOnly`, `SameSite`).
Each audit is a single request — effectively zero load on the target.

## Install

```sh
nx plug install header-auditor
```

Requires Noxs 0.12.0 or newer (Plugin SDK 0.0.2).

## Usage

1. Press **CHECK TOOLS** to verify `curl`.
2. Press **EDIT REQUEST**, then edit `~/.noxs/header-auditor/request.txt`.
3. Press **RUN** twice (arm + confirm within 2 minutes).
4. The report — raw headers, per-header grade, score and cookie notes —
   streams into the console and is saved to
   `~/.noxs/header-auditor/results-*.txt`.

## Request file reference

```ini
# header-auditor request — lines starting with # are comments
# url: full URL including scheme
url = https://example.com

# follow: follow redirects (true/false)   timeout: seconds (1-30)
follow = true
timeout = 10
```

| Key       | Required | Notes                                    |
| --------- | -------- | ---------------------------------------- |
| `url`     | yes      | full `http(s)://` URL                    |
| `follow`  | no       | follow 3xx redirects, default `true`     |
| `timeout` | no       | request timeout, 1-30 seconds, default 10 |

## Example output

```text
--- security header grade ---
[present] strict-transport-security
[MISSING] content-security-policy
[present] x-content-type-options
[present] x-frame-options
[MISSING] referrer-policy
[present] permissions-policy
[MISSING] cross-origin-opener-policy

score: 4 / 7 standard headers present
cookies: review Set-Cookie flags (Secure/HttpOnly/SameSite)
```

A missing header is not automatically a vulnerability — it is a hardening
opportunity. Compare the grade against your own baseline and security
policy.

## Permissions

| Permission | Why                                     |
| ---------- | --------------------------------------- |
| `ui`       | the control window and console output   |
| `terminal` | tool checks, curl fetch, log polling    |

## Ethical use

- Every run requires a **two-press consent** (2 minute window).
- Permanent **AUTHORIZED USE ONLY** banner in the window.
- One request per audit — no stress, no fuzzing.
- Auditing sites you do not own is generally harmless, but automated
  probing may violate terms of service; prefer your own properties.

## Legal disclaimer

This plugin is provided for authorized security testing, education and
defensive research. You are solely responsible for compliant use and for
any action you take based on the audit results.
