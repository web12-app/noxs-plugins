#!/usr/bin/env node
/*
 * check-plugin-sdk.mjs — cross-checks every plugin's SDK requirements
 * against the published SDK releases in sdk/.
 *
 * For every plugins/<id>/plugin.json this verifies:
 *   1. sdkVersion (explicit or the "0.0.1" legacy default) is published
 *   2. minimumSdkVersion <= sdkVersion, maximumSdkVersion > minimumSdkVersion
 *   3. every apiFeatures entry is provided by the declared SDK release
 *   4. minimumNoxsVersion is not lower than the declared SDK's own
 *      minimum (a plugin cannot ask for an app older than its SDK)
 *
 * A failure fails the release pipeline before anything is published.
 *
 * Usage: node scripts/check-plugin-sdk.mjs [plugin-dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { validatePlugin } from './validate-plugin.mjs';
import { validateSdk } from './validate-sdk.mjs';

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function semverKey(v) {
    const m = SEMVER_RE.exec(v);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
    const ka = semverKey(a);
    const kb = semverKey(b);
    if (!ka || !kb) return null;
    for (let i = 0; i < 3; i += 1) {
        if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return 0;
}

export function checkPluginAgainstSdks(pluginDir, sdksRoot) {
    const ctx = validatePlugin(pluginDir);
    const meta = ctx.meta;
    const problems = [];

    const sdkVersion = typeof meta.sdkVersion === 'string' && meta.sdkVersion.trim() !== ''
        ? meta.sdkVersion
        : '0.0.1';
    if (!SEMVER_RE.test(sdkVersion)) {
        return { id: meta.id, problems: [`sdkVersion: must be MAJOR.MINOR.PATCH (got "${sdkVersion}")`] };
    }

    const sdkDir = path.join(sdksRoot, sdkVersion);
    if (!fs.existsSync(sdkDir)) {
        problems.push(`sdkVersion: Noxs Plugin SDK ${sdkVersion} is not published in sdk/`);
        return { id: meta.id, problems };
    }
    const sdk = validateSdk(sdkDir).manifest;

    if (meta.minimumSdkVersion !== undefined && meta.minimumSdkVersion !== null) {
        if (!SEMVER_RE.test(meta.minimumSdkVersion)) {
            problems.push(`minimumSdkVersion: must be MAJOR.MINOR.PATCH (got "${meta.minimumSdkVersion}")`);
        } else if ((compareSemver(meta.minimumSdkVersion, sdkVersion) ?? 1) > 0) {
            problems.push('minimumSdkVersion: must not exceed sdkVersion');
        }
    }
    if (meta.maximumSdkVersion !== undefined && meta.maximumSdkVersion !== null) {
        if (!SEMVER_RE.test(meta.maximumSdkVersion)) {
            problems.push(`maximumSdkVersion: must be MAJOR.MINOR.PATCH (got "${meta.maximumSdkVersion}")`);
        } else if (meta.minimumSdkVersion && SEMVER_RE.test(meta.minimumSdkVersion)) {
            if ((compareSemver(meta.maximumSdkVersion, meta.minimumSdkVersion) ?? -1) <= 0) {
                problems.push('maximumSdkVersion: must be above minimumSdkVersion');
            }
        }
    }

    const apiFeatures = Array.isArray(meta.apiFeatures) ? meta.apiFeatures : [];
    for (const feature of apiFeatures) {
        if (!sdk.features.includes(feature)) {
            problems.push(`apiFeatures: "${feature}" is not provided by Noxs Plugin SDK ${sdkVersion}`);
        }
    }

    if (typeof meta.minimumNoxsVersion === 'string' && typeof sdk.minimumNoxsVersion === 'string') {
        const rel = compareSemver(meta.minimumNoxsVersion, sdk.minimumNoxsVersion);
        if (rel !== null && rel < 0) {
            problems.push(
                `minimumNoxsVersion: ${meta.minimumNoxsVersion} is older than the minimum for SDK ${sdkVersion} (${sdk.minimumNoxsVersion})`
            );
        }
    }

    return { id: meta.id, problems };
}

function pluginDirs(rootDir, only) {
    if (only) return [path.resolve(only)];
    const root = path.join(rootDir, 'plugins');
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(root, e.name));
}

function main() {
    const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const targets = pluginDirs(rootDir, process.argv[2]);
    if (targets.length === 0) {
        console.error('check-plugin-sdk: no plugin directories found');
        process.exit(1);
    }
    let failures = 0;
    for (const dir of targets) {
        const result = checkPluginAgainstSdks(dir, path.join(rootDir, 'sdk'));
        if (result.problems.length > 0) {
            failures += 1;
            console.error(`INCOMPATIBLE ${result.id}\n  ${result.problems.join('\n  ')}`);
        } else {
            console.log(`ok          ${result.id}`);
        }
    }
    if (failures > 0) {
        console.error(`\ncheck-plugin-sdk: ${failures} plugin(s) failed SDK compatibility`);
        process.exit(1);
    }
    console.log(`\ncheck-plugin-sdk: all plugins are SDK-compatible (${targets.length})`);
}

if (process.argv[1] && process.argv[1].endsWith('check-plugin-sdk.mjs')) {
    main();
}
