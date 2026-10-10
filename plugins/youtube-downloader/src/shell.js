/*
 * shell.js — builds the guest shell commands used by the YouTube Downloader.
 *
 * Safety rules (the only place commands are assembled):
 *  - user-controlled text (URL, destination) never appears raw in a command.
 *    It is UTF-8 encoded to base64 and decoded inside the guest shell, so it
 *    cannot break out of quotes or inject operators.
 *  - format / quality / mode values come from fixed whitelists (request.js)
 *    and are re-checked here before use.
 *  - yt-dlp receives the URL after "--" so a link can never be read as an option.
 *  - the download runs detached in its own session (setsid) so Cancel can
 *    stop yt-dlp and ffmpeg together by signalling the process group.
 *
 * Noxs runs guest commands through noxs.terminal.exec(); each command below
 * is short enough for the host's command-length limit (2000 characters).
 */

import { ytDlpArgsFor } from './request.js';

/** Maximum command length accepted by the Noxs terminal bridge. */
export const MAX_COMMAND_LENGTH = 1900;

const SETUP = 'export PATH="$HOME/.local/bin:$PATH"; B="$HOME/.noxs/youtube-downloader"; ';
const SHELL_BASE64_RE = /^[A-Za-z0-9+/=]*$/;

/** UTF-8 text to base64 (works in the Noxs WebView and in Node). */
export function toBase64(text) {
    const bytes = new TextEncoder().encode(String(text));
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Shell expression that yields the original text. Only base64 characters are
 * ever placed inside the single quotes, so the text cannot break out.
 */
export function decodeExpr(text) {
    const encoded = toBase64(text);
    if (!SHELL_BASE64_RE.test(encoded)) {
        throw new Error('internal: unexpected base64 output');
    }
    return '"$(printf %s \'' + encoded + '\' | base64 -d)"';
}

/** Probes required and optional tools. Output is parsed by parseCheck(). */
export function checkCommand() {
    return SETUP +
        'for t in yt-dlp ffmpeg setsid base64 curl; do ' +
        'if command -v "$t" >/dev/null 2>&1; then echo "tool:$t=ok"; else echo "tool:$t=missing"; fi; done; ' +
        'if command -v deno >/dev/null 2>&1; then echo "js=deno"; ' +
        'elif command -v node >/dev/null 2>&1; then echo "js=node"; else echo "js=none"; fi; ' +
        'if command -v yt-dlp >/dev/null 2>&1; then echo "version:yt-dlp=$(yt-dlp --version 2>/dev/null | head -n 1)"; fi; ' +
        'if command -v ffmpeg >/dev/null 2>&1; then echo "version:ffmpeg=$(ffmpeg -version 2>/dev/null | head -n 1 | awk \'{print $3}\')"; fi';
}

/** Parses checkCommand() output into { tools, js, versions }. */
export function parseCheck(stdout) {
    const tools = {};
    const versions = {};
    let js = 'none';
    String(stdout || '').split('\n').forEach((raw) => {
        const line = raw.trim();
        let m = /^tool:([a-z0-9-]+)=(ok|missing)$/.exec(line);
        if (m) {
            tools[m[1]] = m[2] === 'ok';
            return;
        }
        m = /^js=(deno|node|none)$/.exec(line);
        if (m) {
            js = m[1];
            return;
        }
        m = /^version:([a-z0-9-]+)=(.*)$/.exec(line);
        if (m) {
            versions[m[1]] = m[2];
        }
    });
    return { tools, js, versions };
}

/** Required tools that the plugin can install (with consent). */
export const INSTALLABLE = ['yt-dlp', 'ffmpeg'];
/** Required tools that the plugin cannot install itself. */
export const SYSTEM_REQUIRED = ['setsid', 'base64'];

/** Returns { missing: [...installable], blocked: [...system], jsWarning } for a check. */
export function dependencyReport(check) {
    const missing = INSTALLABLE.filter((name) => !check.tools[name]);
    const blocked = SYSTEM_REQUIRED.filter((name) => !check.tools[name]);
    return {
        missing,
        blocked,
        jsWarning: check.js === 'none'
            ? 'No JavaScript runtime found (deno or node). YouTube downloads need one; install nodejs in the Noxs terminal.'
            : ''
    };
}

/** Prints the request file (exit 3 when it does not exist yet). */
export function readRequestCommand() {
    return SETUP + '[ -f "$B/request.txt" ] && cat "$B/request.txt" || exit 3';
}

/** Creates the request template once; never overwrites an existing file. */
export function createRequestCommand(templateText) {
    return SETUP +
        'mkdir -p "$B" && if [ -e "$B/request.txt" ]; then echo exists; ' +
        'else printf %s ' + decodeTemplate(templateText) + ' | base64 -d > "$B/request.txt" && echo created; fi';
}

function decodeTemplate(text) {
    return '\'' + toBase64(text) + '\'';
}

/** One poll of the background job: liveness, status file, log tail, result path. */
export function pollCommand() {
    return SETUP +
        'echo "@@alive"; P=$(cat "$B/pid" 2>/dev/null); ' +
        'if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then echo 1; else echo 0; fi; ' +
        'echo "@@status"; cat "$B/status" 2>/dev/null; ' +
        'echo "@@log"; tail -n 40 "$B/download.log" 2>/dev/null; ' +
        'echo "@@result"; head -n 1 "$B/result.txt" 2>/dev/null; echo "@@end"';
}

/** Splits pollCommand() output into sections and derives progress and stage. */
export function parsePoll(stdout) {
    const sections = { alive: '', status: '', log: '', result: '' };
    let current = null;
    String(stdout || '').split('\n').forEach((raw) => {
        const line = raw.replace(/\r$/, '');
        const marker = /^@@([a-z]+)$/.exec(line);
        if (marker) {
            current = marker[1] === 'end' ? null : marker[1];
            return;
        }
        if (current && Object.prototype.hasOwnProperty.call(sections, current)) {
            sections[current] += line + '\n';
        }
    });
    const status = {};
    sections.status.split('\n').forEach((line) => {
        const eq = line.indexOf('=');
        if (eq > 0) {
            status[line.slice(0, eq)] = line.slice(eq + 1);
        }
    });
    const logLines = sections.log.split('\n').filter((line) => line.trim() !== '');
    return {
        alive: sections.alive.trim() === '1',
        state: status.state || '',
        exit: status.exit === undefined ? null : Number(status.exit),
        logLines,
        resultPath: sections.result.trim(),
        percent: progressFrom(logLines),
        stage: stageFrom(logLines),
        lastError: lastErrorFrom(logLines)
    };
}

function progressFrom(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const m = /\[download\]\s+(\d{1,3}(?:\.\d+)?)%/.exec(lines[i]);
        if (m) {
            return Math.min(100, parseFloat(m[1]));
        }
    }
    return null;
}

