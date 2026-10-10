# Payload Lab

Offline encode/decode/hash workbench: base64, hex, URL, SHA-2 and JWT
inspection. Part of the Noxs **Security Tools** category.

## What it does

Payload Lab is a **100% offline** utility for the everyday transformations
security work and debugging demand — nothing ever leaves the device, and
the plugin performs zero network I/O:

- **encode** — base64, hex (lowercase, no separators), percent-encoding
- **decode** — the same three, in reverse
- **hash** — MD5, SHA-1, SHA-256 digests via coreutils
- **jwt** — splits a JSON Web Token and decodes header + payload; the
  signature is shown but **never verified** (verification needs the key
  and a real JWT library — this is an inspection lens, not a validator)

Typical uses: inspecting a suspicious token, preparing a test value for an
authorized web test, checking whether a string is double-encoded, and
computing digests to verify file integrity.

## Install

```sh
nx plug install payload-lab
```

Requires Noxs 0.12.0 or newer (Plugin SDK 0.0.2).

## Usage

1. Press **CHECK TOOLS** to verify `base64`, `md5sum`, `sha256sum` and
   `bash` (all ship with a standard Debian guest).
2. Press **EDIT REQUEST**, then edit `~/.noxs/payload-lab/request.txt`.
3. Press **RUN** twice (arm + confirm within 2 minutes — yes, even for
   offline work; the consent flow is consistent across Security Tools).
4. Read the result in the console.

Input handling:

- `input = ...` — single-line text (up to 4096 chars)
- `input_file = /abs/path` — absolute path to a larger/multiline file
  (still capped at 4096 bytes)
- The input file is copied, processed and **deleted** after the run

## Request file reference

```ini
# payload-lab request — lines starting with # are comments
# mode: encode | decode | hash | jwt
mode = encode

# format (encode/decode): base64 | hex | url
format = base64

# algo (hash): md5 | sha1 | sha256
algo = sha256

# input: single-line text, OR input_file: absolute path (input wins)
input = Hello, Noxs!
input_file =
```

| Key          | Required                        | Notes                                 |
| ------------ | ------------------------------- | ------------------------------------- |
| `mode`       | yes                             | `encode` `decode` `hash` `jwt`        |
| `format`     | encode/decode modes             | `base64` `hex` `url`                  |
| `algo`       | hash mode                       | `md5` `sha1` `sha256`                 |
| `input`      | one of `input` / `input_file`   | single line, max 4096 chars           |
| `input_file` | one of `input` / `input_file`   | absolute path, max 4096 bytes         |

## Example: JWT inspection

```ini
mode = jwt
input = eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSIsIm5hbWUiOiJKb2UifQ.SflKxwRJ...
```

```text
--- header (unverified) ---
{"alg":"HS256"}

--- payload (unverified) ---
{"sub":"12345","name":"Joe"}

--- signature ---
SflKxwRJ...
note: signature NOT verified — inspection only
```

## Security notes

- The JWT decoder shows tokens as-is — it cannot detect `alg: none`,
  weak HMAC secrets or embedded jwks. Treat output as untrusted input for
  your own authorized tests.
- MD5 and SHA-1 are offered because legacy systems still use them; for
  anything new, prefer SHA-256.

## Permissions

| Permission | Why                                                      |
| ---------- | -------------------------------------------------------- |
| `ui`       | the control window and console output                    |
| `terminal` | tool checks and the offline transform pipeline           |

Note: no `network` permission, no curl — Payload Lab physically cannot
send your data anywhere.

## Ethical use

- Every run requires a **two-press consent** (2 minute window).
- Permanent tool banner in the window; fully offline by design.

## Legal disclaimer

This plugin is provided for authorized security testing, education and
defensive research. Use responsibly — decoding a token does not grant
authorization to use it. You are solely responsible for compliant use.
