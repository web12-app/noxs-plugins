# Noxs Plugin SDK — versioning, compatibility and publishing

The **Noxs Plugin SDK** is the versioned, plugin-facing API contract of the
Noxs host. The Noxs app implements the host functionality behind that
contract; plugins declare which SDK release they were developed against and
the app resolves, downloads, verifies and injects the right one before any
plugin code runs.

This guide covers SDK versioning, plugin declarations, the compatibility
policy, publishing flows and troubleshooting. For a working example see
[`plugins/sdk-demo`](../plugins/sdk-demo).

---

## 1. How the SDK is versioned

The SDK uses independent semantic versioning (`MAJOR.MINOR.PATCH`), separate
from both the Noxs app version and every plugin's own version:

| Version | apiVersion | Features | Minimum Noxs | Status |
|---|---|---|---|---|
| `0.0.1` | `1` | `logging`, `ui`, `terminal` | `0.11.0` | stable |
| `0.0.2` | `1` | `logging`, `ui`, `terminal`, `storage` | `0.13.0` | stable |

Rules:

- **`apiVersion`** identifies the API generation. Backward-compatible
  additions (new features, new optional calls) stay inside the same
  generation — a plugin built on any release of generation `1` can run on a
  newer release of generation `1` when it does not use the new features.
- A **new major SDK** (new `apiVersion`) may break the contract; it never
  auto-migrates running plugins.
- The **Noxs app version** is independent: it decides which SDK releases
  the host can actually support. A newer SDK is not "supported" just
  because its files can be downloaded — the host must implement every
  feature behind it.

## 2. Repository layout

```
noxs-plugins/
├── registry.json               # plugin registry (the store list)
├── sdk/
│   ├── registry.json           # SDK download source: artifact URL + sha256
│   ├── 0.0.1/
│   │   ├── sdk.json            # release manifest (validated schema)
│   │   ├── index.js            # the SDK runtime (injected by the app)
│   │   └── types.d.ts          # TypeScript declarations
│   └── 0.0.2/
│       └── ...
├── plugins/<id>/               # one directory per plugin, per-plugin versioning
└── scripts/                    # validation, tests, registry tooling
```

Published SDK releases are **immutable**: the contents of `sdk/<version>/`
and the corresponding GitHub release never change after publication.
Plugins do not copy SDK source into their bundles — the app injects the
release it resolved.

## 3. The SDK manifest (`sdk.json`)

```json
{
  "name": "noxs-plugin-sdk",
  "version": "0.0.2",
  "apiVersion": "1",
  "entry": "index.js",
  "types": "types.d.ts",
  "status": "stable",
  "features": ["logging", "ui", "terminal", "storage"]
}
```

`scripts/validate-sdk.mjs` enforces the schema; `scripts/test-sdk.mjs`
executes each release against a mock Noxs host and asserts the documented
API. The Noxs app additionally refuses a downloaded release whose manifest
disagrees with its own capability table.

## 4. Declaring SDK compatibility in a plugin

```json
{
  "id": "example-plugin",
  "name": "Example Plugin",
  "version": "0.0.1",
  "main": "plugin.js",
  "permissions": ["ui", "storage"],
  "minimumNoxsVersion": "0.13.0",
  "sdkVersion": "0.0.2",
  "minimumSdkVersion": "0.0.1",
  "maximumSdkVersion": null,
  "apiFeatures": ["logging", "ui", "storage"]
}
```

| Field | Meaning |
|---|---|
| `sdkVersion` | the SDK release the plugin was developed against |
| `minimumSdkVersion` | lowest acceptable release (defaults to `sdkVersion` — a plugin is never silently assumed to work on an older SDK) |
| `maximumSdkVersion` | optional **exclusive** upper bound |
| `apiFeatures` | SDK capabilities the plugin actually requires |
| `version` | the plugin's own independent version |
| `minimumNoxsVersion` | minimum Noxs app version (independent of the SDK gate) |

Legacy manifests without SDK fields resolve to **`0.0.1`** — exactly the
host surface those plugins were built on, so migration is automatic, safe
and requires no app-source changes.

## 5. Compatibility policy

When a plugin is installed or opened, the Noxs app:

1. Validates the manifest (contradictory or unknown requirements are
   rejected — the store shows the plugin as **Blocked**).
