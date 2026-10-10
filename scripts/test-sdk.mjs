#!/usr/bin/env node
/*
 * test-sdk.mjs — unit tests for the published Noxs Plugin SDK bundles.
 *
 * Each sdk/<version>/index.js is executed in a Node vm sandbox with a mock
 * NoxsHost bridge, then the documented API contract is asserted:
 *   - window.noxs.sdk exists with version/apiVersion/features matching sdk.json
 *   - log routes to the host with [level] prefixes
 *   - ui.createWindow goes through the host and returns a window handle
 *   - terminal.exec resolves with the host result
 *   - 0.0.2+: storage get/set/remove/keys round-trip through the host,
 *     including JSON-encoded values and refused-call degradation
 *   - double-loading is a no-op (immutability guard)
 *
 * Usage: node scripts/test-sdk.mjs [sdk-dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { validateSdk } from './validate-sdk.mjs';

let failures = 0;
let passes = 0;

function check(name, condition, detail) {
    if (condition) {
        passes += 1;
        console.log(`ok        ${name}`);
    } else {
        failures += 1;
        console.error(`FAILED    ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function makeSandbox() {
    const hostCalls = { log: [], createWindow: [], windowOps: [], exec: [], storage: [] };
    const windows = {};
    let windowSeq = 0;
    const store = new Map();

    const host = {
        log(message) { hostCalls.log.push(String(message)); },
        createWindow(paramsJson) {
            const params = JSON.parse(paramsJson || '{}');
            const id = `win-${(windowSeq += 1)}`;
            windows[id] = params;
            hostCalls.createWindow.push(params);
            return id;
        },
        windowOp(targetWindowId, op, arg) {
            hostCalls.windowOps.push([targetWindowId, op, arg]);
            return true;
        },
        exec(requestId, command) {
            hostCalls.exec.push([requestId, command]);
            return true;
        },
        storageOp(op, key, value) {
            hostCalls.storage.push([op, key, value]);
            if (op === 'get') {
                return store.has(key) ? JSON.stringify(store.get(key)) : null;
            }
            if (op === 'set') {
                store.set(key, JSON.parse(value));
                return '"ok"';
            }
            if (op === 'remove') {
                store.delete(key);
                return '"ok"';
            }
            if (op === 'keys') {
                return JSON.stringify([...store.keys()]);
            }
            return null;
        }
    };

    /* A minimal mirror of the app's BOOTSTRAP_JS shim, enough for the SDK. */
    function makeWindowHandle(id) {
        return {
            id,
            show() { host.windowOp(id, 'show', ''); },
            hide() { host.windowOp(id, 'hide', ''); },
            close() { host.windowOp(id, 'close', ''); },
            setHTML(html) { host.windowOp(id, 'setHTML', String(html)); },
            setText(sel, text) { host.windowOp(id, 'setText', JSON.stringify([String(sel), String(text)])); },
            on() {},
            emit() {}
        };
    }

    const window = {
        NoxsHost: host,
        noxs: {
            log: function (m) { host.log(String(m)); },
            ui: {
                createWindow: function (params) {
                    const id = host.createWindow(JSON.stringify(params || {}));
                    if (!id) throw new Error('window refused by the Noxs host');
                    return makeWindowHandle(id);
                }
            },
            terminal: {
                exec: function (cmd) {
                    return Promise.resolve({ exitCode: 0, stdout: `ran:${cmd}`, stderr: '' });
                }
            }
        }
    };

    const sandbox = { window, console, JSON, Promise, Object, String, Array, Error, Math };
    sandbox.globalThis = sandbox;
    return { sandbox, hostCalls, windows };
}

function loadSdk(sdkDir) {
    const ctx = validateSdk(sdkDir);
    const code = fs.readFileSync(path.join(sdkDir, 'index.js'), 'utf8');
    const env = makeSandbox();
    vm.runInNewContext(code, env.sandbox, { filename: `sdk-${ctx.manifest.version}.js` });
    return { ctx, env, sdk: env.sandbox.window.noxs.sdk };
}

