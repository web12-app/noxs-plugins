/*
 * OpenCode — Noxs plugin for the open source AI coding agent
 * (https://github.com/anomalyco/opencode). Original implementation.
 *
 * The heavy lifting happens in the terminal: the plugin ships an `opencode`
 * guest command (bin/opencode) that installs the real OpenCode CLI, runs
 * the TUI chat, serves the web chat UI on 127.0.0.1 and auto-opens it in
 * the Noxs floating browser through `nx ow`. This activation script is the
 * quick-start window: one-tap actions that need no text input, plus the
 * exact terminal commands for anything that carries an API key.
 *
 * The Noxs window bridge is write-only (setHTML / setText / click events),
 * so keys are never collected here — they are prompted in the terminal by
 * `opencode free` and `opencode provider-add`, or stored by
 * `opencode auth login` for official providers.
 *
 * Permission map (enforced by the Noxs host, not by this file):
 *   ui        -> noxs.ui.createWindow (this file)
 *   terminal  -> noxs.terminal.exec (status / setup / web actions)
 *   network   -> the installer and the agent itself run in the guest
 */

let handle = null;

function style() {
    return [
        '<style>',
        '  body { font-family: sans-serif; background: #10151c; color: #e6edf3;',
        '         padding: 16px; }',
        '  h1 { color: #86d8ff; font-size: 20px; margin: 0 0 4px; }',
        '  p.sub { color: #8ea0b3; margin: 0 0 14px; font-size: 13px; }',
        '  h2 { color: #9db2c5; font-size: 13px; margin: 14px 0 6px;',
        '       text-transform: uppercase; letter-spacing: 1px; }',
        '  button { background: #1d2733; color: #e6edf3; border: 1px solid #33414f;',
        '           border-radius: 6px; padding: 8px 12px; margin: 3px 3px 3px 0;',
        '           font-size: 14px; }',
        '  button.primary { background: #17324a; border-color: #2c5d8f; color: #cfe9ff; }',
        '  button:active { background: #27323f; }',
        '  code { background: #0b1016; border: 1px solid #24303c; border-radius: 4px;',
        '         padding: 1px 5px; font-size: 13px; }',
        '  pre { background: #0b1016; border: 1px solid #24303c; border-radius: 6px;',
        '        padding: 10px; min-height: 90px; max-height: 220px; overflow: auto;',
        '        white-space: pre-wrap; font-size: 12px; }',
        '</style>'
    ].join('\n');
}

function page() {
    return style() + [
        '<h1>OpenCode — AI Agent</h1>',
        '<p class="sub">The open source AI coding agent (github.com/anomalyco/opencode):',
        'chat in the terminal or in your browser, with free models or your own provider.</p>',

        '<h2>Chat</h2>',
        '<button id="status" class="primary">Status</button>',
        '<button id="install">Install / Update CLI</button>',
        '<button id="web" class="primary">Open Web Chat</button>',
        '<button id="webstop">Stop Web Server</button>',
        '<p class="sub" style="margin-top:8px">Terminal chat: just run <code>opencode</code>.',
        'Web chat auto-opens in the Noxs browser on <code>http://127.0.0.1:4096</code>.</p>',

        '<h2>Free models (one-time setup)</h2>',
        '<button id="free-or">OpenRouter :free</button>',
        '<button id="free-groq">Groq free</button>',
        '<button id="free-gemini">Gemini free</button>',
        '<p class="sub" style="margin-top:8px">Buttons show the setup command — run it in the',
        'terminal and paste your free API key when prompted.</p>',

        '<h2>Custom provider</h2>',
        '<button id="prov-add">OpenAI-compatible…</button>',
        '<button id="prov-list">List providers</button>',
        '<button id="auth">Official providers</button>',

        '<h2>Output</h2>',
        '<pre id="output">Welcome. Tap Status to begin.</pre>'
    ].join('\n');
}

function run(noxs, label, command) {
    noxs.log('opencode: ' + label);
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

function show(noxs, title, lines) {
    noxs.log('opencode: ' + title);
    handle.setText('#output', title + '\n\n' + lines.join('\n'));
}

export default {
    activate(noxs) {
        noxs.log('OpenCode plugin activated');

        handle = noxs.ui.createWindow({
            id: 'opencode-quickstart',
            title: 'OpenCode — AI Agent',
            width: 470,
            height: 680
        });
        handle.setHTML(page());

        handle.on('status', function () {
            run(noxs, 'status check', 'opencode status');
        });

        handle.on('install', function () {
            run(noxs, 'installing/updating the OpenCode CLI',
                'opencode setup');
        });

        handle.on('web', function () {
            run(noxs, 'starting the web chat UI and opening the Noxs browser',
                'opencode web');
        });

        handle.on('webstop', function () {
            run(noxs, 'stopping the web server', 'opencode web --stop');
        });

        handle.on('free-or', function () {
            show(noxs, 'Free mode · OpenRouter (:free models cost nothing)', [
                '1. Get a free key:  https://openrouter.ai/keys',
                '2. In the Noxs terminal run:',
                '',
                '   opencode free openrouter <your-key>',
                '',
                '(or just  opencode free openrouter  — it prompts for the key)',
                'Then chat:  opencode   (TUI)  or tap  Open Web Chat.'
            ]);
        });

        handle.on('free-groq', function () {
            show(noxs, 'Free mode · Groq (free API tier)', [
                '1. Get a free key:  https://console.groq.com/keys',
                '2. In the Noxs terminal run:',
                '',
                '   opencode free groq <your-key>',
                '',
                'Then chat:  opencode   (TUI)  or tap  Open Web Chat.'
            ]);
        });

        handle.on('free-gemini', function () {
            show(noxs, 'Free mode · Google Gemini (free API tier)', [
                '1. Get a free key:  https://aistudio.google.com/apikey',
                '2. In the Noxs terminal run:',
                '',
                '   opencode free gemini <your-key>',
                '',
                'Then chat:  opencode   (TUI)  or tap  Open Web Chat.'
            ]);
        });

        handle.on('prov-add', function () {
            show(noxs, 'Add any OpenAI-compatible provider', [
                'In the Noxs terminal run:',
                '',
                '  opencode provider-add <id> <baseURL> <model> [name] [key]',
                '',
                'Example (OpenAI):',
                '  opencode provider-add openai https://api.openai.com/v1 \\',
                '      gpt-4o-mini "OpenAI" sk-...',
                '',
                'Example (local/LAN server):',
                '  opencode provider-add mybox http://192.168.1.10:8000/v1 \\',
                '      my-model',
                '',
                'Keys are prompted in the terminal and stored only on this',
                'device (chmod 600). Your own opencode.json is never touched.',
                'Official providers (Anthropic, OpenAI, Google, Zen, ...):',
                '  opencode auth login'
            ]);
        });

        handle.on('prov-list', function () {
            run(noxs, 'listing configured providers', 'opencode provider-list');
        });

        handle.on('auth', function () {
            show(noxs, 'Official providers', [
                'OpenCode has a built-in login flow for official providers',
                '(OpenCode Zen, Anthropic, OpenAI, Google, Groq, Azure, ...).',
                '',
                'In the Noxs terminal run:',
                '',
                '  opencode auth login',
                '',
                'Pick a provider, paste its key, then start chatting:',
                '  opencode            (terminal TUI)',
                '  opencode web        (browser UI, auto-opens here)'
            ]);
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