2. Considers every SDK release the running app supports whose
   `apiVersion` matches `sdkVersion`'s generation and whose version lies in
   `[minimumSdkVersion, maximumSdkVersion)`.
3. Keeps only releases that provide every `apiFeatures` entry.
4. Prefers the newest **already installed** release; otherwise selects the
   newest supported release and downloads it from `sdk/registry.json`,
   verifying the published SHA-256 before extraction.
5. Refuses to execute anything before validation and integrity checks pass.

### Store states

| State | Meaning / what the user sees |
|---|---|
| `compatible` | installable/runnable on this Noxs release |
| `sdk_missing` | supported but not downloaded yet — fetched (and verified) on demand |
| `sdk_incompatible` | the plugin's requirements cannot be satisfied by this host |
| `app_update_required` | **"Update Noxs to X or newer to use this plugin."** — with the installed app version, the required version, the plugin version and the reason |
| `plugin_update_available` | a compatible newer plugin release exists; the installed one keeps working |
| `blocked` | validation, integrity or security checks failed |
| `error` | installation or activation failed |

If a compatible plugin release exists for the installed app, the store
offers that release as the alternative to updating Noxs. Plugins already
running on older supported SDK releases are never force-migrated.

## 6. Using the SDK API

```js
export default {
  async activate(noxs) {
    const api = noxs.sdk;                    // injected by the Noxs app
    api.log.info('Plugin activated');
    const win = api.ui.createWindow({ title: 'Demo', width: 360, height: 300 });
    win.on('go', () => api.log.info('clicked'));
    win.setHTML('<button id="go">Go</button>');
    win.show();

    // SDK 0.0.2+ (requires the "storage" permission):
    // api.storage.set('count', 1);
    // api.storage.get('count');
  },
  async deactivate() {
    // release windows, timers, listeners — everything the plugin owns
  }
};
```

The SDK wraps — and never replaces — the existing
`globalThis.__NOXS_PLUGIN__` lifecycle contract. Only APIs the Noxs host
actually implements appear on `noxs.sdk`; the host re-checks every call
against the plugin's `permissions`, so the manifest alone grants nothing.

## 7. Publishing

### Plugin releases (independent of app releases)

```sh
git tag hello-v1.0.2 && git push origin hello-v1.0.2
```

`release-plugin.yml` validates the manifest, validates all SDK releases,
runs the SDK unit tests, cross-checks SDK compatibility, builds, packages
the `.noxs-plugin` artifact, publishes the GitHub release and updates
`registry.json` with the artifact URL + sha256. A failed check prevents
publication.

### SDK releases (immutable)

```sh
# 1. create sdk/<version>/{sdk.json,index.js,types.d.ts}
git tag sdk-v0.0.3 && git push origin sdk-v0.0.3
```

`release-sdk.yml` validates the manifest, runs the SDK unit tests, verifies
every existing plugin still resolves, packages the `.noxs-sdk` artifact,
publishes the release and pins artifact + sha256 in `sdk/registry.json`.
It refuses to move the artifact or change the checksum of an
already-published version.

## 8. Troubleshooting compatibility errors

| Symptom | Cause / fix |
|---|---|
| "Update Noxs to X or newer to use this plugin" | the plugin's `minimumNoxsVersion` or a required feature needs a newer app — update Noxs, or install an older compatible plugin release if one is offered |
| "Incompatible with this Noxs" | the SDK range or a required API feature cannot be satisfied by this host (e.g. `maximumSdkVersion` below every supported release) |
| "Blocked" | the manifest is contradictory (e.g. `minimumSdkVersion > sdkVersion`) or an install failed its integrity checks — uninstall, then reinstall |
| Plugin shows "SDK will download" | normal: the release resolves but is not on the device yet; it downloads on install/open and is checksum-verified first |
| Everything else | `nx plug info <id>` shows the plugin's SDK and compatibility status |

## 9. Migrating older plugins

1. Add `sdkVersion` (`0.0.1` unless the plugin uses SDK 0.0.2-only APIs).
2. Add `apiFeatures` — exactly what `src/main.js` actually calls.
3. Bump the plugin's own `version` and tag a release
   (`<id>-v<version>`); the registry entry gains the SDK fields
   automatically.
4. Never assign a newer SDK than the code uses — the declaration is a
   contract, not a fashion statement.
