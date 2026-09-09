import type { Logger } from "../../../kernel/ports/logger.js";
import type { PluginCatalog } from "../domain/catalog.js";
import type { Marketplace } from "../domain/marketplace.js";
import type { MarketplaceRegistry } from "../domain/ports/marketplace-registry.js";
import type { ResolveMarketplaceUseCase } from "./resolve-marketplace-use-case.js";

export interface MarketplaceListOptions {
  projectRoot: string;
  withCatalogs?: boolean;
}

export interface MarketplaceListResult {
  marketplaces: readonly Marketplace[];
  catalogs?: Map<string, PluginCatalog>;
}

export class MarketplaceListUseCase {
  constructor(
    private readonly registry: MarketplaceRegistry,
    private readonly resolveMarketplace?: ResolveMarketplaceUseCase,
    private readonly logger?: Logger
  ) {}

  async execute(options: MarketplaceListOptions): Promise<MarketplaceListResult> {
    const marketplaces = await this.registry.list(options.projectRoot);
    if (!options.withCatalogs) return { marketplaces };
    const catalogs = await this.fetchCatalogs(marketplaces, options.projectRoot);
    return { marketplaces, catalogs };
  }

  private async fetchCatalogs(
    marketplaces: readonly Marketplace[],
    projectRoot: string
  ): Promise<Map<string, PluginCatalog>> {
    const catalogs = new Map<string, PluginCatalog>();
    for (const m of marketplaces) {
      await this.fetchOneCatalog(m, projectRoot, catalogs);
    }
    return catalogs;
  }

  private async fetchOneCatalog(
    marketplace: Marketplace,
    projectRoot: string,
    catalogs: Map<string, PluginCatalog>
  ): Promise<void> {
    if (this.resolveMarketplace === undefined) return;
    try {
      const { catalog } = await this.resolveMarketplace.execute({
        marketplace,
        projectRoot,
        forceRefresh: true,
      });
      if (catalog !== null) catalogs.set(marketplace.name, catalog);
    } catch (err) {
      this.logger?.warn(`Skipping marketplace '${marketplace.name}': ${String(err)}`);
    }
  }
}
