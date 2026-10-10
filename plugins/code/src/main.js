/*
 * Code — Noxs plugin that opens files with Spck Editor (original implementation).
 *
 * The real editing happens in the terminal: the plugin ships a `code`
 * guest command (bin/code) that installs and starts the Spck CLI
 * (npm install -g spck) rooted at the directory the user wants to edit.
 * This activation script provides the Plugin Store quick-start window:
 * a status panel, a one-tap installer for the Spack CLI prerequisites
 * and pairing instructions.
 *
 * Permission map (enforced by the Noxs host, not by this file):
 *   ui        -> noxs.ui.createWindow (this file)
 *   terminal  -> noxs.terminal.exec (status + install buttons)
 */

let handle = null;

function style() {
    return [
        '<style>',
        '  body { font-family: sans-serif; background: #10151c; color: #e6edf3;',
        '         padding: 16px; }',
        '  h1 { color: #7ce8b8; font-size: 20px; margin: 0 0 4px; }',
        '  p.sub { color: #8ea0b3; margin: 0 0 14px; font-size: 13px; }',
        '  ol { padding-left: 20px; margin: 0 0 14px; }',
        '  li { margin: 6px 0; font-size: 14px; line-height: 1.45; }',
        '  code { background: #0b1016; border: 1px solid #24303c; border-radius: 4px;',
        '         padding: 1px 5px; font-size: 13px; }',
        '  button { background: #1d2733; color: #e6edf3; border: 1px solid #33414f;',
        '           border-radius: 6px; padding: 8px 14px; margin: 4px 6px 4px 0;',
        '           font-size: 14px; }',
        '  button:active { background: #27323f; }',
        '  pre { background: #0b1016; border: 1px solid #24303c; border-radius: 6px;',
        '        padding: 10px; min-height: 70px; max-height: 180px; overflow: auto;',
        '        white-space: pre-wrap; font-size: 12px; }',
        '</style>'
    ].join('\n');
}

function page() {
    return style() + [
        '<h1>Code — Spck Editor</h1>',
        '<p class="sub">Open files from any path in the Spck code editor.</p>',
        '<ol>',
        '  <li>In the Noxs terminal run: <code>code &lt;path&gt;</code></li>',
        '  <li>First run installs Node.js, npm and the Spck CLI, then asks you',
        '      to sign in to Spck — follow the prompts.</li>',
        '  <li>Open Spck Editor (app or <code>https://spck.io</code>) and connect',
        '      to this device.</li>',
        '  <li>Edit any file inside the directory you served — changes save',
        '      straight to the Noxs filesystem.</li>',
        '</ol>',
        '<button id="install">Install Spck CLI</button>',
        '<button id="status">Check status</button>',
        '<pre id="output">Ready.</pre>'
    ].join('\n');
}

function run(noxs, label, command) {
    noxs.log('code: ' + label);
    handle.setText('#output', '$ ' + command + '\nrunning...');
    noxs.terminal.exec(command).then(function (result) {
        var out = (result.stdout || '') + (result.stderr || '');
        if (result.exitCode === 0 && out.trim() === '') {
            out = 'done';
        }
        handle.setText('#output', '$ ' + command +
            '\nexit code: ' + result.exitCode + '\n' + out);
    }).catch(function (error) {
        handle.setText('#output', '$ ' + command + '\nfailed: ' + error);
    });
}

export default {
    activate(noxs) {
        noxs.log('Code plugin activated');

        handle = noxs.ui.createWindow({
            id: 'code-quickstart',
            title: 'Code — Spck Editor',
            width: 460,
            height: 640
        });
        handle.setHTML(page());

        handle.on('status', function () {
            run(noxs, 'status check',
                'command -v spck >/dev/null 2>&1 && spck --version 2>/dev/null || echo "spck is not installed yet"');
        });

        handle.on('install', function () {
            run(noxs, 'installing Spck CLI',
                'command -v npm >/dev/null 2>&1 && npm install --silent --global spck || echo "npm is missing — run: sudo apt-get install -y nodejs npm"');
        });

        handle.show();
    },

    deactivate() {
        if (handle) {
            try { handle.close(); } catch (error) { /* already gone */ }
            handle = null;
        }
    }
};
