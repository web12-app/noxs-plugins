/*
 * request.js — request file format, validation and option mapping for the
 * YouTube Downloader plugin.
 *
 * Pure functions only (no Noxs API calls) so every validation rule is easy
 * to audit. Nothing in this module builds a shell command; shell.js does
 * that, and only from values that passed the checks below.
 *
 * Request file: ~/.noxs/youtube-downloader/request.txt (key=value lines).
 */

export const REQUEST_DIR = '.noxs/youtube-downloader';
export const REQUEST_FILE = 'request.txt';
export const DEFAULT_DEST = '~/Downloads/YouTube';

export const MAX_URL_LENGTH = 200;
export const MAX_DEST_LENGTH = 120;

/** Only these YouTube hosts are accepted (no other sites, no channels). */
export const ALLOWED_HOSTS = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be'
];

/** Allowed options per mode. Values are whitelisted; nothing else reaches yt-dlp. */
export const MODE_SPECS = {
    video: {
        formats: ['mp4', 'mkv', 'webm'],
        defaultFormat: 'mp4',
        qualities: ['best', '1080', '720', '480', '360'],
        qualityLabel: 'maximum height in pixels'
    },
    audio: {
        formats: ['mp3', 'm4a', 'opus'],
        defaultFormat: 'mp3',
        qualities: ['best', '320', '192', '128'],
        qualityLabel: 'audio bitrate in kbps'
    }
};

const KEYS = ['url', 'mode', 'quality', 'format', 'dest'];
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** Text written to request.txt the first time the user creates it. */
export function requestTemplate() {
    return [
        '# YouTube Downloader request file',
        '# Edit this file, then press "Start download" in the plugin window.',
        '# Only download videos you own or are authorized to download.',
        '#',
        '# url      YouTube video link, e.g. https://youtu.be/VIDEO_ID',
        '#          (one video per request; playlists and channels are refused)',
        '# mode     video | audio',
        '# quality  video: best | 1080 | 720 | 480 | 360   (maximum height)',
        '#          audio: best | 320 | 192 | 128          (kbps)',
        '# format   video: mp4 | mkv | webm    audio: mp3 | m4a | opus',
        '# dest     folder inside your home directory, e.g. ~/Downloads/YouTube',
        '',
        'url=',
        'mode=video',
        'quality=best',
        'format=mp4',
        'dest=' + DEFAULT_DEST,
        ''
    ].join('\n');
}

function fail(error) {
    return { error };
}

/** Validates a YouTube video URL. Returns { value, host, playlist } or { error }. */
export function validateUrl(raw) {
    const text = String(raw === undefined || raw === null ? '' : raw).trim();
    if (text === '') {
        return { error: 'url is empty: put your YouTube video link after url=' };
    }
    if (text.length > MAX_URL_LENGTH) {
        return { error: 'url is longer than ' + MAX_URL_LENGTH + ' characters' };
    }
    if (/\s/.test(text) || CONTROL_RE.test(text)) {
        return { error: 'url must not contain spaces or control characters' };
    }
    let url;
    try {
        url = new URL(text);
    } catch (e) {
        return { error: 'url is not a valid link' };
    }
    if (url.protocol !== 'https:') {
        return { error: 'url must start with https://' };
    }
    if (url.username || url.password) {
        return { error: 'url must not contain a username or password' };
    }
    const host = url.hostname.toLowerCase();
    if (ALLOWED_HOSTS.indexOf(host) === -1) {
        return { error: 'only YouTube links are supported (youtube.com, m.youtube.com, music.youtube.com, youtu.be)' };
    }
    const path = url.pathname;
    const isShortLink = host === 'youtu.be' && /^\/[A-Za-z0-9_-]{6,}$/.test(path);
    const isWatch = /^\/watch\/?$/.test(path) && /^[A-Za-z0-9_-]{6,}$/.test(url.searchParams.get('v') || '');
    const isVideoPath = /^\/(shorts|live|embed)\/[A-Za-z0-9_-]{6,}$/.test(path);
    if (!isShortLink && !isWatch && !isVideoPath) {
        return {
            error: 'paste a single video link (playlists, channels and search pages are not supported)'
        };
    }
    return { value: url.href, host, playlist: url.searchParams.has('list') };
}

/**
 * Validates the destination folder. Only folders inside the home directory
 * are accepted, written as "~/folder/sub". Returns { value, display } where
 * value is the path relative to $HOME, or { error }.
 */
