# Reference: PluginsCapability

## Three modes

| Mode | When to use |
|---|---|
| `"native"` | Tool has a first-class plugin directory structure |
| `"flat"` | Tool stores plugins as flat files under a name prefix |
| `"unsupported"` | Tool has no plugin concept |

## Native mode params

```typescript
new PluginsCapability({
  mode: "native",
  pluginsDir: ".acme/plugins/", // directory where plugins are installed
  pluginManifestRelativePath: "MANIFEST.md", // relative to each plugin dir; null suppresses writing
  mcpRelativePath: ".mcp.json", // optional; defaults to ".mcp.json"
  hooksRelativePath: "hooks/hooks.json", // optional; defaults to "hooks/hooks.json"
  hooksContentFormat: "claude", // optional; defaults to "claude"
  acceptsHooks: true, // optional; defaults to false
  acceptsMcp: true, // optional; defaults to false
  translationMode: "marketplace", // set when using marketplaceSettings
  installScope: "project", // "project" (default) or "user"
  userPluginsDir: (h) => join(h, ".acme", "plugins"), // required when installScope is "user"
  marketplaceSettings: { /* ... */ }, // optional; configure when the tool has a registry
});
```

## Flat mode params

```typescript
new PluginsCapability({
  mode: "flat",
  flatNamespacePrefix: "acme-", // prepended to plugin names in flat mode
});
```

## marketplaceSettings shape

```typescript
interface MarketplaceSettings {
  settingsPath: string; // path to the tool's settings file (e.g. ".acme/settings.json")
  settingsKey: string; // key in settings where plugin entries live (e.g. "extensions")
  valueShape?: "map" | "array"; // "map" = { key: name, value: {...} }; "array" = string entry
  enabledPluginsKey?: string;
  enabledPluginsSettingsPath?: string;
  toEntry(input: {
    name: string;
    source: PluginSource;
    version?: string;
  }): MarketplaceSettingsEntry | null;
}
```

## translationMode

- `"marketplace"` — Mode A: register a plugin reference in the tool's native config; no file
  materialization.
- `"flat"` — Mode B: materialize plugin content as flat files on disk (automatic for `mode: "flat"`).
- `null` — neutral native; no translation strategy applies.

The tool profile only declares the mode; routing on it at install time is `framework`'s job
(`contexts/framework/application/framework/translator/plugin-translator-factory.ts` — a name
that predates the `translate` context and should not be confused with it). `translate` itself
does the author-side `aidd translate` build, a different pipeline that reads the same capability.

## installScope

- `"project"` (default) — plugins installed relative to project root.
- `"user"` — plugins installed relative to user home dir; requires `userPluginsDir` resolver.

## Agnostic example (fictional `acme` with marketplace)

```typescript
plugins: new PluginsCapability({
  mode: "native",
  pluginsDir: ".acme/plugins/",
  pluginManifestRelativePath: null,
  translationMode: "marketplace",
  marketplaceSettings: {
    settingsPath: ".acme/config.json",
    settingsKey: "plugins",
    valueShape: "map",
    toEntry({ name, source }) {
      if (source.kind !== "github") return null;
      return { valueShape: "map", key: name, value: { repo: source.url } };
    },
  },
}),
```
