# My Plugin

Starter template for Noxs plugins. Copy this folder into `plugins/<id>/`,
rename the id inside `plugin.json`, and start building.

## Quick start

```sh
cp -r templates/basic plugins/my-plugin
cd plugins/my-plugin
npm run validate   # check plugin.json + required files
npm run build      # bundle src/main.js -> dist/plugin.js
```

## Checklist before release

1. Unique plugin `id` (lowercase letters, digits, dashes)
2. Semantic `version` (MAJOR.MINOR.PATCH)
3. `description` describes what the plugin actually does
4. `permissions` lists only what you truly use
5. `icon.svg` present and referenced from `logo`
6. `README.md` explains install and usage
7. `npm run validate` passes

## Release

Tag the repository as `<id>-v<version>` (for example
`my-plugin-v0.1.0`) and push the tag — the release workflow validates,
builds, packages a `.noxs-plugin` archive, publishes the GitHub Release,
and updates `registry.json` automatically.
