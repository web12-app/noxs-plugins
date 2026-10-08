#!/usr/bin/env node
/*
 * validate-plugin.mjs — Noxs plugin metadata + structure validation.
 *
 * Implements the Noxs Plugin Store validation contract:
 *   1.  Parse plugin.json as strict JSON
 *   2.  Validate plugin id
 *   3.  Validate plugin name
 *   4.  Validate semantic version
 *   5.  Validate description
 *   6.  Validate main entry
 *   7.  Validate permissions
 *   8.  Validate minimum Noxs version
 *   9.  Resolve logo path
 *   10. Verify logo exists
 *   11. Resolve README path (default: README.md)
 *   12. Verify README exists
 *   13. Validate commands
 *   14. Validate bin/ guest command scripts (names, size, shebang)
 *
 * The build must never silently ignore invalid metadata — every problem
 * exits non-zero with a clear `plugin.json field` style message.
 *
 * Usage:
 *   node scripts/validate-plugin.mjs <plugin-dir>
 *   node scripts/validate-plugin.mjs            # validates plugins/*
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REQUIRED_PERMISSIONS = [
    'ui', 'terminal', 'filesystem', 'storage', 'network',
    'notifications', 'background'
];
const LOGO_EXTENSIONS = ['.svg', '.png', '.webp', '.jpg', '.jpeg'];
const REQUIRED_FIELDS = ['id', 'name', 'version', 'description', 'main', 'permissions', 'minimumNoxsVersion'];
/** Guest command scripts (bin/) must stay small enough to ship as shims. */
export const MAX_BIN_BYTES = 128 * 1024;

export class PluginValidationError extends Error {
    constructor(field, message) {
        super(`${field}: ${message}`);
        this.name = 'PluginValidationError';
        this.field = field;
    }
}

function fail(field, message) {
    throw new PluginValidationError(field, message);
}

function readPluginJson(pluginDir) {
    const file = path.join(pluginDir, 'plugin.json');
    if (!fs.existsSync(file)) fail('plugin.json', 'missing file (expected plugins/<id>/plugin.json)');
    if (!fs.statSync(file).isFile()) fail('plugin.json', 'not a regular file');
    let raw;
    try {
        raw = fs.readFileSync(file, 'utf8');
    } catch (error) {
        fail('plugin.json', `unreadable (${error.message})`);
    }
    let json;
    try {
        json = JSON.parse(raw);
    } catch (error) {
        fail('plugin.json', `invalid JSON (${error.message})`);
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        fail('plugin.json', 'must be a JSON object');
    }
    return json;
}

/** Rejects path escapes ("../", absolute paths) in metadata-declared files. */
function safeResolve(pluginDir, field, rel) {
    if (typeof rel !== 'string' || rel.trim() === '') fail(field, 'must be a non-empty relative path');
    if (path.isAbsolute(rel)) fail(field, `must be relative (got "${rel}")`);
    const resolved = path.resolve(pluginDir, rel);
    const base = path.resolve(pluginDir);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
        fail(field, `escapes the plugin directory (got "${rel}")`);
    }
    return resolved;
}

/**
 * Validates one plugin directory.
 * Returns the parsed metadata plus resolved file locations.
 */
