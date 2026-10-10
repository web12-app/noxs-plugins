/*
 * Hello — example Noxs plugin (original implementation).
 *
 * A Noxs plugin exports a default object with activate()/deactivate().
 * The Noxs build system bundles this file into dist/plugin.js and exposes
 * it to the host as:
 *
 *   globalThis.__NOXS_PLUGIN__ = { id, version, activate, deactivate }
 *
 * The `noxs` object handed to activate() is the Noxs Plugin API. Every
 * call is permission-checked inside the Noxs host — this plugin only
 * declares the "ui" permission, so only noxs.ui.* and noxs.log are
 * available to it.
 */

let windowCounter = 0;

function buildHtml() {
    return [
        '<div class="hello">',
        '  <h1>Hello Noxs</h1>',
        '  <p>This window was created by the <b>Hello</b> Noxs plugin.</p>',
        '  <p>Plugins are plain HTML rendered inside a Noxs window — no',
        '  privileged APIs are reachable without declaring permissions.</p>',
        '  <button id="run">Greet</button>',
        '  <button id="spawn">New window</button>',
        '  <pre id="output"></pre>',
        '</div>',
    ].join('\n');
}

function buildStyle() {
    return [
        '<style>',
        '  body { font-family: sans-serif; background: #10151c; color: #e6edf3;',
        '         padding: 16px; }',
        '  h1 { color: #7ce8b8; font-size: 22px; margin: 0 0 8px; }',
        '  button { background: #1d2733; color: #e6edf3; border: 1px solid #33414f;',
        '           border-radius: 6px; padding: 8px 14px; margin: 6px 6px 6px 0;',
        '           font-size: 14px; }',
        '  button:active { background: #27323f; }',
        '  pre { background: #0b1016; border: 1px solid #24303c; border-radius: 6px;',
        '        padding: 10px; min-height: 60px; white-space: pre-wrap; }',
        '</style>',
    ].join('\n');
}

export default {
    activate(noxs) {
        noxs.log('Hello plugin activated');

        this.handle = noxs.ui.createWindow({
            id: 'hello-window',
            title: 'Hello',
            width: 420,
            height: 600
        });

        this.handle.setHTML(buildStyle() + buildHtml());

        this.handle.on('run', () => {
            windowCounter += 1;
            const message = 'Hello from Noxs! Greeting #' + windowCounter +
                '\nPlugin: hello v' + (globalThis.__NOXS_PLUGIN__
                    ? globalThis.__NOXS_PLUGIN__.version : '?');
            this.handle.setText('#output', message);
            noxs.log('Hello greeted ' + windowCounter + ' time(s)');
        });

        this.handle.on('spawn', () => {
            const spawn = noxs.ui.createWindow({
                id: 'hello-window-' + (windowCounter + 1),
                title: 'Hello #' + (windowCounter + 1),
                width: 320,
                height: 240
            });
            spawn.setHTML(buildStyle() +
                '<div class="hello"><h1>Hi again</h1><p>Window #' +
                (windowCounter + 1) + '</p></div>');
            spawn.show();
        });

        this.handle.show();
    },

    deactivate() {
        if (this.handle) {
            try { this.handle.close(); } catch (error) { /* already gone */ }
            this.handle = null;
        }
    }
};
