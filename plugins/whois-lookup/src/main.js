/*
 * Whois Lookup — Noxs security plugin (Security Tools).
 *
 * Authorized-use tooling: the window shows an ethics banner, every run
 * requires a two-press consent (2 minute window), scans are rate-limited
 * by default and all parameters live in a request file the user edits in
 * the Noxs terminal (the Plugin API has no form-input channel).
 *
 * Permission map (enforced by the Noxs host):
 *   ui        -> noxs.ui.createWindow (this window)
 *   terminal  -> noxs.terminal.exec (tool checks, scans, log polling)
 *
 * Files (inside the guest):
 *   ~/.noxs/whois-lookup/request.txt   — user edited parameters
 *   ~/.noxs/whois-lookup/scan.sh       — generated scan script (never hand-edited)
 *   ~/.noxs/whois-lookup/last-run.log  — live scan output
 *   ~/.noxs/whois-lookup/results-*.txt — saved results (where applicable)
 */

const PLUGIN_ID = 'whois-lookup';
const PLUGIN_NAME = 'Whois Lookup';
const ACCENT = '#60a5fa';
const BASE = '~/.noxs/' + PLUGIN_ID;
const REQ = BASE + '/request.txt';
const SCAN = BASE + '/scan.sh';
const LOG = BASE + '/last-run.log';
const POLL_MS = 1500;
const CONSENT_MS = 2 * 60 * 1000;

const TOOLS = [
    {
        "name": "whois",
        "probe": "command -v whois"
    }
];
const APT_PACKAGES = ["whois"];
const HELP_TEXT = "WHOIS LOOKUP — workflow\n-----------------------\n1. CHECK TOOLS      verify whois exists\n2. EDIT REQUEST     set the domain\n3. RUN x2           two presses = consent, then the lookup runs\n\nOne whois query per run, then extracts the interesting\nfields: registrar, key dates, status flags, nameservers.\nThe raw record (first 60 lines) is included for context.\n\nThe full raw record is saved to ~/.noxs/whois-lookup/results-*.txt";

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

/** UTF-8 safe base64 — used to move script text into the guest safely. */
function b64of(text) {
    return btoa(unescape(encodeURIComponent(text)));
}

function consentAlive() {
    return session.consentAt > 0 && (Date.now() - session.consentAt) < CONSENT_MS;
}

function disarm() {
    session.consentAt = 0;
    session.pendingAction = null;
    session.pendingLabel = '';
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
        "<p class=\"ver\">v' + VERSION + ' — Noxs Security Tools</p>",
        "<div class=\"banner\">AUTHORIZED USE ONLY — run this against systems you",
        "own or have written permission to test. Scans are polite by default",
        "(delays between requests). You are responsible for compliance with",
        "local laws and target policies.</div>",
        "<div id=\"status\"></div>",
        "<button id=\"check\">CHECK TOOLS</button>",
        "<button id=\"install\">INSTALL TOOLS</button>",
        "<button id=\"request\">EDIT REQUEST</button>",
        "<button id=\"show\">SHOW REQUEST</button>",
        "<button id=\"arm\">RUN</button>",
        "<button id=\"stop\">STOP</button>",
        "<pre id=\"console\"></pre>",
        "<p class=\"foot\">Request file: ' + REQ",
        "Live log: ' + LOG + '<br>Scans keep running in the guest if you close",
        "this window — press STOP to cancel.</p>"
    ].join('\n');
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
            return null;
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
    arm('install', 'install: apt-get install ' + APT_PACKAGES.join(' '));
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

function onArm() {
    if (session.busy) return;
    arm('run', 'run scan');
}

function arm(action, label) {
    if (consentAlive() && session.pendingAction === action) {
        disarm();
        if (action === 'run') {
            return startRun();
        }
        return startInstall();
    }
    session.consentAt = Date.now();
    session.pendingAction = action;
    session.pendingLabel = label;
    status('CONFIRM: ' + label + ' — press the same button again within 2 minutes.');
    consoleOut('CONSENT REQUIRED\n============\nAction : ' + label,
        );
    note('armed: ' + action);
    return Promise.resolve(null);
}