export function validatePlugin(pluginDir) {
    pluginDir = path.resolve(pluginDir);
    if (!fs.existsSync(pluginDir) || !fs.statSync(pluginDir).isDirectory()) {
        fail('plugin-dir', `not a directory: ${pluginDir}`);
    }

    const meta = readPluginJson(pluginDir);

    for (const field of REQUIRED_FIELDS) {
        if (!(field in meta)) fail(field, 'required field is missing');
    }

    // 2. id
    if (typeof meta.id !== 'string' || !PLUGIN_ID_RE.test(meta.id)) {
        fail('id', 'must match ^[a-z0-9][a-z0-9-]{1,63}$ (lowercase letters, digits, dashes)');
    }

    // 3. name
    if (typeof meta.name !== 'string' || meta.name.trim().length < 2 || meta.name.length > 60) {
        fail('name', 'must be a string of 2-60 characters');
    }

    // 4. version
    if (typeof meta.version !== 'string' || !SEMVER_RE.test(meta.version)) {
        fail('version', `must be MAJOR.MINOR.PATCH (got "${meta.version}")`);
    }

    // 5. description
    if (typeof meta.description !== 'string' || meta.description.trim().length < 4) {
        fail('description', 'must describe the plugin (at least 4 characters)');
    }

    // 6. main — the runtime contract fixes the bundle name.
    if (meta.main !== 'plugin.js') {
        fail('main', 'must be "plugin.js" (the Noxs runtime entry)');
    }

    // 7. permissions
    if (!Array.isArray(meta.permissions) || meta.permissions.length === 0) {
        fail('permissions', 'must be a non-empty array (declare at least "ui")');
    }
    for (const permission of meta.permissions) {
        if (!REQUIRED_PERMISSIONS.includes(permission)) {
            fail('permissions', `unknown permission "${permission}" (allowed: ${REQUIRED_PERMISSIONS.join(', ')})`);
        }
    }
    if (new Set(meta.permissions).size !== meta.permissions.length) {
        fail('permissions', 'contains duplicates');
    }

    // 8. minimumNoxsVersion
    if (typeof meta.minimumNoxsVersion !== 'string' || !SEMVER_RE.test(meta.minimumNoxsVersion)) {
        fail('minimumNoxsVersion', `must be MAJOR.MINOR.PATCH (got "${meta.minimumNoxsVersion}")`);
    }

    // 9-10. logo (optional but strongly recommended; must exist when set)
    let logoFile = null;
    if (meta.logo !== undefined && meta.logo !== null) {
        logoFile = safeResolve(pluginDir, 'logo', meta.logo);
        if (!fs.existsSync(logoFile)) fail('logo', `file does not exist: ${meta.logo}`);
        const ext = path.extname(logoFile).toLowerCase();
        if (!LOGO_EXTENSIONS.includes(ext)) {
            fail('logo', `format must be one of ${LOGO_EXTENSIONS.join(', ')} (got "${ext || 'none'}")`);
        }
    }

    // 11-12. README (defaults to README.md; must exist)
    const readmeRel = meta.readme === undefined || meta.readme === null ? 'README.md' : meta.readme;
    const readmeFile = safeResolve(pluginDir, 'readme', readmeRel);
    if (!fs.existsSync(readmeFile)) fail('readme', `file does not exist: ${readmeRel}`);

    // 13. commands (optional array of the CLI command names the plugin provides)
    if (meta.commands !== undefined) {
        if (!Array.isArray(meta.commands)) fail('commands', 'must be an array of strings');
        for (const command of meta.commands) {
            if (typeof command !== 'string' || !PLUGIN_ID_RE.test(command)) {
                fail('commands', `invalid command name "${command}"`);
            }
        }
    }

    // 14. bin/ (optional directory of guest command scripts). Every entry
    // becomes a terminal command installed into the guest /usr/local/bin by
    // the Noxs Plugin Manager — but ONLY for plugins granted the terminal
    // permission. The build must never ship a broken or hostile script.
    const binDir = path.join(pluginDir, 'bin');
    const binFiles = [];
    if (fs.existsSync(binDir)) {
        if (!fs.statSync(binDir).isDirectory()) fail('bin', 'must be a directory of command scripts');
        for (const name of fs.readdirSync(binDir).sort()) {
            if (!PLUGIN_ID_RE.test(name)) {
                fail('bin', `invalid command name "${name}" (expected lowercase letters, digits, dashes)`);
            }
            const file = path.join(binDir, name);
            if (!fs.statSync(file).isFile()) fail('bin', `"${name}" must be a regular file`);
            const size = fs.statSync(file).size;
            if (size === 0) fail('bin', `"${name}" is empty`);
            if (size > MAX_BIN_BYTES) fail('bin', `"${name}" is larger than ${MAX_BIN_BYTES} bytes`);
            const head = Buffer.alloc(2);
            const fd = fs.openSync(file, 'r');
            try {
                fs.readSync(fd, head, 0, 2, 0);
            } finally {
                fs.closeSync(fd);
            }
            if (head.toString('ascii') !== '#!') {
                fail('bin', `"${name}" must start with a "#!" shebang (it runs as a guest command)`);
            }
            binFiles.push(file);
        }
    }

    // Optional free-form fields must at least be the right type.
    for (const field of ['author', 'license', 'category', 'homepage', 'repository']) {
        if (meta[field] !== undefined && typeof meta[field] !== 'string') {
            fail(field, 'must be a string');
        }
    }
    if (meta.keywords !== undefined) {
        if (!Array.isArray(meta.keywords) || meta.keywords.some((k) => typeof k !== 'string')) {
            fail('keywords', 'must be an array of strings');
        }
    }

    // The entry source that esbuild bundles.
    const entryFile = path.join(pluginDir, 'src', 'main.js');
    if (!fs.existsSync(entryFile)) fail('src/main.js', 'entry source is missing (expected src/main.js)');

    return {
        dir: pluginDir,
        meta,
        entry: entryFile,
        logo: logoFile,
        readme: readmeFile,
        bin: binFiles.length > 0 ? binDir : null,
        binFiles,
        dist: path.join(pluginDir, 'dist')
    };
}

function pluginDirs(rootDir) {
    const root = path.join(rootDir, 'plugins');
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root)
        .map((name) => path.join(root, name))
        .filter((dir) => fs.statSync(dir).isDirectory() && !dir.includes('dist'));
}

function main() {
    const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const targets = process.argv[2] ? [path.resolve(process.argv[2])] : pluginDirs(rootDir);
    if (targets.length === 0) {
        console.error('validate: no plugin directories found');
        process.exit(1);
    }
    let failures = 0;
    for (const dir of targets) {
        try {
            const result = validatePlugin(dir);
            console.log(`ok        ${result.meta.id} v${result.meta.version} (${path.relative(rootDir, dir)})`);
        } catch (error) {
            failures += 1;
            console.error(`INVALID   ${path.relative(rootDir, dir)}\n          ${error.message}`);
        }
    }
    if (failures > 0) {
        console.error(`\nvalidate: ${failures} plugin(s) failed validation`);
        process.exit(1);
    }
    console.log(`\nvalidate: all plugins passed (${targets.length})`);
}

if (process.argv[1] && process.argv[1].endsWith('validate-plugin.mjs')) {
    main();
}
