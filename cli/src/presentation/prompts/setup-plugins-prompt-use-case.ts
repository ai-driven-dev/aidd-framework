import type { ResolveMarketplace } from "../../contexts/distribution/application/resolve-marketplace-use-case.js";
import type { PluginCatalogEntry } from "../../contexts/distribution/domain/catalog.js";
import type { MarketplaceRegistry } from "../../contexts/distribution/domain/ports/marketplace-registry.js";
import type { PluginInstallFromMarketplace } from "../../contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import type { PluginInstallMode } from "../../contexts/framework/domain/setup-flow.js";
import type { PluginPick } from "./plugin-pick-use-case.js";
export interface SetupPluginsPromptOptions {
  projectRoot: string;
  mode: PluginInstallMode;
  pluginNames: readonly string[];
  interactive: boolean;
}

export interface SetupPluginsPromptResult {
  installed: readonly string[];
}

export class SetupPluginsPromptUseCase {
  constructor(
    private readonly pluginPickUseCase: PluginPick,
    private readonly pluginInstallFromMarketplaceUseCase: PluginInstallFromMarketplace,
    private readonly registry: MarketplaceRegistry,
    private readonly resolveMarketplaceUseCase: ResolveMarketplace
  ) {}

  async execute(options: SetupPluginsPromptOptions): Promise<SetupPluginsPromptResult> {
    if (options.mode === "none") return { installed: [] };
    if (options.mode === "interactive") return this.runInteractive(options);
    return this.runScripted(options);
  }

  private async runInteractive(
    options: SetupPluginsPromptOptions
  ): Promise<SetupPluginsPromptResult> {
    if (!options.interactive) return { installed: [] };
    const result = await this.pluginPickUseCase.execute({
      toolIds: "all",
      projectRoot: options.projectRoot,
      interactive: true,
    });
    return { installed: result.installed };
  }

  private async runScripted(options: SetupPluginsPromptOptions): Promise<SetupPluginsPromptResult> {
    const names = await this.resolveScriptedNames(options);
    const installed: string[] = [];
    for (const name of names) {
      await this.pluginInstallFromMarketplaceUseCase.execute({
        pluginName: name,
        toolIds: "all",
        projectRoot: options.projectRoot,
        interactive: options.interactive,
        autoSelect: true,
        replace: true,
      });
      installed.push(name);
    }
    return { installed };
  }

  private async resolveScriptedNames(
    options: SetupPluginsPromptOptions
  ): Promise<readonly string[]> {
    if (options.mode === "named") return options.pluginNames;
    const entries = await this.loadCatalogEntries(options.projectRoot);
    if (options.mode === "recommended")
      return entries.filter((e) => e.recommended).map((e) => e.name);
    return entries.map((e) => e.name);
  }

  private async loadCatalogEntries(projectRoot: string): Promise<readonly PluginCatalogEntry[]> {
    const marketplaces = await this.registry.list(projectRoot);
    const entries: PluginCatalogEntry[] = [];
    for (const marketplace of marketplaces) {
      const { catalog } = await this.resolveMarketplaceUseCase.execute({
        marketplace,
        projectRoot,
      });
      if (catalog) entries.push(...catalog.plugins);
    }
    return entries;
  }
}
