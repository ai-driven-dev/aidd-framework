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

  // `install` above registered the plugin at project scope (`--scope project`); `uninstall`
  // defaults to `user` scope, which would silently miss a project-scoped entry, so the same
  // scope must be passed back here. `--yes` only gates the `--prune` confirmation prompt, which
  // this call never requests, but a headless stdin has no TTY to answer any prompt at all — so
  // pass it unconditionally rather than assume today's uninstall never grows one.
  uninstallPlugin(pluginRef: string): void {
    this.run(
      ["plugin", "uninstall", pluginRef, ...PROJECT_SCOPE_ARGS, "--yes"],
      `plugin uninstall ${pluginRef}`
    );
  }
}
