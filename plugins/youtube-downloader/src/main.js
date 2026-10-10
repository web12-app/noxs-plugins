/*
 * YouTube Downloader — Noxs plugin (original implementation).
 *
 * The plugin window is the control panel. Downloads run inside the Noxs
 * Linux environment with yt-dlp and ffmpeg, through the documented terminal
 * API (noxs.terminal.exec). Permission map (enforced by the Noxs host):
 *   ui        -> noxs.ui.createWindow (this window)
 *   terminal  -> noxs.terminal.exec (tool checks, request file, download, cancel)
 *
 * Flow:
 *   1. Check tools        — read-only probe for yt-dlp, ffmpeg and helpers.
 *   2. Install tools      — shows the exact steps; runs only after "Confirm install".
 *   3. Request file       — ~/.noxs/youtube-downloader/request.txt, edited in the
 *                           Noxs terminal (the Plugin API has no form-input channel).
 *   4. Start / Cancel     — the download runs detached; progress is polled from
 *                           its status file and yt-dlp log.
 *
 * Nothing is installed and nothing is downloaded without a user action.
 */

import {
    REQUEST_DIR,
    REQUEST_FILE,
    describeJob,
    parseRequest,
    requestTemplate
} from './request.js';
import {
    checkCommand,
    cancelCommand,
    createRequestCommand,
    dependencyReport,
    installPlan,
    parseCheck,
    parsePoll,
    pollCommand,
    readRequestCommand,
    startCommand
} from './shell.js';

const WINDOW_ID = 'youtube-downloader';
const POLL_MS = 2500;
const CONSENT_MS = 2 * 60 * 1000;
const REQUEST_PATH = '~/' + REQUEST_DIR + '/' + REQUEST_FILE;

const session = {
    noxs: null,
    handle: null,
    timer: null,
    busy: false,
    busyLabel: '',
    ticking: false,
    running: false,
    plan: null,
    consentAt: 0
};

// ------------------------------------------------------------------ helpers

function say(selector, text) {
    if (session.handle) {
        session.handle.setText(selector, text);
    }
}

function status(text) {
    say('#status', text);
}

function note(message) {
    if (session.noxs) {
        session.noxs.log('youtube-downloader: ' + message);
    }
}

/** Runs a guest command. Never rejects: failures come back as code -1. */
function exec(command) {
    return session.noxs.terminal.exec(command).then(
        (result) => ({
            code: Number(result.exitCode),
            out: String(result.stdout || ''),
            err: String(result.stderr || '')
        }),
        (error) => ({ code: -1, out: '', err: String((error && error.message) || error) })
    );
}

/** Serialises user actions so two clicks never run two commands at once. */
function locked(label, work) {
    if (session.busy) {
        status('Please wait: "' + session.busyLabel + '" is still running.');
        return Promise.resolve();
    }
    session.busy = true;
    session.busyLabel = label;
    return Promise.resolve()
        .then(work)
        .catch((error) => {
            status('ERROR Unexpected problem: ' + ((error && error.message) || error));
            note('unexpected error during ' + label);
        })
        .then(() => {
            session.busy = false;
            session.busyLabel = '';
        });
}

function bar(percent) {
    const cells = Math.max(0, Math.min(20, Math.round(percent / 5)));
    return '[' + '#'.repeat(cells) + '-'.repeat(20 - cells) + '] ' + percent.toFixed(1) + '%';
}

function showLog(lines) {
    const tail = lines.slice(-8).map((line) => (line.length > 160 ? line.slice(0, 157) + '...' : line));
    say('#log', tail.length ? tail.join('\n') : 'No log output yet.');
}

function renderTools(check) {
    const tools = check.tools;
    const versions = check.versions;
    const line = (name) => name + ': ' + (tools[name]
        ? 'OK' + (versions[name] ? ' (' + versions[name] + ')' : '')
        : 'MISSING');
    say('#tools', [
        line('yt-dlp'),
        line('ffmpeg'),
        'JavaScript runtime: ' + (check.js === 'none' ? 'MISSING (deno or node)' : check.js),
        line('setsid') + ', ' + line('base64') + ', ' + line('curl')
    ].join('\n'));
}

async function checkTools() {
    const res = await exec(checkCommand());
    if (res.out.trim() === '') {
        say('#tools', 'Could not run the tool check: ' + (res.err.trim() || 'unknown error'));
        return null;
    }
    const check = parseCheck(res.out);
    renderTools(check);
    return check;
}

async function loadRequest() {
    const res = await exec(readRequestCommand());
    if (res.code === 3) {
        return { ok: false, error: 'No request file yet. Press "Create request file" first.' };
    }
    if (res.code !== 0) {
        return { ok: false, error: 'Could not read the request file: ' + (res.err.trim() || 'unknown error') };
    }
    return parseRequest(res.out);
}

