# Hello

Example Noxs plugin. It demonstrates the smallest complete Noxs plugin:
a `plugin.json`, an SVG logo, a README, and a small JavaScript entry that
opens a native Noxs window.

## What it does

When activated, Hello opens a Noxs window and wires three interactions:

- **Greet** — writes a greeting line into the output panel
- **New window** — spawns an extra Noxs window to show multi-window support
- Closing the window deactivates cleanly through `deactivate()`

It only requests the `ui` permission, so every call outside `noxs.ui`
is refused by the Noxs host.

## Install

Open the Noxs Plugin Store (sidebar → **Plugins**, or run `nx plug`) and
press **Install**. From a terminal:

```sh
nx plug install hello
```

## Files

| File         | Purpose                          |
| ------------ | -------------------------------- |
| `plugin.json`| Noxs plugin metadata             |
| `src/main.js`| Plugin entry (bundled by esbuild)|
| `icon.svg`   | Logo shown in the Plugin Store   |
| `README.md`  | This document                    |

## Use it as a template

Copy `templates/basic` from the [noxs-plugins repository](https://github.com/web12-app/noxs-plugins),
edit `plugin.json`, and run `npm run build` — the output lands in
`dist/plugin.js` ready to release.