function startInstall() {
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

function startRun() {
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
        const guard = TOOLS.map(function (t) {
            return 'if ! ' + t.probe + ' >/dev/null 2>&1; then echo "ERROR: missing tool: ' + t.name + ' — run CHECK TOOLS + INSTALL TOOLS first"; echo "NOXS_SCAN_DONE exit=1"; exit 1; fi';
        }).join('\n');
        const script = guard + '\n\n' + buildScan(parsed.values);
        return launch(script, 'scan');
    });
}

function launch(script, kind) {
    status('Starting ' + kind + '…');
    const writeCmd = 'mkdir -p ' + BASE + ' && printf %s ' + shq(b64of(script)) +
        ' | base64 -d > ' + SCAN + ' && chmod 700 ' + SCAN;
    return exec(writeCmd).then(function (w) {
        if (w.code !== 0) {
            status('Could not write the ' + kind + ' script.');
            consoleOut('write failed:\n' + (w.err || w.out));
            return null;
        }
        return exec(SCAN + ' > ' + LOG + ' 2>&1 & echo $!');
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
    let exit = '?'
    const m = /NOXS_.*_DONE exit=(-?[0-9]+)/.exec(tail);
    if (m) exit = m[1];
    const saved = /NOXS_SAVED: (.+)/.exec(tail);
    if (exit === '0') {
        status('Finished OK.' + (saved ? ' Results: ' + saved[1].trim() : ' See log: ' + LOG));
    } else if (exit === '?') {
        status('Process ended (no exit marker) — see log: ' + LOG);
    } else {
        status('Finished with problems (exit ' + exit + ') — see log: ' + LOG);
    }
    note('run finished, exit ' + exit);
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

// ------------------------------------------------- request + scan

function parseRequest(text) {
    const v = {};
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const m = /^\s*([a-z_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m && m[1]) v[m[1]] = m[2];
    }
    if (!v.domain || !/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(v.domain)) {
        return { ok: false, error: "domain must be a bare domain name" };
    }
    return { ok: true, values: v };
}

function buildScan(v) {
    const L = [];
    L.push('#!/bin/sh');
    L.push('mkdir -p "$HOME/.noxs/whois-lookup"');
    L.push('# whois-lookup scan — generated by the plugin, do not edit');
    L.push('DOMAIN=' + shq(v.domain));
    L.push('OUT="$HOME/.noxs/whois-lookup/results-$(date +%Y%m%d-%H%M%S).txt"');
    L.push('RC=0');
    L.push('echo "== whois-lookup report for $DOMAIN =="');
    L.push('echo "generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"');
    L.push('W=$(whois "$DOMAIN" 2>&1)');
    L.push('if [ -z "$W" ]; then');
    L.push('  echo "ERROR: empty whois response"');
    L.push('  RC=1');
    L.push('else');
    L.push('  echo');
    L.push('  echo "--- key fields ---"');
    L.push('  echo "$W" | grep -iE "domain name:|registrar:|registrar url:|creation date:|updated date:|registry expiry|expiry date:" | head -12');
    L.push('  echo');
    L.push('  echo "--- status flags ---"');
    L.push('  echo "$W" | grep -iE "^\s*domain status:" | head -8');
    L.push('  echo');
    L.push('  echo "--- nameservers ---"');
    L.push('  echo "$W" | grep -iE "name server:" | head -8');
    L.push('  echo');
    L.push('  echo "--- raw record (first 60 lines) ---"');
    L.push('  echo "$W" | head -60');
    L.push('  echo "$W" > "$OUT" 2>/dev/null || true');
    L.push('fi');
    L.push('echo');
    L.push('echo "NOXS_SAVED: $OUT"');
    L.push('echo "NOXS_SCAN_DONE exit=$RC"');
    return L.join('\n') + '\n';
}

// --------------------------------------------------------------- export

export default {
    activate: function (noxs) {
        session.noxs = noxs;
        noxs.log(PLUGIN_NAME + ' activated');
        session.handle = noxs.ui.createWindow({
            id: PLUGIN_ID,
            title: PLUGIN_NAME,
            width: 440,
            height: 680
        });
        session.handle.setHTML(buildStyle() + buildHtml());
        session.handle.on('check', onCheck);
        session.handle.on('install', onInstall);
        session.handle.on('request', onRequest);
        session.handle.on('show', onShow);
        session.handle.on('arm', onArm);
        session.handle.on('stop', onStop);
        session.handle.show();
        status('Ready — read the workflow notes, then CHECK TOOLS.');
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
