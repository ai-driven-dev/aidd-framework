import type { MarketplaceScope } from "../../../kernel/scope.js";
import { AbstractNativePluginCliAdapter } from "./abstract-native-plugin-cli-adapter.js";

/** Everything about a tool's plugin CLI that differs between tools, read off its profile. */
export interface NativePluginCliShape {
  readonly scopeArgs?: Readonly<Record<MarketplaceScope, readonly string[]>>;
  readonly forceRemoveArgs?: readonly string[];
  readonly sourceCheckVerb?: string;
  readonly upgradeVerb?: string;
  readonly enableVerb?: string;
  /** How the tool spells removing a plugin it installed: `remove` for codex, `uninstall`
   * for claude and copilot. Absent for a tool whose plugins this CLI enables through a
   * file it writes — there is nothing to ask the tool to undo. */
  readonly disableVerb?: string;
  /** Arguments every `plugin <verb> <ref>` call carries, after the reference. Claude needs
   * `--yes` on both install and uninstall: `--yes` gates a prune confirmation the call never
   * requests, but a headless stdin has no terminal to answer any prompt at all. */
  readonly pluginArgs?: readonly string[];
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
    this.run(
      ["plugin", verb, pluginRef, ...(this.shape.pluginArgs ?? [])],
      `plugin ${verb} ${pluginRef}`
    );
  }

  /**
   * Undoes what `enablePlugin` did. The same trailing arguments travel here on purpose: a
   * tool that installed at one scope and uninstalls at its default would silently miss the
   * entry it wrote.
   */
  uninstallPlugin(pluginRef: string): void {
    const verb = this.shape.disableVerb;
    if (verb === undefined) return;
    this.run(
      ["plugin", verb, pluginRef, ...(this.shape.pluginArgs ?? [])],
      `plugin ${verb} ${pluginRef}`
    );
  }

  protected scopeArgsFor(scope: MarketplaceScope): readonly string[] {
    return this.shape.scopeArgs?.[scope] ?? [];
  }

  protected forceRemoveArgs(): readonly string[] {
    return this.shape.forceRemoveArgs ?? [];
  }
}
