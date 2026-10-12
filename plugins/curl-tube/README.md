# Curl Tube

Terminal client for your **file cloud** — the self-hosted storage service
(api-curl-test-repo) that keeps accounts and file metadata in a private GitHub
repository and file bytes as GitHub release assets. This plugin drives that
documented REST API with plain `curl` inside the Noxs guest: login, list,
push (resumable chunked uploads), pull, share and delete.

## What it does

- **LOGIN / WHOAMI / LOGOUT** — `POST /api/login`, `GET /api/me`,
  `POST /api/logout`. The session cookie is kept in a cookie jar with
  `chmod 600` inside the plugin directory.
- **LIST FILES** — `GET /api/files` with quota; the id column feeds every
  other action.
- **PUSH** — uploads the file from the request file.
  - Below the threshold (default 4 MB) it is one `multipart/form-data`
    call to `/api/files/upload`.
  - At or above the threshold it switches to the resumable flow:
    `POST /api/uploads/init`, `split` into the server's `chunkBytes` pieces,
    every piece posted to `/api/uploads/<sid>/chunks/<n>` with its own
    `X-Chunk-Sha256` header, then `POST /api/uploads/<sid>/complete`.
    Interrupted transfers resume: re-running PUSH reuses the same
    `uploadId`, the server reports the pieces it already has and they are
    skipped.
  - The 2 GB per-file ceiling is checked before anything is sent.
- **PULL** — `GET /api/files/<id>/download` to the `out=` path
  (default `./<id>.download`).
- **SHARE / UNSHARE** — `PUT /api/files/<id>/sharing` with
  `{"public":true|false}`; SHARE prints the full public URL
  (`host + sharePath`). Anyone holding the URL can open the file.
- **DELETE** — two-press consent, then `DELETE /api/files/<id>`.
  There is no undo: the stored bytes and the share link die with it.

## Workflow

1. **CHECK TOOLS** — verifies curl, sha256sum, split, base64, stat.
2. **INSTALL TOOLS** — `apt-get install curl coreutils` when something is
   missing.
3. **EDIT REQUEST** — creates the request file (see below).
4. **LOGIN** — then use LIST / PUSH / PULL / SHARE / DELETE.

Long transfers run as a generated script in the background and stream their
log into the console; they keep running if you close the window — press
**STOP** to cancel. Re-running PUSH after an interruption continues the same
upload.

## Request file

`~/.noxs/curl-tube/request.txt` (edit in the Noxs terminal):

```
host=https://your-tunnel.example       # https required; http only for localhost testing
username=device-account
password=...
file=/root/example.zip                 # absolute path inside the guest
id=<32-hex file id from LIST FILES>
out=/root/pulled.bin                   # optional PULL destination
chunk=4                                # MB threshold for chunked upload
```

## Security notes

- Only `https://` hosts are accepted (plain `http` is allowed solely for
  `localhost` / `127.0.0.1` testing). No path, no credentials inside the
  host string.
- Credentials live in the request file **on this device only**. Create a
  dedicated account for the device instead of reusing a personal one.
- The session cookie jar is `chmod 600`; the plugin directory is `chmod 700`.
- State-changing calls send `X-Requested-With: fetch` as the API requires;
  curl sends no `Origin`, which the same-origin rule allows.
- Delete is the only destructive action and needs two presses within two
  minutes.

## Files (inside the guest)

| Path | Purpose |
| --- | --- |
| `~/.noxs/curl-tube/request.txt` | user edited parameters |
| `~/.noxs/curl-tube/session.jar` | login cookie jar (600) |
| `~/.noxs/curl-tube/push-state.txt` | resumable uploadId state |
| `~/.noxs/curl-tube/action.sh` | generated transfer script |
| `~/.noxs/curl-tube/last-run.log` | live transfer output |

## API mapping

| Button | Calls |
| --- | --- |
| LOGIN | `POST /api/login` |
| WHOAMI | `GET /api/me` |
| LOGOUT | `POST /api/logout` |
| LIST FILES | `GET /api/files` |
| PUSH (small) | `POST /api/files/upload` (multipart, `uploadId`) |
| PUSH (large) | `POST /api/uploads/init` → `POST /api/uploads/<sid>/chunks/<n>` (+ `X-Chunk-Sha256`) → `POST /api/uploads/<sid>/complete` |
| PULL | `GET /api/files/<id>/download` |
| SHARE / UNSHARE | `PUT /api/files/<id>/sharing` |
| DELETE | `DELETE /api/files/<id>` |

## License

MIT