function testSdk(sdkDir) {
    const { ctx, env, sdk } = loadSdk(sdkDir);
    const v = ctx.manifest.version;
    const label = `sdk ${v}`;

    check(`${label}: exposes window.noxs.sdk`, Boolean(sdk));
    check(`${label}: window.NoxsSdk mirrors noxs.sdk`, env.sandbox.window.NoxsSdk === sdk);
    check(`${label}: version matches sdk.json`, sdk && sdk.version === ctx.manifest.version);
    check(`${label}: apiVersion matches sdk.json`, sdk && sdk.apiVersion === ctx.manifest.apiVersion);
    check(
        `${label}: features match sdk.json`,
        sdk && JSON.stringify(sdk.features) === JSON.stringify(ctx.manifest.features),
        sdk && `${JSON.stringify(sdk.features)} vs ${JSON.stringify(ctx.manifest.features)}`
    );

    // logging
    sdk.log.info('hello');
    sdk.log.warn('careful');
    sdk.log.error('boom');
    check(`${label}: log routes with [level] prefixes`,
        env.hostCalls.log.join('|') === '[info] hello|[warn] careful|[error] boom',
        env.hostCalls.log.join('|'));

    // ui
    const win = sdk.ui.createWindow({ title: 'Demo', width: 300, height: 200 });
    check(`${label}: createWindow returns a handle with an id`, Boolean(win && win.id));
    check(`${label}: createWindow reached the host`, env.hostCalls.createWindow.length === 1);
    win.show();
    win.setHTML('<p>hi</p>');
    check(`${label}: window ops reach the host`,
        env.hostCalls.windowOps[0][1] === 'show' && env.hostCalls.windowOps[1][1] === 'setHTML');

    // terminal
    return sdk.terminal.exec('echo hi').then((result) => {
        check(`${label}: exec resolves with the host result`,
            result && result.exitCode === 0 && result.stdout === 'ran:echo hi');

        if (v === '0.0.2') {
            check(`${label}: storage.set stores JSON values`, sdk.storage.set('counter', 42) === true);
            check(`${label}: storage.get returns the value`, sdk.storage.get('counter') === 42);
            sdk.storage.set('note', 'hello "world"\n');
            check(`${label}: storage survives special characters`, sdk.storage.get('note') === 'hello "world"\n');
            check(`${label}: storage.keys lists keys`, JSON.stringify(sdk.storage.keys()) === JSON.stringify(['counter', 'note']));
            check(`${label}: storage.remove deletes a key`, sdk.storage.remove('counter') === true && sdk.storage.get('counter') === undefined);
            check(`${label}: storage.get of a miss is undefined`, sdk.storage.get('ghost') === undefined);
            check(`${label}: storage calls reached the host`, env.hostCalls.storage.length >= 5);
        } else {
            check(`${label}: pre-storage releases expose no storage API`,
                sdk.storage === undefined);
        }

        // double load is a no-op
        const before = env.hostCalls.log.length;
        vm.runInNewContext(fs.readFileSync(path.join(sdkDir, 'index.js'), 'utf8'), vm.createContext(env.sandbox));
        check(`${label}: double load is a no-op`, env.hostCalls.log.length === before && env.sandbox.window.noxs.sdk === sdk);
    });
}

function sdkDirs(rootDir, only) {
    if (only) return [path.resolve(only)];
    const root = path.join(rootDir, 'sdk');
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^\d+\.\d+\.\d+$/.test(e.name))
        .map((e) => path.join(root, e.name))
        .sort();
}

async function main() {
    const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const targets = sdkDirs(rootDir, process.argv[2]);
    if (targets.length === 0) {
        console.error('test-sdk: no sdk releases found');
        process.exit(1);
    }
    for (const dir of targets) {
        try {
            await testSdk(dir);
        } catch (error) {
            failures += 1;
            console.error(`FAILED    ${path.relative(rootDir, dir)} — ${error && error.stack ? error.stack : error}`);
        }
    }
    console.log(`\ntest-sdk: ${passes} passed, ${failures} failed (${targets.length} release(s))`);
    if (failures > 0) process.exit(1);
}

main();
