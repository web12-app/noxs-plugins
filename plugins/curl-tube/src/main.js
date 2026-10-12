/*
 * Curl Tube — Noxs plugin (Developer Tools).
 *
 * Terminal client for a self-hosted "file cloud" service (the
 * api-curl-test-repo platform): accounts, resumable chunked uploads,
 * downloads, public share links and URL imports — all driven with curl
 * inside the Noxs guest. JSON responses are parsed here in the plugin,
 * long transfers run as a generated script in the background and stream
 * into the console.
 *
 * Default target is the owner's live tunnel, but the host is always taken
 * from the request file — only https hosts are allowed (plain http only
 * for localhost testing). Credentials live in the request file on this
 * device; create a dedicated account for your device.
 *
 * Files (inside the guest):
 *   ~/.noxs/curl-tube/request.txt    — user edited parameters
 *   ~/.noxs/curl-tube/session.jar    — cookie jar (chmod 600)
 *   ~/.noxs/curl-tube/push-state.txt — resumable upload state
 *   ~/.noxs/curl-tube/action.sh      — generated transfer script
 *   ~/.noxs/curl-tube/last-run.log   — live transfer output
 */

const PLUGIN_ID = 'curl-tube';
const PLUGIN_NAME = 'Curl Tube';
const VERSION = '0.1.0';
const ACCENT = '#38bdf8';
const BASE = '~/.noxs/' + PLUGIN_ID;
const REQ = BASE + '/request.txt';
const JAR = BASE + '/session.jar';
const STATE = BASE + '/push-state.txt';
const SCRIPT = BASE + '/action.sh';
const LOG = BASE + '/last-run.log';
const POLL_MS = 1500;
const CONSENT_MS = 2 * 60 * 1000;
const DEFAULT_HOST = 'https://precision-pledge-fled.ngrok-free.app';

const TOOLS = [
    { name: 'curl', probe: 'command -v curl' },
    { name: 'sha256sum', probe: 'command -v sha256sum' },
    { name: 'split', probe: 'command -v split' },
    { name: 'base64', probe: 'command -v base64' },
    { name: 'stat', probe: 'command -v stat' }
];
const APT_PACKAGES = ['curl', 'coreutils'];

const REQUEST_TEMPLATE = [
    '# curl-tube request — edit in the Noxs terminal',
    '# host: your file cloud base URL. https required;',
    '#       plain http is accepted only for localhost/127.0.0.1 testing.',
    'host=' + DEFAULT_HOST,
    '',
    '# Account used by LOGIN. Keep this on the device only;',
    '# a dedicated device account is recommended.',
    'username=',
    'password=',
    '',
    '# Absolute path of the file to PUSH.',
    'file=/root/example.zip',
    '',
    '# File id (32 hex chars) used by PULL / SHARE / UNSHARE / DELETE.',
    'id=',
    '',
    '# Optional output path for PULL (default: ./<id>.download).',
    'out=',
    '',
    '# Threshold (MB) above which PUSH switches to the resumable',
    '# chunked upload (per-piece SHA-256). Default 4.',
    'chunk=4',
    ''
].join('\n');

const HELP_TEXT = [
    'CURL TUBE — workflow',
    '--------------------',
    '1. CHECK TOOLS   verify curl/coreutils',
    '2. EDIT REQUEST  set host + account + file/id paths',
    '3. LOGIN         authenticate (session cookie kept 600)',
    '4. LIST / PUSH / PULL / SHARE / DELETE',
    '',
    'push   small files go as one multipart call; 4 MB and above',
    '       automatically use the resumable chunked upload with a',
    '       SHA-256 check on every piece. Re-running PUSH resumes',
    '       the same upload instead of starting over.',
    'fromurl lets the SERVER download a link into your cloud.',
    '',
    'Everything is plain curl against the documented REST API;',
    'only the host you put in the request file is contacted.',
    '',
    'State directory: ' + BASE
].join('\n');

const session = {
    noxs: null,
    handle: null,
    timer: null,
    pid: null,
    busy: false,
    consentAt: 0,
    pendingAction: null,
    pendingLabel: '',
    missing: []
};

// ---------------------------------------------------------------- helpers

function say(selector, text) {
    if (session.handle) {
        session.handle.setText(selector, text);
    }
}

function status(text) {
    say('#status', text);
}

function consoleOut(text) {
    say('#console', text);
}

function note(message) {
    if (session.noxs) {
        session.noxs.log(PLUGIN_ID + ': ' + message);
    }
}

/** Runs a guest command. Never rejects: failures come back as code -1. */
function exec(command) {
    return session.noxs.terminal.exec(command).then(
        function (r) {
            return {
                code: r && typeof r.exitCode === 'number' ? r.exitCode : -1,
                out: (r && r.stdout) || '',
                err: (r && r.stderr) || ''
            };
        },
        function (e) {
            return { code: -1, out: '', err: String(e) };
        }
    );
}

