/*
 * Basic Noxs plugin template (original implementation).
 *
 * Export a default object with activate()/deactivate(). The Noxs build
 * system bundles src/main.js (plus anything it imports from src/) into
 * dist/plugin.js and exposes globalThis.__NOXS_PLUGIN__.
 *
 * Declare every capability you use in plugin.json → "permissions".
 * The Noxs host enforces permissions — undeclared calls are refused.
 */
export default {
    activate(noxs) {
        noxs.log('Basic template activated');

        this.window = noxs.ui.createWindow({
            id: 'my-plugin-window',
            title: 'My Plugin',
            width: 360,
            height: 480
        });
        this.window.setHTML(
            '<style>body{font-family:sans-serif;background:#10151c;color:#e6edf3;padding:16px}' +
            'h1{color:#7ce8b8;font-size:20px}</style>' +
            '<h1>It works</h1><p>Edit src/main.js and rebuild.</p>'
        );
        this.window.show();
    },

    deactivate() {
        if (this.window) {
            try { this.window.close(); } catch (error) { /* already gone */ }
            this.window = null;
        }
    }
};
