# WP Scanner

Gentle GET-only WordPress recon. Part of the Noxs **Security Tools**
category.

## What it does

WP Scanner runs about **7 GET requests** (with enforced delays) against a
WordPress site you are authorized to test and reports:

- **Front-page fingerprint** — generator meta tag, referenced themes and
  plugins from the HTML source
- **/wp-login.php** — HTTP status (200 typically means the login page)
- **/wp-json/** — REST API root (name, description, namespaces)
- **User enumeration** — `/wp-json/wp/v2/users` plus the
  `/?rest_route=/wp/v2/users` fallback, listing up to 50 user slugs
- **/readme.html** — version disclosure check
- **/xmlrpc.php** — status (405/403 expected; 200 means xmlrpc is exposed)

No logins, no brute force, no exploit attempts, no payload injection —
ever. Every request is a plain GET any browser could make.

## Install

```sh
nx plug install wp-scanner
```

Requires Noxs 0.12.0 or newer (Plugin SDK 0.0.2).

## Usage

1. Press **CHECK TOOLS** to verify `curl`.
2. Press **EDIT REQUEST**, then edit `~/.noxs/wp-scanner/request.txt`.
3. Press **RUN** twice (arm + confirm within 2 minutes).
4. The report streams into the console and is saved to
   `~/.noxs/wp-scanner/results-*.txt`.

## Request file reference

```ini
# wp-scanner request — lines starting with # are comments
# base_url: WordPress site root you are authorized to test
base_url = https://example.com

# delay: seconds between requests (>= 1, politeness enforced)
delay = 2

# max_users: how many REST users to request (max 50)
max_users = 20
```

| Key         | Required | Notes                                            |
| ----------- | -------- | ------------------------------------------------ |
| `base_url`  | yes      | site root like `https://example.com`             |
| `delay`     | no       | seconds between requests, **min 1**, default 2   |
| `max_users` | no       | 1-50, default 20                                 |

## Example output

```text
--- front page fingerprint ---
generator meta: <meta name="generator" content="WordPress 6.4.2">
themes referenced:
  wp-content/themes/twentytwentyfour
plugins referenced:
  wp-content/plugins/akismet
  wp-content/plugins/contact-form-7
--- /wp-login.php ---
status: 200 (200 typically means the WordPress login page)
--- user enumeration: /wp-json/wp/v2/users ---
"slug":"admin"
"slug":"editor1"
--- xmlrpc.php status ---
status: 200 (405/403 expected; 200 means xmlrpc is exposed)
```

## How to read the findings

- **User slugs exposed** — enable username privacy or restrict REST user
  routes; slugs feed credential-stuffing attempts
- **xmlrpc.php = 200** — disable XML-RPC if unused (pingback abuse)
- **readme.html present** — remove it; it discloses the exact version
- **Outdated version** — patch; WordPress core/plugin CVEs are mass-scanned
- **Plugin/theme names** — check each against the vulnerability databases
  before your next authorized test

## Hardening checklist derived from a scan

1. Remove `readme.html` and limit REST user enumeration (or a WAF rule)
2. Disable XML-RPC if not needed
3. Keep core, themes and plugins updated
4. Consider moving the login page or adding rate limiting

## Permissions

| Permission | Why                                     |
| ---------- | --------------------------------------- |
| `ui`       | the control window and console output   |
| `terminal` | tool checks, curl GETs, log polling     |

## Ethical use

- Every run requires a **two-press consent** (2 minute window).
- Permanent **AUTHORIZED USE ONLY** banner in the window.
- Delay is enforced at 1 second minimum — the scan stays polite.
- GET-only by design: the tool cannot brute-force, inject or exploit.

## Legal disclaimer

This plugin is provided for authorized security testing, education and
defensive research. Testing WordPress installations without explicit prior
permission may be illegal in your jurisdiction. You are solely responsible
for compliant use.