async function readJob() {
    const res = await exec(pollCommand());
    if (res.out.trim() === '') {
        return null;
    }
    return parsePoll(res.out);
}

function failureText(job) {
    if (job.exit === 127) {
        return 'ERROR yt-dlp is not installed or not on PATH. Press "Install tools" and try again.';
    }
    if (job.exit === 20) {
        return 'ERROR Could not create the destination folder. Use a folder inside your home directory (dest=~/...).';
    }
    const reason = job.lastError || ('yt-dlp stopped with exit code ' + job.exit + '.');
    return 'ERROR Download failed: ' + reason + '\n' +
        'Common causes: the video is private, removed, age-, region- or members-restricted '
        + '(no cookies are used); yt-dlp is outdated (run "yt-dlp -U" for the standalone install); '
        + 'no JavaScript runtime (install nodejs); no network.';
}

// ------------------------------------------------------------ monitoring

function stopMonitoring() {
    if (session.timer) {
        clearInterval(session.timer);
        session.timer = null;
    }
    session.running = false;
}

function startMonitoring() {
    session.running = true;
    if (session.timer) {
        return;
    }
    session.timer = setInterval(tick, POLL_MS);
    tick();
}

function render(job) {
    if (job.state === 'running' && job.alive) {
        session.running = true;
        say('#bar', job.percent === null ? '[--------------------] starting' : bar(job.percent));
        const label = job.stage || 'Working';
        const pct = job.percent === null ? '...' : '... ' + job.percent.toFixed(1) + '%';
        status('RUNNING ' + label + pct + '\nYou can close this window; the download continues. Press Cancel to stop it.');
        showLog(job.logLines);
        return;
    }
    stopMonitoring();
    if (job.state === 'running') {
        say('#bar', job.percent === null ? '[--------------------] stopped' : bar(job.percent));
        status('ERROR The download stopped before it finished (no final status was written). See the log below; you can start it again.');
        showLog(job.logLines);
        return;
    }
    if (job.state === 'done') {
        say('#bar', bar(100));
        status('OK Download finished.\nSaved to: ' + (job.resultPath || 'your destination folder (exact path not reported)'));
        showLog(job.logLines);
        return;
    }
    if (job.state === 'cancelled') {
        status('INFO Download cancelled. yt-dlp was stopped. Partly downloaded files (.part) may remain in the destination folder; delete them if you do not need them.');
        showLog(job.logLines);
        return;
    }
    if (job.state === 'failed') {
        say('#bar', job.percent === null ? '[--------------------] failed' : bar(job.percent));
        status(failureText(job));
        showLog(job.logLines);
    }
}

async function tick() {
    if (session.busy || session.ticking) {
        return;
    }
    session.ticking = true;
    try {
        const job = await readJob();
        if (job) {
            render(job);
        }
    } catch (error) {
        note('status poll failed');
    } finally {
        session.ticking = false;
    }
}

// --------------------------------------------------------------- actions

function onCheck() {
    return locked('tool check', async () => {
        const check = await checkTools();
        if (!check) {
            return;
        }
        const report = dependencyReport(check);
        let message;
        if (report.blocked.length) {
            message = 'ERROR Missing system tools: ' + report.blocked.join(', ') +
                '. The plugin cannot install these; add them in the Noxs terminal and check again.';
        } else if (report.missing.length) {
            message = 'WARNING Missing: ' + report.missing.join(', ') +
                '. Downloads cannot start yet. Press "Install tools" to review the steps; nothing is installed without your confirmation.';
        } else {
            message = 'OK All required tools are available.';
        }
        if (report.jsWarning) {
            message += '\nWARNING ' + report.jsWarning;
        }
        status(message);
    });
}

function onCreateRequest() {
    return locked('create request file', async () => {
        const res = await exec(createRequestCommand(requestTemplate()));
        if (res.code !== 0) {
            status('ERROR Could not create the request file: ' + (res.err.trim() || 'unknown error'));
            return;
        }
        if (res.out.indexOf('created') !== -1) {
            status('OK Created ' + REQUEST_PATH + '.\n' +
                'Next: open it in the Noxs terminal (for example: nano ' + REQUEST_PATH + '), '
                + 'set url=, then press "Check request" and "Start download".');
        } else {
            status('INFO The request file already exists (' + REQUEST_PATH + '). Edit it, then press "Check request".');
        }
    });
}

function onCheckRequest() {
    return locked('check request', async () => {
        const loaded = await loadRequest();
        if (!loaded.ok) {
            status('ERROR ' + loaded.error);
            return;
        }
        status('OK ' + describeJob(loaded.job) + '\nPress "Start download" to begin.');
    });
}

