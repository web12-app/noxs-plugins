#!/usr/bin/env node
/*
 * validate-sdk.mjs — Noxs Plugin SDK manifest + bundle validation.
 *
 * Implements the sdk.json schema contract (spec §3) for every sdk/<version>/
 * release directory:
 *   1.  sdk.json exists, parses as strict JSON
 *   2.  name must be "noxs-plugin-sdk"
 *   3.  version must be MAJOR.MINOR.PATCH and match the directory name
 *   4.  apiVersion must be a non-empty generation identifier
 *   5.  entry must be "index.js", types must be "types.d.ts" when set
 *   6.  status must be "stable" or "deprecated"
 *   7.  features must be a non-empty list of known SDK feature ids
 *   8.  index.js and types.d.ts must exist and be non-empty
 *   9.  index.js must pass `node --check` (syntax)
 *   10. published versions are immutable — checked by CI via git history
 *
 * Usage:
 *   node scripts/validate-sdk.mjs <sdk-dir>     # one release
 *   node scripts/validate-sdk.mjs               # every sdk/<version>/
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SDK_PACKAGE_NAME = 'noxs-plugin-sdk';
const KNOWN_FEATURES = ['logging', 'ui', 'terminal', 'storage'];
const STATUSES = ['stable', 'deprecated'];

export class SdkValidationError extends Error {
    constructor(field, message) {
        super(`${field}: ${message}`);
        this.name = 'SdkValidationError';
        this.field = this.fieldName = field;
    }
}

function fail(field, message) {
    throw new SdkValidationError(field, message);
}

/**
 * Validates one sdk release directory.
 * Returns { dir, version, manifest } on success.
 */
export function validateSdk(sdkDir) {
    sdkDir = path.resolve(sdkDir);
    const dirName = path.basename(sdkDir);
    if (!fs.existsSync(sdkDir) || !fs.statSync(sdkDir).isDirectory()) {
        fail('sdk-dir', `not a directory: ${sdkDir}`);
    }

    const manifestFile = path.join(sdkDir, 'sdk.json');
    if (!fs.existsSync(manifestFile) || !fs.statSync(manifestFile).isFile()) {
        fail('sdk.json', `missing file (expected sdk/${dirName}/sdk.json)`);
    }
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    } catch (error) {
        fail('sdk.json', `invalid JSON (${error.message})`);
    }
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
        fail('sdk.json', 'must be a JSON object');
    }

    if (manifest.name !== SDK_PACKAGE_NAME) {
        fail('name', `must be "${SDK_PACKAGE_NAME}" (got "${manifest.name}")`);
    }
    if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) {
        fail('version', `must be MAJOR.MINOR.PATCH (got "${manifest.version}")`);
    }
    if (manifest.version !== dirName) {
        fail('version', `must match the release directory name (${dirName})`);
    }
    if (typeof manifest.apiVersion !== 'string' || manifest.apiVersion.trim() === '') {
        fail('apiVersion', 'must identify the API generation (a non-empty string)');
    }
    if (manifest.entry !== 'index.js') {
        fail('entry', 'must be "index.js" (the Noxs runtime entry)');
    }
    if (manifest.types !== undefined && manifest.types !== 'types.d.ts') {
        fail('types', 'must be "types.d.ts" when set');
    }
    if (typeof manifest.status !== 'string' || !STATUSES.includes(manifest.status)) {
        fail('status', `must be one of ${STATUSES.join(', ')} (got "${manifest.status}")`);
    }
    if (!Array.isArray(manifest.features) || manifest.features.length === 0) {
        fail('features', 'must list at least one API feature');
    }
    for (const feature of manifest.features) {
        if (!KNOWN_FEATURES.includes(feature)) {
            fail('features', `unknown SDK feature "${feature}" (allowed: ${KNOWN_FEATURES.join(', ')})`);
        }
    }
    if (new Set(manifest.features).size !== manifest.features.length) {
        fail('features', 'contains duplicates');
    }

    // Bundle files must exist and be non-empty.
    for (const file of ['index.js', 'types.d.ts']) {
        const target = path.join(sdkDir, file);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
            fail(file, 'missing release file');
        }
        if (fs.statSync(target).size === 0) {
            fail(file, 'is empty');
        }
    }

    // index.js must be syntactically valid JavaScript.
    const check = spawnSync(process.execPath, ['--check', path.join(sdkDir, 'index.js')], {
        encoding: 'utf8'
    });
    if (check.status !== 0) {
        fail('index.js', `syntax check failed: ${(check.stderr || '').trim()}`);
    }

    return { dir: sdkDir, version: manifest.version, manifest };
}

function sdkDirs(rootDir) {
    const root = path.join(rootDir, 'sdk');
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .filter((e) => /^\d+\.\d+\.\d+$/.test(e.name))
        .map((e) => path.join(root, e.name))
        .sort();
}

function main() {
    const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const targets = process.argv[2]
        ? [path.resolve(process.argv[2])]
        : sdkDirs(rootDir);
    if (targets.length === 0) {
        console.error('validate-sdk: no sdk release directories found');
        process.exit(1);
    }
    let failures = 0;
    for (const dir of targets) {
        try {
            const result = validateSdk(dir);
            console.log(`ok        noxs-plugin-sdk v${result.manifest.version} (api ${result.manifest.apiVersion}, ${result.manifest.features.join(', ')})`);
        } catch (error) {
            failures += 1;
            console.error(`INVALID   ${path.relative(rootDir, dir)}\n          ${error.message}`);
        }
    }
    if (failures > 0) {
        console.error(`\nvalidate-sdk: ${failures} sdk release(s) failed validation`);
        process.exit(1);
    }
    console.log(`\nvalidate-sdk: all sdk releases passed (${targets.length})`);
}

if (process.argv[1] && process.argv[1].endsWith('validate-sdk.mjs')) {
    main();
}