function stageFrom(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line.indexOf('ERROR:') !== -1 || line.indexOf('WARNING:') !== -1) continue;
        if (line.indexOf('[Merger]') !== -1) return 'Merging video and audio';
        if (line.indexOf('[ExtractAudio]') !== -1) return 'Converting to audio';
        if (line.indexOf('[download]') !== -1) return 'Downloading';
        if (/\[(youtube|info|generic)[^\]]*\]/.test(line)) return 'Fetching video information';
        if (/\[(Metadata|EmbedThumbnail|FixupM4a|FixupM3u8|ModifyChapters)[^\]]*\]/.test(line)) return 'Finishing';
    }
    return '';
}

function lastErrorFrom(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i].indexOf('ERROR:') !== -1) {
            return lines[i].trim().slice(0, 300);
        }
    }
    return '';
}

/** Body of the detached download. Receives the URL as $1 and the folder as $2. */
function jobBody(job) {
    return [
        'B="$HOME/.noxs/youtube-downloader"',
        ': > "$B/download.log"; rm -f "$B/result.txt"',
        'printf "state=running\\nstarted=%s\\n" "$(date +%s)" > "$B/status"',
        'mkdir -p -- "$2" || { printf "state=failed\\nexit=20\\nfinished=%s\\n" "$(date +%s)" > "$B/status"; exit 20; }',
        'yt-dlp ' + ytDlpArgsFor(job) + ' -P "$2" --print-to-file "after_move:%(filepath)s" "$B/result.txt" -- "$1" >> "$B/download.log" 2>&1',
        'RC=$?',
        'if [ "$RC" -eq 0 ]; then S=done; else S=failed; fi',
        'printf "state=%s\\nexit=%s\\nfinished=%s\\n" "$S" "$RC" "$(date +%s)" > "$B/status"',
        'exit "$RC"'
    ].join('\n');
}

