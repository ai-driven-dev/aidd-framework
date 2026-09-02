import type { Prompter } from "../../../../domain/ports/prompter.js";
import {
  InteractiveOnlyError,
  InvalidPluginManifestError,
  NoMarketplacesRegisteredError,
} from "../../../../kernel/errors.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import type { ResolveMarketplaceUseCase } from "../../../distribution/application/resolve-marketplace-use-case.js";
import type { PluginCatalog, PluginCatalogEntry } from "../../../distribution/domain/catalog.js";
import type { Marketplace } from "../../../distribution/domain/marketplace.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";
import type { PluginAddUseCase } from "./plugin-add-use-case.js";

export interface PluginPickOptions {
  toolIds: AiToolId[] | "all";
  projectRoot: string;
  interactive: boolean;
}

export interface PluginPickResult {
  marketplace: Marketplace;
  installed: readonly string[];
}

export class PluginPickUseCase {
  constructor(
    private readonly registry: MarketplaceRegistry,
    private readonly resolveMarketplace: ResolveMarketplaceUseCase,
    private readonly pluginAddUseCase: PluginAddUseCase,
    private readonly prompter: Prompter
  ) {}

  async execute(options: PluginPickOptions): Promise<PluginPickResult> {
    if (!options.interactive) throw new InteractiveOnlyError("plugin install");
    const marketplaces = await this.registry.list(options.projectRoot);
    if (marketplaces.length === 0) throw new NoMarketplacesRegisteredError();
    const marketplace = await this.chooseMarketplace(marketplaces);
    const catalog = await this.loadCatalog(marketplace, options.projectRoot);
    const selected = await this.chooseEntries(catalog.plugins);
    return this.installSelected(marketplace, selected, options);
  }

  private async chooseMarketplace(marketplaces: readonly Marketplace[]): Promise<Marketplace> {
    const head = marketplaces[0];
    if (marketplaces.length === 1 && head !== undefined) return head;
    return this.prompter.select(
      "Select a marketplace:",
      marketplaces.map((m) => ({ name: `${m.name} [${m.scope}]`, value: m }))
    );
  }

  private async loadCatalog(marketplace: Marketplace, projectRoot: string): Promise<PluginCatalog> {
    const { catalog, localPath } = await this.resolveMarketplace.execute({
      marketplace,
      projectRoot,
    });
    if (catalog === null) {
      throw new InvalidPluginManifestError(`marketplace.json not found at "${localPath}"`);
    }
    return catalog;
  }

  private async chooseEntries(
    entries: readonly PluginCatalogEntry[]
  ): Promise<readonly PluginCatalogEntry[]> {
    if (entries.length === 0) return [];
    return this.prompter.checkbox(
      "Select plugins to install:",
      entries.map((e) => ({
        name: e.description !== undefined ? `${e.name} — ${e.description}` : e.name,
        value: e,
        checked: e.recommended,
      }))
    );
  }

  private async installSelected(
    marketplace: Marketplace,
    entries: readonly PluginCatalogEntry[],
    options: PluginPickOptions
  ): Promise<PluginPickResult> {
    const installed: string[] = [];
    for (const entry of entries) {
      await this.pluginAddUseCase.execute({
        source: entry.source,
        toolIds: options.toolIds,
        projectRoot: options.projectRoot,
        interactive: options.interactive,
        marketplace: marketplace.name,
        pluginMetadata: {
          name: entry.name,
          version: entry.version,
          strict: entry.strict ?? false,
        },
        replace: true,
      });
      installed.push(entry.name);
    }
    return { marketplace, installed };
  }
}
