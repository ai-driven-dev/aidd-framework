import { AbstractNativePluginCliAdapter } from "./abstract-native-plugin-cli-adapter.js";

/**
 * Drives a tool's own plugin CLI. The binary and the two verbs that differ between
 * CLIs come from the tool's profile, so supporting one more tool is a profile entry
 * rather than another subclass — and no tool name is written outside its profile.
 *
 * Today: `claude`/`copilot` use `marketplace update` and `plugin install`, `codex`
 * uses `marketplace upgrade` and `plugin add`.
 */
export class NativePluginCliAdapter extends AbstractNativePluginCliAdapter {
  constructor(
    protected readonly binary: string,
    private readonly upgradeVerb: string,
    private readonly enableVerb: string
  ) {
    super();
  }

  upgradeMarketplaces(): void {
    this.run(["plugin", "marketplace", this.upgradeVerb], `marketplace ${this.upgradeVerb}`);
  }

  enablePlugin(pluginRef: string): void {
    this.run(["plugin", this.enableVerb, pluginRef], `plugin ${this.enableVerb} ${pluginRef}`);
  }
}
