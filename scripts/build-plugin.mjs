#!/usr/bin/env node
/*
 * build-plugin.mjs — bundle a Noxs plugin into dist/.
 *
 * Pipeline (Noxs Plugin Store build contract):
 *   1.  validate plugin.json (full metadata validation, never skipped)
 *   2.  bundle src/main.js with esbuild -> dist/plugin.js (IIFE)
 *       exposing globalThis.__NOXS_PLUGIN__ = { id, version, activate, deactivate }
 *   3.  copy plugin.json -> dist/plugin.json
 *   4.  copy README      -> dist/README.md
 *   5.  copy logo        -> dist/icon.svg (original name preserved)
 *   6.  verify all four outputs exist
 *
 * Usage:
 *   node scripts/build-plugin.mjs <plugin-dir>     # build one plugin
 *   node scripts/build-plugin.mjs --all            # build plugins/*
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { validatePlugin } from './validate-plugin.mjs';

const require = createRequire(import.meta.url);

function esbuild() {
    try {
        return require('esbuild');
    } catch {
        console.error('build: esbuild is not installed — run "npm install" in the repository root');
        process.exit(1);
    }
}

/** Generated wrapper: re-exports the plugin default with identity injected. */
function wrapperSource(meta, entryImport) {
    return [
        `import plugin from '${entryImport}';`,
        `const __noxsActivate = typeof plugin === 'function' ? plugin : (plugin && plugin.activate);`,
        `const __noxsDeactivate = (plugin && typeof plugin.deactivate === 'function') ? plugin.deactivate : function () {};`,
        `if (typeof __noxsActivate !== 'function') {`,
        `  throw new Error('Noxs plugin ${meta.id}: src/main.js must default-export { activate } or a function');`,
        `}`,
        `globalThis.__NOXS_PLUGIN__ = {`,
        `  id: ${JSON.stringify(meta.id)},`,
        `  version: ${JSON.stringify(meta.version)},`,
        `  activate: __noxsActivate,`,
        `  deactivate: __noxsDeactivate`,
        `};`,
    ].join('\n');
}

export async function buildPlugin(pluginDir) {
    const ctx = validatePlugin(pluginDir); // step 1 — hard gate
    const dist = ctx.dist;
    fs.rmSync(dist, { recursive: true, force: true });
    fs.mkdirSync(dist, { recursive: true });

    // Step 2 — bundle through a generated wrapper entry.
    const wrapper = path.join(os.tmpdir(), `noxs-entry-${ctx.meta.id}-${process.pid}.mjs`);
    // Relative import keeps the wrapper portable regardless of repo layout.
    const relEntry = path.relative(os.tmpdir(), ctx.entry).split(path.sep).join('/');
    fs.writeFileSync(wrapper, wrapperSource(ctx.meta, './' + relEntry), 'utf8');
    try {
        await esbuild().build({
            entryPoints: [wrapper],
            bundle: true,
            format: 'iife',
            target: ['es2020'],
            platform: 'browser',
            outfile: path.join(dist, 'plugin.js'),
            minify: false,
            sourcemap: false,
            legalComments: 'inline',
            logLevel: 'silent'
        });
    } catch (error) {
        throw new Error(`esbuild failed for ${ctx.meta.id}: ${error.message}`);
    } finally {
        fs.rmSync(wrapper, { force: true });
    }

    // Steps 3-5 — metadata, README and logo are release artifacts too.
    fs.copyFileSync(path.join(ctx.dir, 'plugin.json'), path.join(dist, 'plugin.json'));
    fs.copyFileSync(ctx.readme, path.join(dist, path.basename(ctx.readme)));
    if (ctx.logo) fs.copyFileSync(ctx.logo, path.join(dist, path.basename(ctx.logo)));

    // Step 6 — verify the release artifact set.
    const required = ['plugin.js', 'plugin.json', path.basename(ctx.readme)];
    if (ctx.logo) required.push(path.basename(ctx.logo));
    for (const name of required) {
        const file = path.join(dist, name);
        if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
            throw new Error(`build output missing or empty: dist/${name}`);
        }
    }

    const kb = (fs.statSync(path.join(dist, 'plugin.js')).size / 1024).toFixed(1);
    console.log(`built     ${ctx.meta.id} v${ctx.meta.version} -> dist/plugin.js (${kb} KB)`);
    return dist;
}

async function main() {
    const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const arg = process.argv[2];
    const targets = arg === '--all' || !arg
        ? fs.readdirSync(path.join(rootDir, 'plugins'), { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => path.join(rootDir, 'plugins', e.name))
        : [path.resolve(arg)];

    let failures = 0;
    for (const dir of targets) {
        try {
            await buildPlugin(dir);
        } catch (error) {
            failures += 1;
            console.error(`FAILED    ${path.relative(rootDir, dir)}\n          ${error.message}`);
        }
    }
    if (failures > 0) {
        console.error(`\nbuild: ${failures} plugin(s) failed`);
        process.exit(1);
    }
    console.log(`\nbuild: done (${targets.length} plugin(s))`);
}

if (process.argv[1] && process.argv[1].endsWith('build-plugin.mjs')) {
    main();
}