/** POSIX single-quote escape for values interpolated into shell scripts. */
function shq(value) {
    const q = String.fromCharCode(39);
    const bs = String.fromCharCode(92);
    return q + String(value).split(q).join(q + bs + q + q) + q;
}

/** UTF-8 safe base64 — moves script/JSON text into the guest safely. */
function b64of(text) {
    return btoa(unescape(encodeURIComponent(text)));
}

function humanSize(n) {
    if (!isFinite(n) || n < 0) return '?';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
}

function consentAlive() {
    return session.consentAt > 0 && (Date.now() - session.consentAt) < CONSENT_MS;
}

function disarm() {
    session.consentAt = 0;
    session.pendingAction = null;
    session.pendingLabel = '';
}

/** Parse an API envelope from curl stdout. */
function parseEnvelope(out) {
    let data;
    try {
        data = JSON.parse(out);
    } catch (e) {
        return { ok: false, code: 'BAD_JSON', message: String(out).slice(0, 300) || '(empty response)' };
    }
    if (data && data.success === true) return { ok: true, data: data.data };
    const err = (data && data.error) || {};
    return { ok: false, code: err.code || 'UNKNOWN', message: err.message || '(no message)' };
}

// ------------------------------------------------------------------- ui

function buildStyle() {
    return [
        "<style>",
        "  body { font-family: monospace; background: #0a0f14; color: #c9d6df;",
        "         padding: 12px; margin: 0; }",
        "  h1 { color: ' + ACCENT + '; font-size: 17px; margin: 0 0 2px;",
        "       letter-spacing: 0.5px; }",
        "  .ver { color: #5d7285; font-size: 11px; margin: 0 0 8px; }",
        "  .banner { border: 1px solid ' + ACCENT + '55; background: ' + ACCENT + '14;",
        "            color: ' + ACCENT + '; font-size: 11px; padding: 7px 9px;",
        "            border-radius: 6px; margin-bottom: 8px; line-height: 1.45; }",
        "  #status { font-size: 12px; color: #fbbf24; min-height: 30px;",
        "            margin: 6px 0; line-height: 1.4; }",
        "  button { background: #131c26; color: #c9d6df; border: 1px solid #2c3a49;",
        "           border-radius: 6px; padding: 8px 10px; margin: 3px 3px 3px 0;",
        "           font-family: monospace; font-size: 11px; }",
        "  button:active { background: #1d2935; }",
        "  #console { background: #060a0e; border: 1px solid #1e2a36;",
        "             border-radius: 6px; padding: 10px; font-size: 11px;",
        "             line-height: 1.5; white-space: pre-wrap; word-break: break-all;",
        "             min-height: 220px; max-height: 320px; overflow-y: auto;",
        "             color: #9fb3c0; }",
        "  .foot { color: #5d7285; font-size: 10px; margin-top: 8px; line-height: 1.5; }",
        "</style>"
    ].join('\n');
}

function buildHtml() {
    return [
        "<h1>' + PLUGIN_NAME + '</h1>",
        "<p class=\"ver\">v' + VERSION + ' — Noxs Developer Tools</p>",
        "<div class=\"banner\">YOUR CLOUD, YOUR ACCOUNT — the plugin talks only to the",
        "host in the request file with your own credentials. Use a dedicated",
        "device account. Shares/links you create are public to anyone holding",
        "the URL.</div>",
        "<div id=\"status\"></div>",
        "<button id=\"check\">CHECK TOOLS</button>",
        "<button id=\"install\">INSTALL TOOLS</button>",
        "<button id=\"request\">EDIT REQUEST</button>",
        "<button id=\"show\">SHOW REQUEST</button>",
        "<button id=\"login\">LOGIN</button>",
        "<button id=\"me\">WHOAMI</button>",
        "<button id=\"logout\">LOGOUT</button>",
        "<button id=\"list\">LIST FILES</button>",
        "<button id=\"push\">PUSH</button>",
        "<button id=\"pull\">PULL</button>",
        "<button id=\"share\">SHARE</button>",
        "<button id=\"unshare\">UNSHARE</button>",
        "<button id=\"del\">DELETE</button>",
        "<button id=\"stop\">STOP</button>",
        "<pre id=\"console\"></pre>",
        "<p class=\"foot\">Request: ' + REQ + '<br>Session: ' + JAR + '<br>",
        "Live log: ' + LOG + '<br>Transfers keep running in the guest if you",
        "close this window — press STOP to cancel.</p>"
    ].join('\n');
}

// ------------------------------------------------- request parsing

