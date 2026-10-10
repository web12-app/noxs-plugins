# SDK Demo

The reference example for the **Noxs Plugin SDK 0.0.1** (spec §10): the
smallest complete plugin that declares its SDK compatibility, uses only
documented SDK APIs, and ships as an ordinary store release.

## What it demonstrates

| Concern | How |
|---|---|
| SDK declaration | `sdkVersion: "0.0.1"`, `minimumSdkVersion: "0.0.1"` in `plugin.json` |
| API features | `apiFeatures: ["logging", "ui"]` — only what the plugin really uses |
| Permissions | `"ui"` only — the host enforces every call |
| UI windows | `noxs.sdk.ui.createWindow({ title, width, height })` |
| Logging | `noxs.sdk.log.info(...)` — routed to the Noxs log with level prefixes |
| Lifecycle | `activate()` logs and opens the window; `deactivate()` closes it |

## Files

```
plugins/sdk-demo/
├── plugin.json     # metadata + SDK requirements
├── README.md
├── icon.svg
└── src/main.js     # bundled by esbuild into dist/plugin.js
```

## How the runtime loads it

1. The Noxs app verifies the plugin's integrity and resolves a compatible
   SDK release (see the [SDK guide](../../docs/SDK.md)).
2. The verified SDK `index.js` is injected into the plugin's private
   JavaScript context — `window.noxs.sdk` appears.
3. `dist/plugin.js` runs and calls `activate(noxs)`; the plugin talks to
   the host only through the permission-checked SDK.

The fallback in `src/main.js` keeps the demo working on hosts that predate
SDK injection: SDK 0.0.1 wraps exactly the surface those hosts already
provide, so nothing new is assumed.

## Install

```sh
nx plug install sdk-demo
```

or open the Noxs Plugin Store (sidebar → Plugins) and tap **Install**.
