#!/usr/bin/env node
/* Negative + positive verification for the bin/ validation gate and the
 * code plugin bundle. Mirrors the checks used for the hello plugin. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validatePlugin, PluginValidationError, MAX_BIN_BYTES } from './validate-plugin.mjs';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const scratch = fs.mkdtempSync(path.join(repo, '.verify-'));
let failures = 0;

function expect(name, fn, shouldPass) {
    let outcome;
    try { fn(); outcome = 'pass'; } catch (error) { outcome = (error instanceof PluginValidationError || error instanceof Error) ? 'fail' : 'error'; }
    const ok = shouldPass ? outcome === 'pass' : outcome === 'fail';
    console.log(`${ok ? 'ok       ' : 'FAILED   '} ${name}`);
    if (!ok) failures += 1;
}

function copyPlugin(mods) {
    const dir = path.join(scratch, `p-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
    fs.copyFileSync(path.join(repo, 'plugins/code/plugin.json'), path.join(dir, 'plugin.json'));
    fs.copyFileSync(path.join(repo, 'plugins/code/README.md'), path.join(dir, 'README.md'));
    fs.copyFileSync(path.join(repo, 'plugins/code/icon.svg'), path.join(dir, 'icon.svg'));
    fs.copyFileSync(path.join(repo, 'plugins/code/src/main.js'), path.join(dir, 'src/main.js'));
    for (const [rel, content] of Object.entries(mods || {})) {
        const target = path.join(dir, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
    return dir;
}

const script = '#!/bin/sh\necho hi\n';

expect('code plugin validates as-is', () => validatePlugin(path.join(repo, 'plugins/code')), true);
expect('bin script with shebang passes', () => validatePlugin(copyPlugin({ 'bin/tool': script })), true);
expect('bin script without shebang fails', () => validatePlugin(copyPlugin({ 'bin/tool': 'echo hi\n' })), false);
expect('bin script with uppercase name fails', () => validatePlugin(copyPlugin({ 'bin/Tool': script })), false);
expect('bin script escaping via dot-name fails', () => validatePlugin(copyPlugin({ 'bin/..code': script })), false);
expect('empty bin script fails', () => validatePlugin(copyPlugin({ 'bin/tool': '' })), false);
expect('oversized bin script fails', () => validatePlugin(copyPlugin({ 'bin/tool': '#!/bin/sh\n' + 'x'.repeat(MAX_BIN_BYTES) })), false);
expect('bin with directory entry fails', () => {
    const dir = copyPlugin({});
    fs.mkdirSync(path.join(dir, 'bin/nested'), { recursive: true });
    validatePlugin(dir);
}, false);
expect('hello (no bin) still validates', () => validatePlugin(path.join(repo, 'plugins/hello')), true);

// Bundle smoke test: the built plugin.js must expose the runtime object.
const bundle = fs.readFileSync(path.join(repo, 'plugins/code/dist/plugin.js'), 'utf8');
const sandbox = { console, globalThis: {} };
sandbox.globalThis = sandbox;
const exposed = bundle.includes('__NOXS_PLUGIN__') && bundle.includes('activate') && bundle.includes('deactivate');
console.log(`${exposed ? 'ok       ' : 'FAILED   '} bundle exposes __NOXS_PLUGIN__`);
if (!exposed) failures += 1;

// CLI negative check: validate must exit non-zero on a broken plugin.
const bad = copyPlugin({ 'bin/tool': 'echo no shebang\n' });
const run = spawnSync(process.execPath, [path.join(repo, 'scripts/validate-plugin.mjs'), bad], { encoding: 'utf8' });
const cliOk = run.status === 1 && /bin: .*shebang/.test(run.stderr);
console.log(`${cliOk ? 'ok       ' : 'FAILED   '} validate CLI exits 1 with a clear message`);
if (!cliOk) failures += 1;

fs.rmSync(scratch, { recursive: true, force: true });
console.log(failures === 0 ? '\nverify: all checks passed' : `\nverify: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
