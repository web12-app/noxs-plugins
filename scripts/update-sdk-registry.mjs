#!/usr/bin/env node
/*
 * update-sdk-registry.mjs — upsert a released SDK into sdk/registry.json.
 *
 * Called by the release-sdk workflow AFTER the immutable GitHub release is
 * created, with the artifact URL and its sha256. The checksum is what the
 * Noxs app verifies before executing any SDK bundle, so a release without
 * a checksum can never be adopted by the store.
 *
 * Usage:
 *   node scripts/update-sdk-registry.mjs \
 *     --sdk 0.0.1 \
 *     --artifact https://github.com/web12-app/noxs-plugins/releases/download/sdk-v0.0.1/noxs-sdk-0.0.1.noxs-sdk \
 *     --checksum <sha256> \
 *     [--registry sdk/registry.json] [--tag sdk-v0.0.1]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { validateSdk } from './validate-sdk.mjs';

function parseArgs(argv) {
    const args = { registry: path.join('sdk', 'registry.json') };
    for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i];
        if (key === '--sdk') args.sdk = argv[++i];
        else if (key === '--artifact') args.artifact = argv[++i];
        else if (key === '--checksum') args.checksum = argv[++i];
        else if (key === '--registry') args.registry = argv[++i];
        else if (key === '--tag') args.tag = argv[++i];
        else {
            console.error(`update-sdk-registry: unknown argument "${key}"`);
            process.exit(2);
        }
    }
    if (!args.sdk || !args.artifact || !args.checksum) {
        console.error('usage: update-sdk-registry.mjs --sdk <version> --artifact <url> --checksum <sha256> [--registry <file>] [--tag <tag>]');
        process.exit(2);
    }
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const sdkDir = path.join(rootDir, 'sdk', args.sdk);
    const manifest = validateSdk(sdkDir).manifest;
    if (!/^[0-9a-f]{64}$/i.test(args.checksum)) {
        console.error('update-sdk-registry: --checksum must be a sha256 hex digest');
        process.exit(1);
    }

    const registryFile = path.resolve(rootDir, args.registry);
    const registryRaw = fs.existsSync(registryFile)
        ? fs.readFileSync(registryFile, 'utf8')
        : '{"version": 1, "sdks": []}';
    const registry = JSON.parse(registryRaw);
    if (registry.version !== 1 || !Array.isArray(registry.sdks)) {
        console.error(`update-sdk-registry: ${args.registry} has an unsupported shape`);
        process.exit(1);
    }

    const entry = {
        version: manifest.version,
        apiVersion: manifest.apiVersion,
        status: manifest.status,
        features: [...manifest.features],
        minimumNoxsVersion: undefined,
        artifact: args.artifact,
        checksum: args.checksum.toLowerCase()
    };

    // The existing entry is the authority for minimumNoxsVersion (and keeps
    // older fields stable); the release only confirms/immutably pins them.
    const previous = registry.sdks.find((s) => s.version === entry.version);
    if (previous) {
        entry.minimumNoxsVersion = previous.minimumNoxsVersion;
        if (previous.artifact && previous.artifact !== entry.artifact) {
            console.error('update-sdk-registry: refusing to move the artifact of a published release');
            process.exit(1);
        }
        if (previous.checksum && previous.checksum !== entry.checksum) {
            console.error('update-sdk-registry: refusing to change the checksum of a published release');
            process.exit(1);
        }
    }
    if (!entry.minimumNoxsVersion) {
        console.error('update-sdk-registry: sdk/registry.json has no minimumNoxsVersion for this release');
        process.exit(1);
    }

    const index = registry.sdks.findIndex((s) => s.version === entry.version);
    if (index >= 0) registry.sdks[index] = entry;
    else registry.sdks.push(entry);
    registry.sdks.sort((a, b) => {
        const ka = a.version.split('.').map(Number);
        const kb = b.version.split('.').map(Number);
        for (let i = 0; i < 3; i += 1) {
            if (ka[i] !== kb[i]) return ka[i] - kb[i];
        }
        return 0;
    });

    fs.writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    console.log(`sdk-registry: ${index >= 0 ? 'confirmed' : 'added'} noxs-plugin-sdk v${entry.version} (${registry.sdks.length} release(s))`);
}

main();