function parseRequest(text) {
    const v = {};
    const lines = String(text).split(/\r?\n/);
    for (const line of lines) {
        const m = /^\s*([a-z_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m && m[1]) v[m[1]] = m[2];
    }
    // host: https everywhere; plain http only for loopback testing
    const host = String(v.host || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[a-z0-9.-]+(:[0-9]{1,5})?$/i.test(host)) {
        return { ok: false, error: 'host must look like https://your-host.example (no path, no credentials in the URL)' };
    }
    const isLoopback = /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/i.test(host);
    if (!/^https:\/\//i.test(host) && !isLoopback) {
        return { ok: false, error: 'only https:// hosts are allowed (plain http is accepted for localhost testing only)' };
    }
    if (host.length > 200 || /[\s@<>"'\\]/.test(host)) {
        return { ok: false, error: 'host contains characters that are not allowed' };
    }
    v.host = host;
    if (v.username && v.username.length > 80) return { ok: false, error: 'username too long' };
    if (v.password && v.password.length > 200) return { ok: false, error: 'password too long' };
    if (v.id && !/^[a-f0-9]{32}$/.test(v.id)) {
        return { ok: false, error: "id must be 32 hex characters (see LIST FILES)" };
    }
    const chunk = parseInt(v.chunk, 10);
    if (!isFinite(chunk) || chunk < 1 || chunk > 64) {
        return { ok: false, error: 'chunk must be 1-64 (MB)' };
    }
    v.chunk = chunk;
    if (v.file && (v.file.indexOf('"') !== -1 || v.file.indexOf("'") !== -1)) {
        return { ok: false, error: 'file path must not contain quotes' };
    }
    return { ok: true, values: v };
}

/** Load + validate the request file; prints errors and returns null on failure. */
function loadRequest() {
    return exec('cat ' + REQ + ' 2>/dev/null || echo __MISSING__').then(function (r) {
        if (r.out.trim() === '__MISSING__') {
            status('No request file — press EDIT REQUEST first.');
            return null;
        }
        const parsed = parseRequest(r.out);
        if (!parsed.ok) {
            status('Invalid request: ' + parsed.error);
            consoleOut('REQUEST ERROR\n' + parsed.error + '\n\nCurrent request:\n' + r.out);
            return null;
        }
        return parsed.values;
    });
}

// ------------------------------------------------------ foreground API

/** One quick authenticated API call; returns the parsed envelope. */
function apiCall(cfg, method, apiPath, bodyJson) {
    const parts = [
        'curl -q -sS --max-time 25',
        '-b ' + JAR,
        "-H " + shq('ngrok-skip-browser-warning: 1')
    ];
    if (method !== 'GET') {
        parts.push("-H " + shq('X-Requested-With: fetch'));
    }
    if (bodyJson) {
        parts.push("-H " + shq('Content-Type: application/json'));
        parts.push('--data ' + shq(bodyJson));
    }
    parts.push('-X ' + method);
    parts.push(shq(cfg.host + apiPath));
    return exec(parts.join(' ')).then(function (r) {
        if (r.code !== 0 && !r.out) {
            return { ok: false, code: 'CURL_FAILED', message: (r.err || 'curl failed').slice(0, 300) };
        }
        return parseEnvelope(r.out);
    });
}

function fmtError(env) {
    return '[' + env.code + '] ' + env.message;
}

// ------------------------------------------------------------- actions

function onCheck() {
    if (session.busy) return;
    status('Checking tools…');
    const missing = [];
    let chain = Promise.resolve();
    TOOLS.forEach(function (tool) {
        chain = chain.then(function () {
            return exec(tool.probe + ' >/dev/null 2>&1 && echo OK || echo NO');
        }).then(function (r) {
            const ok = r.out.trim().indexOf('OK') === 0;
            if (!ok) missing.push(tool);
        });
    });
    return chain.then(function () {
        session.missing = missing;
        let report = 'TOOL CHECK\n---------\n';
        TOOLS.forEach(function (tool) {
            const hit = missing.indexOf(tool) === -1;
            report += (hit ? '[ok]      ' : '[MISSING] ') + tool.name + '\n';
        });
        if (missing.length > 0) {
            report += '\nMissing tools can be installed with INSTALL TOOLS\n';
            report += '(runs: apt-get install ' + APT_PACKAGES.join(' ') + ')';
            status(missing.length + ' tool(s) missing — review the plan, then INSTALL TOOLS.');
        } else {
            status('All tools present.');
        }
        consoleOut(report);
        note('tool check: ' + (missing.length ? missing.length + ' missing' : 'all present'));
    });
}

function onInstall() {
    if (session.busy) return;
    status('Installing tools (this can take a minute)…');
    session.busy = true;
    const cmd = 'apt-get update -qq && apt-get install -y ' + APT_PACKAGES.join(' ');
    return exec(cmd).then(function (r) {
        session.busy = false;
        if (r.code === 0) {
            status('Install finished — run CHECK TOOLS to verify.');
            consoleOut('INSTALL OK\n' + r.out.slice(-1200));
        } else {
            status('Install failed (code ' + r.code + '). See console.');
            consoleOut('INSTALL FAILED\n' + (r.err || r.out).slice(-1200));
        }
    });
}

function onRequest() {
    if (session.busy) return;
    return exec('mkdir -p ' + BASE).then(function () {
        return exec('test -f ' + REQ + ' && echo YES || echo NO');
    }).then(function (r) {
        if (r.out.trim().indexOf('YES') === 0) {
            status('Request file exists — press SHOW REQUEST to view it.');
            consoleOut('Request file already exists:\n  ' + REQ + '\n\nEdit it in the Noxs terminal, e.g.:\n  nano ' + REQ + '\n\nTo start over: rm ' + REQ + ' and press EDIT REQUEST again.');
            return null;
        }
        return exec('printf %s ' + shq(b64of(REQUEST_TEMPLATE)) + ' | base64 -d > ' + REQ)
            .then(function (w) {
                if (w.code !== 0) {
                    status('Could not write the request file.');
                    consoleOut('write failed:\n' + (w.err || w.out));
                    return null;
                }
                status('Request file created — edit it in the Noxs terminal.');
                consoleOut('Created ' + REQ + '\n\n' + REQUEST_TEMPLATE + '\nOpen it in the Noxs terminal:\n  nano ' + REQ);
            });
    });
}

function onShow() {
    if (session.busy) return;
    return exec('cat ' + REQ + ' 2>/dev/null || echo __MISSING__').then(function (r) {
        if (r.out.trim() === '__MISSING__') {
            status('No request file yet — press EDIT REQUEST.');
            return null;
        }
        status('Request file contents:');
        consoleOut(REQ + '\n\n' + r.out);
    });
}

function onLogin() {
    if (session.busy) return;
    return loadRequest().then(function (cfg) {
        if (!cfg) return null;
        if (!cfg.username || !cfg.password) {
            status('No credentials — set username/password in the request file.');
            return null;
        }
        status('Logging in to ' + cfg.host + ' …');
        const body = JSON.stringify({ username: cfg.username, password: cfg.password });
        return exec('mkdir -p ' + BASE + ' && touch ' + JAR + ' && chmod 600 ' + JAR).then(function () {
            return apiCall(cfg, 'POST', '/api/login', body);
        }).then(function (env) {
            if (!env.ok) {
                status('Login failed — ' + fmtError(env));
                consoleOut('LOGIN FAILED\n' + fmtError(env) + '\n\nCheck username/password in ' + REQ);
                return null;
            }
            const user = (env.data && env.data.user) || {};
            status('Logged in as ' + (user.username || '?') + '.');
            consoleOut('LOGIN OK\n  user: ' + (user.username || '?') + '\n  id:   ' + (user.id || '?') + '\n  host: ' + cfg.host + '\n\nSession cookie: ' + JAR + ' (chmod 600)');
            note('login ok: ' + (user.username || '?'));
        });
    });
}

function onMe() {
    if (session.busy) return;
    return loadRequest().then(function (cfg) {
        if (!cfg) return null;
        status('Checking session…');
        return apiCall(cfg, 'GET', '/api/me').then(function (env) {
            if (!env.ok) {
                status('Not signed in — ' + fmtError(env));
                consoleOut('WHOAMI\n' + fmtError(env) + '\n\nPress LOGIN first.');
                return null;
            }
            const user = (env.data && env.data.user) || null;
            if (!user) {
                status('Not signed in — press LOGIN.');
                consoleOut('WHOAMI\nsigned out on ' + cfg.host);
                return null;
            }
            status('Signed in as ' + user.username + '.');
            consoleOut('WHOAMI\n  host: ' + cfg.host + '\n  user: ' + user.username + '\n  id:   ' + user.id);
        });
    });
}

function onLogout() {
    if (session.busy) return;
    return loadRequest().then(function (cfg) {
        if (!cfg) return null;
        status('Logging out…');
        return apiCall(cfg, 'POST', '/api/logout').then(function (env) {
            const msg = env.ok ? 'Logged out.' : 'Server said: ' + fmtError(env);
            return exec('rm -f ' + JAR).then(function () {
                status(msg + ' Local session removed.');
                consoleOut('LOGOUT\n' + msg);
            });
        });
    });
}

function onList() {
    if (session.busy) return;
    return loadRequest().then(function (cfg) {
        if (!cfg) return null;
        status('Listing files…');
        return apiCall(cfg, 'GET', '/api/files').then(function (env) {
            if (!env.ok) {
                status('List failed — ' + fmtError(env));
                consoleOut('LIST FAILED\n' + fmtError(env) + '\n\nIf this is 401, press LOGIN first.');
                return null;
            }
            const files = (env.data && env.data.files) || [];
            const quota = (env.data && env.data.quota) || {};
            let report = 'FILES on ' + cfg.host + '\n';
            report += 'quota: ' + (quota.count || 0) + ' files, ' + humanSize(quota.usedBytes || 0) + ' used\n';
            report += '---\n';
            if (!files.length) {
                report += '(no files yet — PUSH uploads one)';
            }
            files.forEach(function (f) {
                report += f.id + '  ' + humanSize(f.size) + '  ' + (f.category || '?') + '  ' +
                    (f.visibility === 'public' ? 'PUBLIC' : 'private') + '  ' + (f.name || '?') + '\n';
            });
            status(files.length + ' file(s).');
            consoleOut(report);
            note('list: ' + files.length + ' files');
        });
    });
}

// --------------------------------------------------- generated scripts

function shHeader() {
    return [
        '#!/bin/sh',
        '# curl-tube transfer — generated by the plugin, do not edit',
        'DIR="$HOME/.noxs/curl-tube"',
        'mkdir -p "$DIR/pieces"',
        'chmod 700 "$DIR"',
        'JAR="$DIR/session.jar"',
        '[ -f "$JAR" ] || : > "$JAR"',
        'chmod 600 "$JAR"',
        ''
    ].join('\n');
}

function curlBase() {
    // -q: ignore any ~/.curlrc (must be the first flag); jar + ngrok bypass on every call
    return 'curl -q -sS -b "$JAR" -H ' + shq('ngrok-skip-browser-warning: 1');
}

function uuidLine() {
    return "cat /proc/sys/kernel/random/uuid 2>/dev/null || (od -An -N16 -tx1 /dev/urandom | tr -d ' \\n' | sed 's/^\\(........\\)\\(....\\)\\(....\\)\\(....\\)\\(............\\)$/\\1-\\2-\\3-\\4-\\5/')";
}

/**
 * Builds the background PUSH script. initBody/share of JSON is prepared
 * here in JS (valid JSON.stringify output) and passed via base64.
 */
function buildPushScript(cfg, fileAbs, sizeBytes) {
    const threshold = cfg.chunk * 1024 * 1024;
    const baseName = String(fileAbs).split('/').pop() || 'file';
    const L = [];
    L.push(shHeader());
    L.push('HOST=' + shq(cfg.host));
    L.push('FILE=' + shq(fileAbs));
    L.push('THRESHOLD=' + threshold);
    L.push('SIZE=' + sizeBytes);
    L.push('STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)');
    L.push('echo "== curl-tube push =="');
    L.push('echo "file: $FILE ($SIZE bytes)"');
    L.push('echo "host: $HOST"');
    L.push('echo "time: $STAMP"');
    L.push('echo');
    L.push('if [ ! -f "$FILE" ]; then echo "ERROR: file not found: $FILE"; echo "CURL_TUBE_DONE exit=1"; exit 1; fi');
    L.push('if [ "$SIZE" -gt 2147483647 ]; then echo "ERROR: over the 2 GB ceiling"; echo "CURL_TUBE_DONE exit=1"; exit 1; fi');
    // uploadId: reuse state for resume, else create fresh
    L.push('OLDID=""; OLDNAME=""; OLDSIZE=""');
    L.push('if [ -f "$DIR/push-state.txt" ]; then');
    L.push('  OLDID=$(sed -n \'s/^uploadId=//p\' "$DIR/push-state.txt" | head -1)');
    L.push('  OLDNAME=$(sed -n \'s/^name=//p\' "$DIR/push-state.txt" | head -1)');
    L.push('  OLDSIZE=$(sed -n \'s/^size=//p\' "$DIR/push-state.txt" | head -1)');
    L.push('fi');
    L.push('NAME=' + shq(baseName));
    L.push('if [ "$OLDNAME" = "$NAME" ] && [ "$OLDSIZE" = "$SIZE" ] && printf %s "$OLDID" | grep -qE \'^[0-9a-f-]{36}$\'; then');
    L.push('  UPLOADID="$OLDID"; echo "resuming uploadId $UPLOADID"');
    L.push('else');
    L.push('  UPLOADID=$(' + uuidLine() + ')');
    L.push('  printf \'uploadId=%s\\nname=%s\\nsize=%s\\n\' "$UPLOADID" "$NAME" "$SIZE" > "$DIR/push-state.txt"');
    L.push('  rm -rf "$DIR/pieces"; mkdir -p "$DIR/pieces"');
    L.push('  echo "new uploadId $UPLOADID"');
    L.push('fi');
    L.push('RC=1');
    L.push('RESULT_ID=""');
    L.push('if [ "$SIZE" -lt ' + threshold + ' ]; then');
    L.push('  echo "mode: single multipart upload"');
    L.push('  CODE=$(curl -q -sS -b "$JAR" -H ' + shq('X-Requested-With: fetch') + ' -H ' + shq('ngrok-skip-browser-warning: 1') + ' \\');
    L.push('    -F "uploadId=$UPLOADID" -F "file=@$FILE" -o "$DIR/resp.json" -w \'%{http_code}\' "$HOST/api/files/upload")');
    L.push('  echo "upload http=$CODE"');
    L.push('  case "$CODE" in');
    L.push('    200|201)');
    L.push('      RESULT_ID=$(grep -o \'"id":"[a-f0-9]\\{32\\}"\' "$DIR/resp.json" | head -1 | grep -o \'[a-f0-9]\\{32\\}\')');
    L.push('      echo "stored: $RESULT_ID"');
    L.push('      RC=0 ;;');
    L.push('    *)');
    L.push('      echo "upload failed:"; head -c 400 "$DIR/resp.json"; echo ;;');
    L.push('  esac');
    L.push('else');
    L.push('  echo "mode: resumable chunked upload"');
    L.push('  printf %s ' + shq(b64of(JSON.stringify({ name: baseName, size: sizeBytes, uploadId: '__UPLOADID__' }))) + ' | base64 -d > "$DIR/init-body.json"');
    L.push('  sed -i "s/__UPLOADID__/$UPLOADID/" "$DIR/init-body.json"');
    L.push('  INIT_RESP=$(' + curlBase() + ' -H ' + shq('X-Requested-With: fetch') + ' -H ' + shq('Content-Type: application/json') + ' --data @"$DIR/init-body.json" "$HOST/api/uploads/init")');
    L.push('  SESS=$(printf %s "$INIT_RESP" | sed -n \'s/.*"session":{//p\' | head -c 900)');
    L.push('  SID=$(printf %s "$SESS" | grep -o \'"id":"[a-f0-9]\\{32\\}"\' | head -1 | grep -o \'[a-f0-9]\\{32\\}\')');
    L.push('  CHUNK=$(printf %s "$SESS" | grep -o \'"chunkBytes":[0-9]*\' | head -1 | grep -o \'[0-9]*\')');
    L.push('  RECV=$(printf %s "$SESS" | sed -n \'s/.*"received":\\[\\([^]]*\\)\\].*/\\1/p\' | tr -d \' \' | tr -cd \'0-9,\')');
    L.push('  if [ -z "$SID" ] || [ -z "$CHUNK" ] || [ "$CHUNK" -lt 1 ]; then');
    L.push('    echo "init failed:"; printf %s "$INIT_RESP" | head -c 400; echo');
    L.push('    echo "CURL_TUBE_DONE exit=1"; exit 1');
    L.push('  fi');
    L.push('  echo "session $SID chunk=$CHUNK received=[${RECV}]"');
    L.push('  rm -rf "$DIR/pieces"; mkdir -p "$DIR/pieces"');
    L.push('  split -b "$CHUNK" -d -a 4 -- "$FILE" "$DIR/pieces/piece-" || { echo "split failed"; echo "CURL_TUBE_DONE exit=1"; exit 1; }');
    L.push('  TOTAL=$(ls "$DIR"/pieces/piece-* 2>/dev/null | wc -l)');
    L.push('  echo "pieces: $TOTAL"');
    L.push('  IDX=0');
    L.push('  for PIECE in "$DIR"/pieces/piece-*; do');
    L.push('    N=$(basename "$PIECE" | sed \'s/^piece-//\')');
    L.push('    IDX=$(expr "$N" + 0)');
    L.push('    case ",$RECV," in *",$IDX,"*) echo "piece $IDX already stored, skipping"; continue ;; esac');
    L.push('    HASH=$(sha256sum "$PIECE" | cut -d\' \' -f1)');
    L.push('    OK=no');
    L.push('    for ATTEMPT in 1 2; do');
    L.push('      CODE=$(curl -q -sS -b "$JAR" -H ' + shq('X-Requested-With: fetch') + ' -H ' + shq('Content-Type: application/octet-stream') + ' -H "X-Chunk-Sha256: $HASH" --data-binary @"$PIECE" -o "$DIR/resp.json" -w \'%{http_code}\' "$HOST/api/uploads/$SID/chunks/$IDX")');
    L.push('      case "$CODE" in 200|201) OK=yes; break ;; *) echo "piece $IDX http=$CODE (attempt $ATTEMPT)"; sleep 2 ;; esac');
    L.push('    done');
    L.push('    if [ "$OK" != "yes" ]; then echo "ERROR: piece $IDX failed twice — rerun PUSH to resume"; echo "CURL_TUBE_DONE exit=1"; exit 1; fi');
    L.push('    echo "piece $((IDX+1))/$TOTAL ok"');
    L.push('  done');
    L.push('  COMPLETE=$(' + curlBase() + ' -H ' + shq('X-Requested-With: fetch') + ' -X POST "$HOST/api/uploads/$SID/complete")');
    L.push('  if printf %s "$COMPLETE" | grep -q \'"success":true\'; then');
    L.push('    RESULT_ID=$(printf %s "$COMPLETE" | grep -o \'"id":"[a-f0-9]\\{32\\}"\' | head -1 | grep -o \'[a-f0-9]\\{32\\}\')');
    L.push('    echo "stored: $RESULT_ID"');
    L.push('    RC=0');
    L.push('  else');
    L.push('    echo "complete failed:"; printf %s "$COMPLETE" | head -c 400; echo');
    L.push('  fi');
    L.push('fi');
    L.push('rm -rf "$DIR/pieces" 2>/dev/null');
    L.push('if [ "$RC" = "0" ]; then echo "CURL_TUBE_RESULT: $RESULT_ID"; fi');
    L.push('echo "CURL_TUBE_DONE exit=$RC"');
    L.push('exit $RC');
    return L.join('\n') + '\n';
}

function buildPullScript(cfg, id, outPath) {
    const L = [];
    L.push(shHeader());
    L.push('HOST=' + shq(cfg.host));
    L.push('ID=' + shq(id));
    L.push('OUT=' + shq(outPath));
    L.push('echo "== curl-tube pull =="');
    L.push('echo "id: $ID"');
    L.push('echo "out: $OUT"');
    L.push('echo');
    L.push('CODE=$(curl -q -sS -b "$JAR" -H ' + shq('ngrok-skip-browser-warning: 1') + ' -o "$OUT" -w \'%{http_code}\' "$HOST/api/files/$ID/download")');
    L.push('echo "download http=$CODE"');
    L.push('RC=1');
    L.push('if [ "$CODE" = "200" ] && [ -f "$OUT" ]; then');
    L.push('  echo "saved: $OUT ($(wc -c < "$OUT" | tr -d \' \') bytes)"');
    L.push('  RC=0');
    L.push('else');
    L.push('  echo "pull failed (http $CODE) — check LOGIN and the id from LIST FILES"');
    L.push('  rm -f "$OUT"');
    L.push('fi');
    L.push('echo "CURL_TUBE_DONE exit=$RC"');
    L.push('exit $RC');
    return L.join('\n') + '\n';
}

// --------------------------------------------------- run/poll machinery

function launch(script, kind) {
    status('Starting ' + kind + '…');
    const writeCmd = 'mkdir -p ' + BASE + ' && printf %s ' + shq(b64of(script)) +
        ' | base64 -d > ' + SCRIPT + ' && chmod 700 ' + SCRIPT;
    return exec(writeCmd).then(function (w) {
        if (w.code !== 0) {
            status('Could not write the ' + kind + ' script.');
            consoleOut('write failed:\n' + (w.err || w.out));
            return null;
        }
        return exec(SCRIPT + ' > ' + LOG + ' 2>&1 & echo $!');
    }).then(function (l) {
        const pid = parseInt(l.out.trim(), 10);
        if (!pid || pid < 1) {
            status('Could not start the ' + kind + ' (no pid). See console.');
            consoleOut('start failed:\n' + (l.err || l.out));
            return null;
        }
        session.pid = pid;
        session.busy = true;
        status('Running (pid ' + pid + ') — output streams below. STOP cancels.');
        consoleOut('started ' + kind + ', pid ' + pid + '\n');
        session.timer = setInterval(poll, POLL_MS);
        poll();
    });
}

function poll() {
    if (!session.pid) return;
    return exec('if kill -0 ' + session.pid + ' 2>/dev/null; then echo ALIVE; else echo DEAD; fi')
        .then(function (a) {
            const alive = a.out.trim().indexOf('ALIVE') === 0;
            return exec('tail -c 3600 ' + LOG + ' 2>/dev/null').then(function (t) {
                consoleOut(t.out || '(no output yet)');
                if (!alive) {
                    finishRun(t.out || '');
                }
            });
        });
}

function finishRun(tail) {
    clearInterval(session.timer);
    session.timer = null;
    session.pid = null;
    session.busy = false;
    let exit = '?';
    const m = /CURL_TUBE_DONE exit=(-?[0-9]+)/.exec(tail);
    if (m) exit = m[1];
    const saved = /CURL_TUBE_RESULT: ([a-f0-9]{32})/.exec(tail);
    if (exit === '0') {
        status('Finished OK.' + (saved ? ' File id: ' + saved[1] + ' (use it for PULL/SHARE).' : ''));
    } else if (exit === '?') {
        status('Process ended (no exit marker) — see log: ' + LOG);
    } else {
        status('Finished with problems (exit ' + exit + ') — see log: ' + LOG);
    }
    note('transfer finished, exit ' + exit);
}

// ------------------------------------------------- transfer actions

function onPush() {
    if (session.busy) return;
    return loadRequest().then(function (cfg) {
        if (!cfg) return null;
        if (!cfg.file) {
            status('No file set — put file=/abs/path in the request file.');
            return null;
        }
        status('Inspecting file…');
        return exec('test -f ' + shq(cfg.file) + ' && stat -c %s ' + shq(cfg.file) + ' 2>/dev/null || echo MISSING').then(function (r) {
            const out = r.out.trim();
            if (out === 'MISSING' || !/^[0-9]+$/.test(out)) {
                status('File not found: ' + cfg.file);
                consoleOut('PUSH aborted\n  file not found (or unreadable): ' + cfg.file + '\n\nSet file= in ' + REQ + ' to an absolute path inside the guest.');
                return null;
            }
            const size = parseInt(out, 10);
            const script = buildPushScript(cfg, cfg.file, size);
            consoleOut('PUSH\n  file: ' + cfg.file + ' (' + humanSize(size) + ')\n  host: ' + cfg.host + '\n  mode: ' + (size < cfg.chunk * 1024 * 1024 ? 'single multipart' : 'resumable chunked (per-piece SHA-256)') + '\n');
            return launch(script, 'push');
        });
    });
}

function onPull() {
    if (session.busy) return;
    return loadRequest().then(function (cfg) {
        if (!cfg) return null;
        if (!cfg.id) {
            status('No id set — copy one from LIST FILES into id=.');
            return null;
        }
        const out = cfg.out || ('./' + cfg.id + '.download');
        const script = buildPullScript(cfg, cfg.id, out);
        return launch(script, 'pull');
    });
}

function onShare() {
    return shareToggle('PUT', true);
}

function onUnshare() {
    return shareToggle('PUT', false);
}

function shareToggle(_method, makePublic) {
    if (session.busy) return;
    return loadRequest().then(function (cfg) {
        if (!cfg) return null;
        if (!cfg.id) {
            status('No id set — copy one from LIST FILES into id=.');
            return null;
        }
        status((makePublic ? 'Sharing' : 'Unsharing') + ' ' + cfg.id + ' …');
        return apiCall(cfg, 'PUT', '/api/files/' + cfg.id + '/sharing', JSON.stringify({ public: makePublic })).then(function (env) {
            if (!env.ok) {
                status((makePublic ? 'Share' : 'Unshare') + ' failed — ' + fmtError(env));
                consoleOut((makePublic ? 'SHARE' : 'UNSHARE') + ' FAILED\n' + fmtError(env));
                return null;
            }
            const f = (env.data && env.data.file) || {};
            if (makePublic) {
                const url = cfg.host + (f.sharePath || '');
                status('Public link ready.');
                consoleOut('SHARE OK\n  file: ' + (f.name || cfg.id) + '\n  url:  ' + url + '\n\nAnyone with this URL can open/download the file.\nTurn it off any time with UNSHARE.');
                note('shared ' + cfg.id);
            } else {
                status('Link disabled.');
                consoleOut('UNSHARE OK\n  file ' + (f.name || cfg.id) + ' is private again.');
                note('unshared ' + cfg.id);
            }
        });
    });
}

function onDelArm() {
    if (session.busy) return;
    arm('delete', 'DELETE the file in id= (cannot be undone)');
}

function onDelete() {
    if (session.busy) return;
    return loadRequest().then(function (cfg) {
        if (!cfg) return null;
        if (!cfg.id) {
            status('No id set — copy one from LIST FILES into id=.');
            return null;
        }
        status('Deleting ' + cfg.id + ' …');
        return apiCall(cfg, 'DELETE', '/api/files/' + cfg.id).then(function (env) {
            if (!env.ok) {
                status('Delete failed — ' + fmtError(env));
                consoleOut('DELETE FAILED\n' + fmtError(env));
                return null;
            }
            status('Deleted ' + cfg.id + '.');
            consoleOut('DELETE OK\n  ' + cfg.id + ' removed from the cloud (share link now dead).');
            note('deleted ' + cfg.id);
        });
    });
}

function onStop() {
    if (!session.pid) {
        status('Nothing is running.');
        return Promise.resolve(null);
    }
    const pid = session.pid;
    clearInterval(session.timer);
    session.timer = null;
    session.pid = null;
    session.busy = false;
    return exec('kill ' + pid + ' 2>/dev/null; sleep 1; kill -9 ' + pid + ' 2>/dev/null; echo stopped')
        .then(function () {
            status('Stopped (pid ' + pid + '). Partial log kept at ' + LOG);
            note('stopped pid ' + pid);
        });
}

function arm(action, label) {
    if (consentAlive() && session.pendingAction === action) {
        disarm();
        if (action === 'delete') {
            return onDelete();
        }
        return Promise.resolve(null);
    }
    session.consentAt = Date.now();
    session.pendingAction = action;
    session.pendingLabel = label;
    status('CONFIRM: ' + label + ' — press the same button again within 2 minutes.');
    consoleOut('CONSENT REQUIRED\n============\nAction : ' + label + '\n\nPress the same button again to confirm.');
    note('armed: ' + action);
    return Promise.resolve(null);
}

// --------------------------------------------------------------- export

export default {
    activate: function (noxs) {
        session.noxs = noxs;
        noxs.log(PLUGIN_NAME + ' activated');
        session.handle = noxs.ui.createWindow({
            id: PLUGIN_ID,
            title: PLUGIN_NAME,
            width: 460,
            height: 700
        });
        session.handle.setHTML(buildStyle() + buildHtml());
        session.handle.on('check', onCheck);
        session.handle.on('install', onInstall);
        session.handle.on('request', onRequest);
        session.handle.on('show', onShow);
        session.handle.on('login', onLogin);
        session.handle.on('me', onMe);
        session.handle.on('logout', onLogout);
        session.handle.on('list', onList);
        session.handle.on('push', onPush);
        session.handle.on('pull', onPull);
        session.handle.on('share', onShare);
        session.handle.on('unshare', onUnshare);
        session.handle.on('del', onDelArm);
        session.handle.on('stop', onStop);
        session.handle.show();
        status('Ready — CHECK TOOLS, then EDIT REQUEST (host + account).');
        consoleOut(HELP_TEXT);
    },

    deactivate: function () {
        if (session.timer) {
            clearInterval(session.timer);
            session.timer = null;
        }
        if (session.handle) {
            try { session.handle.close(); } catch (e) { /* already gone */ }
            session.handle = null;
        }
        session.noxs = null;
    }
};
