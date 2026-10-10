/*
 * sdk-demo — the Noxs Plugin SDK 0.0.1 example plugin (spec §10).
 *
 * Shows the smallest complete plugin against the documented SDK surface:
 *   - declares sdkVersion "0.0.1" / apiFeatures ["logging", "ui"]
 *   - logs activation and deactivation through the SDK logger
 *   - displays one Noxs window with a button; clicks come back over the
 *     window event bus (element id "increment")
 *   - requests only the "ui" permission
 *
 * The SDK object (window.noxs.sdk) is injected by the Noxs app before this
 * bundle runs; the fallback keeps the plugin runnable on hosts that predate
 * SDK injection (SDK 0.0.1 is exactly that host surface).
 */

function resolveSdk() {
  if (typeof window !== 'undefined' && window.noxs) {
    if (window.noxs.sdk) {
      return { sdk: window.noxs.sdk, kind: 'sdk' };
    }
    /* Legacy host surface — the same calls SDK 0.0.1 wraps. */
    return {
      sdk: {
        log: { info: function (m) { window.noxs.log(String(m)); } },
        ui: { createWindow: function (p) { return window.noxs.ui.createWindow(p); } }
      },
      kind: 'legacy'
    };
  }
  return null;
}

function buildStyle() {
  return [
    '<style>',
    '  body { background:#10151c; color:#e6edf3; font-family:sans-serif;',
    '         display:flex; flex-direction:column; align-items:center;',
    '         justify-content:center; height:100vh; margin:0; }',
    '  h1 { font-size:16px; color:#7ce8b8; margin:0 0 12px; }',
    '  #count { font-size:34px; font-weight:700; margin-bottom:16px; }',
    '  button { background:#1f4d38; border:0; color:#7ce8b8; font-size:14px;',
    '           padding:10px 22px; border-radius:10px; }',
    '</style>'
  ].join('');
}

function buildPage() {
  return [
    '<div class="demo">',
    '  <h1>Noxs Plugin SDK demo</h1>',
    '  <div id="count">0</div>',
    '  <button id="increment">Add one</button>',
    '</div>'
  ].join('');
}

export default {
  activate(noxs) {
    var resolved = resolveSdk();
    if (!resolved) {
      throw new Error('Noxs Plugin SDK demo: the Noxs bridge is unavailable');
    }
    var sdk = resolved.sdk;

    var count = 0;
    var win = sdk.ui.createWindow({
      title: 'SDK Demo',
      width: 360,
      height: 300
    });

    win.on('increment', function () {
      count += 1;
      win.setText('#count', String(count));
      sdk.log.info('sdk-demo counter=' + count);
    });

    /* The window activity replays buffered ops on attach, so the plugin may
       configure its window before it is visible. */
    win.setHTML(buildStyle() + buildPage());
    win.show();

    sdk.log.info('sdk-demo activated (Noxs Plugin SDK ' + resolved.kind + ')');
    this._window = win;
  },

  deactivate() {
    if (this._window) {
      try {
        this._window.close();
      } catch (e) {
        /* the host already destroyed the window */
      }
      this._window = null;
    }
    if (typeof window !== 'undefined' && window.noxs) {
      var sdk = window.noxs.sdk;
      var info = sdk && sdk.log && sdk.log.info
        ? sdk.log.info
        : function (m) { window.noxs.log(String(m)); };
      info('sdk-demo deactivated');
    }
  }
};