/**
 * Starts the download detached from the terminal call. Returns the command
 * string; its stdout is "started" on success. Throws only on internal errors.
 */
export function startCommand(job) {
    const command = [
        'export PATH="$HOME/.local/bin:$PATH";',
        'mkdir -p "$HOME/.noxs/youtube-downloader" || exit 2;',
        'command -v setsid >/dev/null 2>&1 || { echo "setsid is missing" >&2; exit 3; };',
        'U=' + decodeExpr(job.url) + ';',
        'D="$HOME/$(printf %s \'' + toBase64(job.destRel) + '\' | base64 -d)";',
        'nohup setsid sh -c ' + decodeExpr(jobBody(job)) + ' ytdl "$U" "$D" </dev/null >/dev/null 2>&1 &',
        'echo $! > "$HOME/.noxs/youtube-downloader/pid";',
        'echo started'
    ].join(' ');
    if (command.length > MAX_COMMAND_LENGTH) {
        throw new Error('internal: start command too long');
    }
    return command;
}

/** Stops a running download (whole process group) and records the cancellation. */
export function cancelCommand() {
    return SETUP +
        'P=$(cat "$B/pid" 2>/dev/null); ' +
        'if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then ' +
        'kill -TERM -- "-$P" 2>/dev/null || kill -TERM "$P" 2>/dev/null; sleep 2; kill -KILL -- "-$P" 2>/dev/null; ' +
        'printf "state=cancelled\\nfinished=%s\\n" "$(date +%s)" > "$B/status"; echo cancelled; ' +
        'else echo not-running; fi';
}

/**
 * Consent text and command for installing missing tools. Both come from the
 * same flags, so the text the user approves is exactly what runs.
 */
export function installPlan(missing) {
    const needFfmpeg = missing.indexOf('ffmpeg') !== -1;
    const needYtdlp = missing.indexOf('yt-dlp') !== -1;
    const lines = [];
    const parts = [];
    if (needFfmpeg) {
        lines.push('- ffmpeg: apt-get install ffmpeg via sudo (needs passwordless sudo; otherwise install it yourself).');
        parts.push(
            'FAIL=0; { A=""; [ "$(id -u)" = 0 ] || A="sudo -n"; ' +
            '$A apt-get update -qq && $A env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg; } || { echo "ffmpeg install failed (needs passwordless sudo)" >&2; FAIL=1; };'
        );
    }
    if (needYtdlp) {
        lines.push('- yt-dlp: official release from github.com/yt-dlp/yt-dlp to ~/.local/bin/yt-dlp, checked against the project SHA2-256SUMS.');
        parts.push(
            'FAIL=${FAIL:-0}; { command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; false; }; ' +
            'ARCH=$(uname -m); case "$ARCH" in x86_64) ASSET=yt-dlp_linux;; aarch64) ASSET=yt-dlp_linux_aarch64;; *) ASSET=yt-dlp;; esac; ' +
            'BASE=https://github.com/yt-dlp/yt-dlp/releases/latest/download; mkdir -p "$HOME/.local/bin" && T=$(mktemp -d) && ' +
            'curl -fsSL -o "$T/yt-dlp" "$BASE/$ASSET" && curl -fsSL -o "$T/SUMS" "$BASE/SHA2-256SUMS" && ' +
            'EXP=$(awk -v f="$ASSET" \'$2 == f {print $1}\' "$T/SUMS") && GOT=$(sha256sum "$T/yt-dlp" | awk \'{print $1}\') && ' +
            '[ -n "$EXP" ] && [ "$EXP" = "$GOT" ] && chmod 755 "$T/yt-dlp" && mv -f "$T/yt-dlp" "$HOME/.local/bin/yt-dlp" && ' +
            'echo "yt-dlp installed to ~/.local/bin/yt-dlp"; } || { echo "yt-dlp install failed or checksum mismatch" >&2; FAIL=1; }; ' +
            '[ -n "${T:-}" ] && rm -rf "$T"; '
        );
    }
    parts.push('exit "$FAIL";');
    return {
        lines,
        command: 'export PATH="$HOME/.local/bin:$PATH"; ' + parts.join(' ')
    };
}
