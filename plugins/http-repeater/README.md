# HTTP Repeater

Replay hand-crafted HTTP requests with curl timing, headers and body
preview. Part of the Noxs **Security Tools** category.

## What it does

HTTP Repeater sends exactly **one** HTTP request built from a request file
— a manual test repeater for APIs and endpoints you are authorized to
test, in the spirit of intercepting-proxy "repeater" tabs:

- Any method: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Arbitrary headers (multi-line support via `;;` separators)
- Optional request body (inline single-line or from a file)
- Follow-redirect toggle, 1-30 s timeout
- After the response: status code plus a **timing breakdown** — DNS,
  connect, TLS, time-to-first-byte, total, download size
- Response headers, body preview (first 1200 bytes) and optional full body
  save to `~/.noxs/http-repeater/results-*.txt`

One run = one request. No loops, no fuzzing, no load generation.

## Install

```sh
nx plug install http-repeater
```

Requires Noxs 0.12.0 or newer (Plugin SDK 0.0.2).

## Usage

1. Press **CHECK TOOLS** to verify `curl` and `bash`.
2. Press **EDIT REQUEST**, then edit `~/.noxs/http-repeater/request.txt`.
3. Press **RUN** twice (arm + confirm within 2 minutes).
4. Timing, headers and body preview stream into the console.

## Request file reference

```ini
# http-repeater request — lines starting with # are comments
# method: GET | POST | PUT | PATCH | DELETE | HEAD | OPTIONS
method = GET

# url: full target URL (you must be authorized to test it)
url = https://httpbin.org/headers

# headers: separated by ;;  e.g.  X-Test: 1;;Accept: application/json
headers =

# body: raw single-line body, or body_file: absolute path (body_file wins)
body =
body_file =

# follow: true|false   timeout: 1-30s   save_body: true|false
follow = true
timeout = 10
save_body = true
```

| Key         | Required | Notes                                             |
| ----------- | -------- | ------------------------------------------------- |
| `method`    | no       | default `GET`; whitelist enforced                 |
| `url`       | yes      | full `http(s)://` URL                             |
| `headers`   | no       | `Name: value` pairs separated by `;;`             |
| `body`      | no       | single-line body, max 8192 chars                  |
| `body_file` | no       | absolute path to a body file (overrides `body`)   |
| `follow`    | no       | follow redirects, default `true`                  |
| `timeout`   | no       | 1-30 seconds, default 10                          |
| `save_body` | no       | save full response body, default `false`          |

## Example: authorized API check

```ini
method = POST
url = https://api.example.com/v1/ping
headers = Authorization: Bearer eyJhbGciOi...;;Content-Type: application/json
body = {"probe":"header-auditor follow-up"}
follow = false
timeout = 10
```

```text
--- timing ---
code=200
dns=0.012s  connect=0.034s  tls=0.089s  ttfb=0.121s  total=0.130s  size=87B

--- body preview (first 1200 bytes) ---
{"ok":true,"latency_ms":86}
```

The TLS gap (`tls - connect`) shows handshake cost; `ttfb - tls` is
server think-time — useful when profiling an API you operate.

## Security notes

- Header values are transmitted verbatim — never put secrets in a request
  file you would not store on the device.
- The 8192-char inline body limit exists to keep request files reviewable;
  use `body_file` for larger payloads.
- CR/LF in header values is rejected at parse time (header injection).

## Permissions

| Permission | Why                                      |
| ---------- | ---------------------------------------- |
| `ui`       | the control window and console output    |
| `terminal` | tool checks, the single curl request     |

## Ethical use

- Every run requires a **two-press consent** (2 minute window).
- Permanent **AUTHORIZED USE ONLY** banner in the window.
- One request per run — the tool is structurally incapable of load
  testing or fuzzing.

## Legal disclaimer

This plugin is provided for authorized security testing, education and
defensive research. Sending crafted requests to systems without explicit
prior permission may be illegal in your jurisdiction. You are solely
responsible for compliant use.
