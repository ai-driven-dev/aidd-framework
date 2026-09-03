import { AbstractNativePluginCliAdapter } from "./abstract-native-plugin-cli-adapter.js";

/**
 * Activates plugins through the `codex` CLI. Codex only loads plugins from its
 * user-global config (`~/.codex/config.toml`) plus its cache (`~/.codex/plugins/cache/`),
 * both populated by `codex plugin` — a project-local file does not enable a plugin.
 */
export class CodexCliAdapter extends AbstractNativePluginCliAdapter {
  protected readonly binary = "codex";

  upgradeMarketplaces(): void {
    this.run(["plugin", "marketplace", "upgrade"], "marketplace upgrade");
  }

  enablePlugin(pluginRef: string): void {
    this.run(["plugin", "add", pluginRef], `plugin add ${pluginRef}`);
  }

  // The removal counterpart of `plugin add` above: drops the plugin from
  // `~/.codex/config.toml` and its cache (`~/.codex/plugins/cache/`).
  uninstallPlugin(pluginRef: string): void {
    this.run(["plugin", "remove", pluginRef], `plugin remove ${pluginRef}`);
  }
}
