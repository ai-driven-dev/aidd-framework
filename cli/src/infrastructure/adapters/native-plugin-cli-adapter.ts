import { AbstractNativePluginCliAdapter } from "./abstract-native-plugin-cli-adapter.js";

/**
 * Drives a tool's own plugin CLI. The binary, the arguments and the verbs that differ
 * between CLIs come from the tool's profile, so supporting one more tool is a profile
 * entry rather than another subclass — and no tool name is written outside its profile.
 *
 * A tool that enables plugins through a file this CLI writes declares no verbs. It
 * still registers its marketplaces here, because that it does better.
 */
export class NativePluginCliAdapter extends AbstractNativePluginCliAdapter {
  constructor(
    protected readonly binary: string,
    private readonly upgradeVerb: string | undefined,
    private readonly enableVerb: string | undefined,
    protected readonly addArgs: readonly string[] = []
  ) {
    super();
  }

  enablesPlugins(): boolean {
    return this.enableVerb !== undefined;
  }

  upgradeMarketplaces(): void {
    if (this.upgradeVerb === undefined) return;
    this.run(["plugin", "marketplace", this.upgradeVerb], `marketplace ${this.upgradeVerb}`);
  }

  enablePlugin(pluginRef: string): void {
    if (this.enableVerb === undefined) return;
    this.run(["plugin", this.enableVerb, pluginRef], `plugin ${this.enableVerb} ${pluginRef}`);
  }
}