function onStart() {
    return locked('start download', async () => {
        const current = await readJob();
        if (current && current.state === 'running' && current.alive) {
            status('INFO A download is already running. Its progress is shown here; press Cancel to stop it first.');
            startMonitoring();
            return;
        }
        const check = await checkTools();
        if (!check) {
            return;
        }
        const report = dependencyReport(check);
        if (report.blocked.length) {
            status('ERROR Missing system tools: ' + report.blocked.join(', ') + '. Install them in the Noxs terminal first.');
            return;
        }
        if (report.missing.length) {
            status('ERROR Missing tools: ' + report.missing.join(', ') +
                '. Press "Install tools" to review the install steps. Nothing was downloaded.');
            return;
        }
        const loaded = await loadRequest();
        if (!loaded.ok) {
            status('ERROR ' + loaded.error);
            return;
        }
        let command;
        try {
            command = startCommand(loaded.job);
        } catch (error) {
            status('ERROR Could not prepare the download: ' + error.message);
            return;
        }
        status('Starting download...\n' + describeJob(loaded.job));
        const res = await exec(command);
        if (res.code !== 0 || res.out.indexOf('started') === -1) {
            status('ERROR The download could not be started.' +
                (res.err.trim() ? '\n' + res.err.trim().slice(0, 300) : ''));
            return;
        }
        note('download started (' + loaded.job.mode + ')');
        startMonitoring();
    });
}

function onCancel() {
    return locked('cancel', async () => {
        const res = await exec(cancelCommand());
        stopMonitoring();
        if (res.out.indexOf('cancelled') !== -1) {
            note('download cancelled by user');
            const job = await readJob();
            if (job) {
                render(job);
            }
        } else {
            status('INFO No download is running, so there is nothing to cancel.');
        }
    });
}

function onInstall() {
    return locked('install review', async () => {
        if (session.running) {
            status('INFO Cancel the running download before installing tools.');
            return;
        }
        const check = await checkTools();
        if (!check) {
            return;
        }
        const report = dependencyReport(check);
        if (report.blocked.length) {
            status('ERROR Missing system tools: ' + report.blocked.join(', ') +
                '. This plugin cannot install them; add them in the Noxs terminal.');
            return;
        }
        if (!report.missing.length) {
            session.plan = null;
            say('#consent', 'No install pending.');
            status('OK Nothing to install: yt-dlp and ffmpeg are already available.');
            return;
        }
        session.plan = installPlan(report.missing);
        session.consentAt = Date.now();
        say('#consent', 'Install these tools? Nothing changes until you press "Confirm install".\n' +
            session.plan.lines.join('\n') +
            '\nThis approval expires in 2 minutes.' +
            (report.jsWarning ? '\nNote: ' + report.jsWarning : ''));
        status('INFO Review the install steps above, then press "Confirm install" or "Cancel install".');
    });
}

function onConfirmInstall() {
    return locked('install', async () => {
        const plan = session.plan;
        const approved = plan !== null && Date.now() - session.consentAt <= CONSENT_MS;
        session.plan = null;
        session.consentAt = 0;
        if (!approved) {
            say('#consent', 'No install is pending.');
            status('INFO Press "Install tools" to review the steps first (approval expires after 2 minutes).');
            return;
        }
        say('#consent', 'Installing... this can take several minutes. Keep Noxs open.');
        status('Installing tools (this may take several minutes)...');
        const res = await exec(plan.command);
        const check = await checkTools();
        const missing = check ? dependencyReport(check).missing : ['unknown'];
        if (res.code === 0 && missing.length === 0) {
            say('#consent', 'Install finished.');
            status('OK Tools are installed. Press "Start download" when your request file is ready.');
        } else {
            say('#consent', 'Install did not finish (exit code ' + res.code + ').');
            status('ERROR Install did not complete' +
                (res.err.trim() ? ': ' + res.err.trim().slice(-300) : '.') +
                '\nStill missing: ' + missing.join(', ') +
                '. You can install them yourself in the Noxs terminal (sudo apt-get install -y ffmpeg; see the README for yt-dlp).');
        }
    });
}

function onCancelInstall() {
    session.plan = null;
    session.consentAt = 0;
    say('#consent', 'No install pending.');
    status('INFO Install cancelled. Nothing was changed.');
}

async function resume() {
    const job = await readJob();
    if (!job) {
        return;
    }
    if (job.state === 'running' && job.alive) {
        startMonitoring();
    } else {
        render(job);
    }
}

// ------------------------------------------------------------------ window

