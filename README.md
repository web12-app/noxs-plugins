# Noxs Plugins

Official plugin registry and development repository for the
[Noxs](https://github.com/web12-app/noxs) Plugin Store.

The Noxs Plugin Store is built into Noxs — open it from the sidebar
(**Plugins**) or by running `nx plug` in a Noxs terminal. Both entry
points use the same Plugin Manager service.

## Repository layout

```
noxs-plugins/
├── registry.json              # Plugin Store registry (what the store lists)
├── sdk/                       # Published Noxs Plugin SDK releases (immutable)
│   ├── registry.json          # SDK download source (artifact + sha256)
│   └── <version>/             # sdk.json, index.js, types.d.ts per release
├── templates/basic/           # Starter template for new plugins
├── plugins/hello/             # Example plugin (install: nx plug install hello)
├── plugins/code/              # Code plugin — open files with Spck Editor
├── scripts/
│   ├── validate-plugin.mjs    # Metadata + structure validation (build gate)
│   ├── validate-sdk.mjs       # SDK manifest validation (build gate)
│   ├── test-sdk.mjs           # SDK unit tests against a mock NoxsHost
│   ├── check-plugin-sdk.mjs   # Plugin <-> SDK compatibility cross-check
│   ├── build-plugin.mjs       # esbuild bundling -> dist/plugin.js
│   └── update-registry.mjs    # Registry upsert after a release
└── .github/workflows/
    └── release-plugin.yml     # Tag-driven release pipeline
```

## Writing a plugin

A Noxs plugin is a folder with:

```
my-plugin/
├── plugin.json    # metadata (id, name, version, permissions, ...)
├── README.md      # shown on the plugin details page
├── icon.svg       # logo shown in the store (svg/png/webp/jpg)
├── bin/           # optional guest command scripts (see below)
└── src/
    └── main.js    # entry — default-exports { activate, deactivate }
```

Minimal `plugin.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "What it does",
  "main": "plugin.js",
  "permissions": ["ui"],
  "minimumNoxsVersion": "0.11.0",
  "sdkVersion": "0.0.1",
  "apiFeatures": ["logging", "ui"]
}
```

`sdkVersion` declares which Noxs Plugin SDK release the plugin was
developed against; `apiFeatures` lists the SDK capabilities it requires.
See [docs/SDK.md](docs/SDK.md) for the full versioning and compatibility
model.

Minimal entry (`src/main.js`):

```js
export default {
    activate(noxs) {
        noxs.log('activated');
        const win = noxs.ui.createWindow({
            id: 'my-window', title: 'My Plugin', width: 360, height: 480
        });
        win.setHTML('<h1>Hello</h1>');
        win.show();
    },
    deactivate() {}
};
```

The build produces a stable runtime object —
`globalThis.__NOXS_PLUGIN__ = { id, version, activate, deactivate } —`
which the Noxs host connects to the `noxs` Plugin API.

### Permissions

| Permission      | Grants                                              |
| --------------- | --------------------------------------------------- |
| `ui`            | Windows (`noxs.ui.*`)                               |
| `terminal`      | `noxs.terminal.exec()` / `createSession()`          |
| `filesystem`    | Plugin-scoped file access                           |
| `storage`       | Plugin key/value storage                            |
| `network`       | Outbound requests                                   |
| `notifications` | Noxs notifications                                  |
| `background`    | Survives window close                               |

Permissions are enforced inside the Noxs host — a plugin cannot reach
Android APIs or private Noxs objects, and a broken plugin cannot crash
Noxs.

### Guest command scripts (bin/)

A plugin can ship real terminal commands. Put executable scripts (starting
with a `#!` shebang) into a `bin/` folder; the Noxs Plugin Manager installs
each `bin/<name>` as `<name>` in the guest `/usr/local/bin` at install time,
so the command works from **any path** in the user's own shell. Rules:

- only plugins granted the `terminal` permission get commands installed
- script names must match `^[a-z0-9][a-z0-9-]{1,63}$`
- scripts must start with a `#!` shebang and stay under 128 KB
- existing foreign files are never overwritten; every Noxs-installed
  command carries an ownership marker so uninstall/disable removes exactly
  what the plugin installed

See `plugins/code/bin/code` for a complete example.

## Noxs Plugin SDK

Plugins run against a versioned **Noxs Plugin SDK** — a documented,
permission-checked JavaScript API (`noxs.sdk`) the Noxs app injects before
the plugin code executes. Key rules:

- Each plugin declares `sdkVersion` (developed against), an optional
  `[minimumSdkVersion, maximumSdkVersion)` compatibility range and its
  required `apiFeatures`.
- Published SDK releases are **immutable** (`sdk/<version>/` never changes
  after its release); the app downloads and SHA-256-verifies them before a
  plugin runs.
- The app resolves the newest compatible release — preferring one already
  installed — and shows a precise compatibility state in the store when a
  plugin needs a newer app or an unsupported feature.
- Legacy manifests without SDK fields resolve to the initial stable SDK
  **0.0.1** (exactly the pre-SDK host surface).

Full guide: [docs/SDK.md](docs/SDK.md).

## Build & validate

```sh
npm install
npm run validate      # every plugin in plugins/
npm run build:all     # bundle every plugin -> dist/
```

Each plugin build writes `dist/plugin.js`, `dist/plugin.json`,
`dist/README.md` and `dist/icon.svg` (plus `dist/bin/` when the plugin
ships guest command scripts). Validation failures abort the build —
invalid metadata is never ignored.

## Releasing

1. Bump `version` in the plugin's `plugin.json`.
2. Tag: `git tag hello-v1.0.0 && git push origin hello-v1.0.0`.
3. The `release-plugin` workflow validates, builds, packages
   `hello-1.0.0.noxs-plugin` (a gzipped tar of the dist files), publishes
   the GitHub Release with assets (`plugin.js`, `plugin.json`,
   `README.md`, `icon.svg`, artifact + sha256), and updates
   `registry.json` automatically.

A release is never published if validation or the build fails.

## Installing in Noxs

- Store UI: sidebar → **Plugins** → search → **Install**
- CLI: `nx plug install hello`

Both use the same Plugin Manager. Installed plugins live in
`~/.noxs/plugins/<id>/` inside the Noxs Linux environment.