export function validateDest(raw) {
    const text = String(raw === undefined || raw === null ? '' : raw).trim();
    if (text === '') {
        return { error: 'dest is empty' };
    }
    if (text.length > MAX_DEST_LENGTH) {
        return { error: 'dest is longer than ' + MAX_DEST_LENGTH + ' characters' };
    }
    if (CONTROL_RE.test(text) || text.indexOf('\\') !== -1) {
        return { error: 'dest must not contain backslashes or control characters' };
    }
    if (text.indexOf('~/') !== 0) {
        return { error: 'dest must be a folder inside your home directory, written as ~/folder (example: ~/Downloads/YouTube)' };
    }
    const rel = text.slice(2).replace(/\/+$/, '');
    if (rel === '') {
        return { error: 'dest must name a folder inside your home directory' };
    }
    const parts = rel.split('/');
    for (let i = 0; i < parts.length; i += 1) {
        if (parts[i] === '' || parts[i] === '.' || parts[i] === '..') {
            return { error: 'dest must not contain empty, "." or ".." parts' };
        }
    }
    return { value: rel, display: '~/' + rel };
}

/**
 * Parses request.txt content into a validated job description.
 * Returns { ok: true, job } or { ok: false, error }.
 */
export function parseRequest(text) {
    const values = {};
    const lines = String(text === undefined || text === null ? '' : text).split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (line === '' || line.charAt(0) === '#') {
            continue;
        }
        const eq = line.indexOf('=');
        if (eq < 1) {
            return { ok: false, error: 'line ' + (i + 1) + ': expected key=value' };
        }
        const key = line.slice(0, eq).trim().toLowerCase();
        if (KEYS.indexOf(key) === -1) {
            return { ok: false, error: 'line ' + (i + 1) + ': unknown key "' + key + '" (allowed: ' + KEYS.join(', ') + ')' };
        }
        if (Object.prototype.hasOwnProperty.call(values, key)) {
            return { ok: false, error: 'line ' + (i + 1) + ': "' + key + '" is set more than once' };
        }
        values[key] = line.slice(eq + 1).trim();
    }
    const resolved = resolveRequest(values);
    if (resolved.error) {
        return { ok: false, error: resolved.error };
    }
    return { ok: true, job: resolved.job };
}

/** Applies defaults and validates every option. Returns { job } or { error }. */
export function resolveRequest(values) {
    const url = validateUrl(values.url);
    if (url.error) {
        return fail(url.error);
    }
    const mode = (values.mode || 'video').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(MODE_SPECS, mode)) {
        return fail('mode must be video or audio (got "' + values.mode + '")');
    }
    const spec = MODE_SPECS[mode];
    const quality = (values.quality || 'best').toLowerCase();
    if (spec.qualities.indexOf(quality) === -1) {
        return fail('quality for ' + mode + ' must be one of: ' + spec.qualities.join(', ') + ' (got "' + values.quality + '")');
    }
    const format = (values.format || spec.defaultFormat).toLowerCase();
    if (spec.formats.indexOf(format) === -1) {
        return fail('format for ' + mode + ' must be one of: ' + spec.formats.join(', ') + ' (got "' + values.format + '")');
    }
    const dest = validateDest(values.dest || DEFAULT_DEST);
    if (dest.error) {
        return fail(dest.error);
    }
    return {
        job: {
            url: url.value,
            host: url.host,
            playlist: url.playlist,
            mode: mode,
            quality: quality,
            format: format,
            destRel: dest.value,
            destDisplay: dest.display
        }
    };
}

/**
 * yt-dlp option string for a validated job. Every token comes from a fixed
 * whitelist; the URL is passed separately (after "--") by shell.js.
 */
export function ytDlpArgsFor(job) {
    const spec = MODE_SPECS[job.mode];
    if (!spec || spec.formats.indexOf(job.format) === -1 || spec.qualities.indexOf(job.quality) === -1) {
        throw new Error('internal: unvalidated job options');
    }
    const common = '--no-playlist --no-colors --newline -o \'%(title).120B [%(id)s].%(ext)s\'';
    if (job.mode === 'audio') {
        const quality = job.quality === 'best' ? '0' : job.quality + 'K';
        return common + ' -f \'ba/b\' -x --audio-format ' + job.format + ' --audio-quality ' + quality;
    }
    const selector = job.quality === 'best'
        ? 'bv*+ba/b'
        : 'bv*[height<=' + job.quality + ']+ba/b[height<=' + job.quality + ']';
    return common + ' -f \'' + selector + '\' --merge-output-format ' + job.format;
}

/** One-line human summary of a validated job. */
export function describeJob(job) {
    const what = job.mode === 'audio'
        ? job.format.toUpperCase() + ' audio' + (job.quality === 'best' ? ', best quality' : ', ' + job.quality + ' kbps')
        : job.format.toUpperCase() + ' video' + (job.quality === 'best' ? ', best quality' : ', up to ' + job.quality + 'p');
    const lines = [
        'Ready: ' + what + ' from ' + job.host,
        'Saved to: ' + job.destDisplay
    ];
    if (job.playlist) {
        lines.push('Note: the link contains a playlist. Only this single video will be downloaded.');
    }
    return lines.join('\n');
}