function style() {
    return [
        '<style>',
        '  * { box-sizing: border-box; }',
        '  body { font-family: sans-serif; background: #10151c; color: #e6edf3;',
        '         margin: 0; padding: 14px; line-height: 1.4; }',
        '  h1 { color: #7ce8b8; font-size: 19px; margin: 0 0 2px; }',
        '  p.sub { color: #8ea0b3; margin: 0 0 10px; font-size: 13px; }',
        '  p.foot { color: #8ea0b3; font-size: 11px; margin: 10px 0 0; }',
        '  .card { background: #0b1016; border: 1px solid #24303c; border-radius: 8px;',
        '          padding: 10px 12px; margin: 10px 0; }',
        '  .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em;',
        '             color: #8ea0b3; margin: 0 0 6px; }',
        '  ol { margin: 0; padding-left: 18px; font-size: 13px; }',
        '  li { margin: 4px 0; }',
        '  code { background: #05080b; border: 1px solid #24303c; border-radius: 4px;',
        '         padding: 0 4px; font-size: 12px; word-break: break-all; }',
        '  .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }',
        '  button { flex: 1 1 140px; background: #1d2733; color: #e6edf3;',
        '           border: 1px solid #33414f; border-radius: 6px; padding: 9px 10px;',
        '           font-size: 14px; min-height: 40px; }',
        '  button:active { opacity: .75; }',
        '  button.primary { background: #1f4d3a; border-color: #2f7a5a; }',
        '  button.danger { background: #4a2326; border-color: #7a3a40; }',
        '  pre { white-space: pre-wrap; word-break: break-word; margin: 0 0 6px;',
        '        font-family: ui-monospace, monospace; font-size: 12px; min-height: 36px;',
        '        background: #05080b; border: 1px solid #24303c; border-radius: 6px; padding: 8px; }',
        '  @media (max-width: 420px) { body { padding: 10px; } button { flex-basis: 100%; } }',
        '</style>'
    ].join('\n');
}

function page() {
    return style() + [
        '<h1>YouTube Downloader</h1>',
        '<p class="sub">Save YouTube videos or audio you own or are authorized to download.</p>',
        '<div class="card">',
        '  <h2>1 · Tools</h2>',
        '  <pre id="tools">Not checked yet. Press "Check tools".</pre>',
        '  <div class="row"><button id="check">Check tools</button><button id="install">Install tools…</button></div>',
        '  <pre id="consent">No install pending.</pre>',
        '  <div class="row"><button id="confirm-install" class="primary">Confirm install</button><button id="cancel-install">Cancel install</button></div>',
        '</div>',
        '<div class="card">',
        '  <h2>2 · Request</h2>',
        '  <ol>',
        '    <li>Press <b>Create request file</b> once.</li>',
        '    <li>In the Noxs terminal, edit <code>' + REQUEST_PATH + '</code> (for example with nano) and set',
        '        <code>url=</code>, <code>mode=</code> (video or audio), <code>quality=</code>, <code>format=</code> and <code>dest=</code>.</li>',
        '    <li>Press <b>Check request</b>, then <b>Start download</b>.</li>',
        '  </ol>',
        '  <div class="row"><button id="create">Create request file</button><button id="check-request">Check request</button></div>',
        '</div>',
        '<div class="card">',
        '  <h2>3 · Download</h2>',
        '  <pre id="status">Ready. Press "Check tools" to begin.</pre>',
        '  <pre id="bar">[--------------------] 0.0%</pre>',
        '  <div class="row"><button id="start" class="primary">Start download</button><button id="cancel" class="danger">Cancel</button></div>',
        '  <pre id="log">No download has been started.</pre>',
        '</div>',
        '<p class="foot">Downloads run inside your Noxs environment with yt-dlp and ffmpeg. DRM-protected or access-restricted content is not supported, and no cookies or login details are used.</p>'
    ].join('\n');
}

export default {
    activate(noxs) {
        session.noxs = noxs;
        noxs.log('YouTube Downloader activated');

        session.handle = noxs.ui.createWindow({
            id: WINDOW_ID,
            title: 'YouTube Downloader',
            width: 480,
            height: 680
        });
        session.handle.setHTML(page());

        session.handle.on('check', onCheck);
        session.handle.on('create', onCreateRequest);
        session.handle.on('check-request', onCheckRequest);
        session.handle.on('start', onStart);
        session.handle.on('cancel', onCancel);
        session.handle.on('install', onInstall);
        session.handle.on('confirm-install', onConfirmInstall);
        session.handle.on('cancel-install', onCancelInstall);

        session.handle.show();
        resume().catch(() => {});
    },

    deactivate() {
        stopMonitoring();
        if (session.handle) {
            try {
                session.handle.close();
            } catch (error) {
                /* window already gone */
            }
            session.handle = null;
        }
    }
};
