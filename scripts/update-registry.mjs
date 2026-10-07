#!/usr/bin/env node
/*
 * update-registry.mjs — upsert a built plugin into registry.json.
 *
 * The Noxs Plugin Store reads registry.json for the list page; the details
 * page can fetch the release README. After a successful release the
 * workflow calls this script with the artifact URL + sha256 checksum and
 * commits the result, so the registry always matches the published
 * releases. A release is never published with a stale registry.
 *
 * Usage:
 *   node scripts/update-registry.mjs \
 *     --plugin plugins/hello \
 *     --artifact https://github.com/web12-app/noxs-plugins/releases/download/hello-v1.0.0/hello-1.0.0.noxs-plugin \
 *     --checksum <sha256-of-artifact> \
 *     [--registry registry.json] [--tag hello-v1.0.0]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { validatePlugin } from './validate-plugin.mjs';

function parseArgs(argv) {
    const args = { registry: 'registry.json' };
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        if (key === '--plugin') args.plugin = argv[++i];
        else if (key === '--artifact') args.artifact = argv[++i];
        else if (key === '--checksum') args.checksum = argv[++i];
        else if (key === '--registry') args.registry = argv[++i];
        else if (key === '--tag') args.tag = argv[++i];
        else {
            console.error(`update-registry: unknown argument "${key}"`);
            process.exit(2);
        }
    }
    if (!args.plugin || !args.artifact) {
        console.error('usage: update-registry.mjs --plugin <dir> --artifact <url> [--checksum <sha256>] [--registry <file>] [--tag <tag>]');
        process.exit(2);
    }
    return args;
}

/** Registry entries are plain data — strip build-only fields. */
function toEntry(meta, repoRelative) {
    const entry = {
        id: meta.id,
        name: meta.name,
        version: meta.version,
        description: meta.description,
        logo: meta.logo ?? 'icon.svg',
        readme: meta.readme ?? 'README.md',
        logoUrl: repoRelative.logoUrl,
        readmeUrl: repoRelative.readmeUrl,
        release: meta.version,
        permissions: [...meta.permissions],
        category: meta.category ?? 'Utilities'
    };
    if (meta.author) entry.author = meta.author;
    if (meta.license) entry.license = meta.license;
    if (meta.keywords) entry.keywords = [...meta.keywords];
    if (meta.homepage) entry.homepage = meta.homepage;
    if (meta.repository) entry.repository = meta.repository;
    if (meta.commands) entry.commands = [...meta.commands];
    if (meta.minimumNoxsVersion) entry.minimumNoxsVersion = meta.minimumNoxsVersion;
    return entry;
}

function rawUrls(pluginDir, meta) {
    // The store fetches logo + README straight from the repository so the
    // list/detail pages work even before a release exists.
    const repoRel = (file) => `https://raw.githubusercontent.com/web12-app/noxs-plugins/main/${path.relative(path.resolve(pluginDir, '..', '..'), path.resolve(pluginDir, file)).split(path.sep).join('/')}`;
    return {
        logoUrl: repoRel(meta.logo ?? 'icon.svg'),
        readmeUrl: repoRel(meta.readme ?? 'README.md')
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const registryFile = path.resolve(rootDir, args.registry);
    const ctx = validatePlugin(args.plugin);

    let checksum = args.checksum;
    if (!checksum) {
        // No checksum given: hash the built plugin.js so integrity is still
        // verifiable. The workflow normally passes the .noxs-plugin hash.
        const distJs = path.join(ctx.dist, 'plugin.js');
        if (!fs.existsSync(distJs)) {
            console.error('update-registry: dist/plugin.js missing — run the build first');
            process.exit(1);
        }
        checksum = crypto.createHash('sha256').update(fs.readFileSync(distJs)).digest('hex');
    }

    const registryRaw = fs.existsSync(registryFile)
        ? fs.readFileSync(registryFile, 'utf8')
        : '{"version": 1, "plugins": []}';
    const registry = JSON.parse(registryRaw);
    if (registry.version !== 1 || !Array.isArray(registry.plugins)) {
        console.error(`update-registry: ${args.registry} has an unsupported shape`);
        process.exit(1);
    }

    const repoRel = rawUrls(ctx.dir, ctx.meta);
    const entry = toEntry(ctx.meta, repoRel);
    entry.artifact = args.artifact;
    entry.checksum = checksum;
    entry.updatedAt = new Date().toISOString();
    if (args.tag) entry.releaseTag = args.tag;

    const index = registry.plugins.findIndex((p) => p.id === entry.id);
    if (index >= 0) registry.plugins[index] = entry;
    else registry.plugins.push(entry);
    registry.plugins.sort((a, b) => a.id.localeCompare(b.id));

    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2) + '\n', 'utf8');
    console.log(`registry: ${index >= 0 ? 'updated' : 'added'} ${entry.id} v${entry.version} (${registry.plugins.length} plugin(s))`);
}

main();
