import { AbstractNativePluginCliAdapter } from "./abstract-native-plugin-cli-adapter.js";

const PROJECT_SCOPE_ARGS = ["--scope", "project"];

/**
 * Activates plugins through the `claude` CLI. Measured on #703: a project-local
 * `.claude/settings.json` declares `extraKnownMarketplaces`/`enabledPlugins`, but the
 * runtime only loads a plugin once it's in the user-global registry
 * (`~/.claude/plugins/known_marketplaces.json` and `installed_plugins.json`), which only
 * `claude plugin marketplace add` / `claude plugin install` populate. Interactive Claude
 * Code performs that registration itself once a person accepts the workspace trust
 * dialog; headless `claude -p` skips that dialog and never registers, so the declared
 * entry is silently dropped as orphaned.
 */
export class ClaudeCliAdapter extends AbstractNativePluginCliAdapter {
  protected readonly binary = "claude";

  addMarketplace(source: string): void {
    this.run(
      ["plugin", "marketplace", "add", ...PROJECT_SCOPE_ARGS, source],
      `marketplace add ${source}`
    );
  }

  upgradeMarketplaces(): void {
    this.run(["plugin", "marketplace", "update"], "marketplace update");
  }

  enablePlugin(pluginRef: string): void {
    this.run(
      ["plugin", "install", pluginRef, ...PROJECT_SCOPE_ARGS, "--yes"],
      `plugin install ${pluginRef}`
    );
  }
}
