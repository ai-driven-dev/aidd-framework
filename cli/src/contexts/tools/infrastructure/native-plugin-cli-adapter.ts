import type { MarketplaceScope } from "../../distribution/domain/marketplace.js";
import { AbstractNativePluginCliAdapter } from "./abstract-native-plugin-cli-adapter.js";

/** Everything about a tool's plugin CLI that differs between tools, read off its profile. */
export interface NativePluginCliShape {
  readonly scopeArgs?: Readonly<Record<MarketplaceScope, readonly string[]>>;
  readonly forceRemoveArgs?: readonly string[];
  readonly sourceCheckVerb?: string;
  readonly upgradeVerb?: string;
  readonly enableVerb?: string;
}

/**
 * Drives a tool's own plugin CLI. Everything that differs between tools comes from the
 * tool's profile, so supporting one more is a profile entry rather than another
 * subclass — and no tool name is written outside its profile.
 *
 * A tool that enables plugins through a file this CLI writes declares no verbs. It
 * still registers its marketplaces here, because that it does better.
 */
export class NativePluginCliAdapter extends AbstractNativePluginCliAdapter {
  constructor(
    protected readonly binary: string,
    private readonly shape: NativePluginCliShape
  ) {
    super();
  }

  enablesPlugins(): boolean {
    return this.shape.enableVerb !== undefined;
  }

  /**
   * A tool that cannot tell a dead registration from a live one answers `"unknown"`,
   * which keeps callers from taking over a name that may belong to a live project.
   */
  registrationState(name: string): "live" | "dead" | "unknown" {
    const verb = this.shape.sourceCheckVerb;
    if (verb === undefined) return "unknown";
    return this.succeeds(["plugin", "marketplace", verb, name]) ? "live" : "dead";
  }

  upgradeMarketplaces(): void {
    const verb = this.shape.upgradeVerb;
    if (verb === undefined) return;
    this.run(["plugin", "marketplace", verb], `marketplace ${verb}`);
  }

  enablePlugin(pluginRef: string): void {
    const verb = this.shape.enableVerb;
    if (verb === undefined) return;
    this.run(["plugin", verb, pluginRef], `plugin ${verb} ${pluginRef}`);
  }

  protected scopeArgsFor(scope: MarketplaceScope): readonly string[] {
    return this.shape.scopeArgs?.[scope] ?? [];
  }

  protected forceRemoveArgs(): readonly string[] {
    return this.shape.forceRemoveArgs ?? [];
  }
}
