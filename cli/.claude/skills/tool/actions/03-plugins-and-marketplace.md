# 03 - Plugins and Marketplace

Configure `PluginsCapability` for the tool, including `marketplaceSettings` when the tool
supports a plugin marketplace, and wire `translationMode` and `installScope` appropriately.

## Inputs

- `tool-name` (required) - string, kebab-case tool name matching the file from 01
- `mode` (required) - one of `native`, `flat`, `unsupported`
- `marketplace` (optional) - boolean, whether the tool has a marketplace registry

## Outputs

```typescript
// native mode with marketplace
plugins: new PluginsCapability({
  mode: "native",
  pluginsDir: ".acme/plugins/",
  pluginManifestRelativePath: "MANIFEST.md",
  translationMode: "marketplace",
  installScope: "project",
  marketplaceSettings: {
    settingsPath: ".acme/settings.json",
    settingsKey: "extensions",
    valueShape: "map",
    toEntry({ name, source }) {
      return { valueShape: "map", key: name, value: { source: source.url } };
    },
  },
}),

// flat mode (no marketplace)
plugins: new PluginsCapability({
  mode: "flat",
  flatNamespacePrefix: "acme-",
}),
```

## Depends on

- `01-define-toolconfig`

## Process

1. Open `contexts/tools/domain/profiles/<tool-name>.ts`. Locate the `capabilities` object.
2. Import `PluginsCapability` from `domain/capabilities/plugins-capability.js` if not already imported.
3. For `mode: "native"`:
   - Set `pluginsDir` to the tool's plugin directory path.
   - Set `pluginManifestRelativePath` to the manifest file name relative to each plugin dir, or `null` to suppress manifest writing.
   - Set `translationMode: "marketplace"` if `marketplaceSettings` is provided (Mode A — registry-only, no file materialization). Omit or set `null` for neutral native.
   - Set `installScope: "user"` only when plugins install to the user home directory; provide `userPluginsDir` resolver in that case. Defaults to `"project"`.
   - Define `marketplaceSettings` with `settingsPath`, `settingsKey`, and `toEntry` when the tool has a marketplace registry.
4. For `mode: "flat"`: set `flatNamespacePrefix` to the tool's flat namespace prefix.
5. For `mode: "unsupported"`: set `{ mode: "unsupported" }` — no other fields needed.
6. Update the `Has*` intersection in the type annotation to include `HasPlugins` if not already present.

## Test

Run `pnpm typecheck` — exits 0 confirms `PluginsCapability` is instantiated with valid params and the tool's `HasPlugins` interface is satisfied.
