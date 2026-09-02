import type { ResolveMarketplaceUseCase } from "../../../distribution/application/resolve-marketplace-use-case.js";
import type { PluginCatalogEntry } from "../../../distribution/domain/catalog.js";
import type { Marketplace } from "../../../distribution/domain/marketplace.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";

export interface PluginSearchOptions {
  query: string;
  recommendedOnly: boolean;
  marketplace?: string;
  projectRoot: string;
}

export interface SearchHit {
  entry: PluginCatalogEntry;
  marketplace: Marketplace;
}

export interface PluginSearchResult {
  hits: readonly SearchHit[];
}

export class PluginSearchUseCase {
  constructor(
    private readonly registry: MarketplaceRegistry,
    private readonly resolveMarketplace: ResolveMarketplaceUseCase
  ) {}

  async execute(options: PluginSearchOptions): Promise<PluginSearchResult> {
    const all = await this.registry.list(options.projectRoot);
    const filtered = options.marketplace ? all.filter((m) => m.name === options.marketplace) : all;
    const hits: SearchHit[] = [];
    for (const m of filtered) {
      hits.push(...(await this.searchOne(m, options)));
    }
    return { hits };
  }

  private async searchOne(m: Marketplace, options: PluginSearchOptions): Promise<SearchHit[]> {
    const { catalog } = await this.resolveMarketplace.execute({
      marketplace: m,
      projectRoot: options.projectRoot,
    });
    if (!catalog) return [];
    return catalog.plugins
      .filter((entry) => this.matches(entry, options))
      .map((entry) => ({ entry, marketplace: m }));
  }

  private matches(entry: PluginCatalogEntry, options: PluginSearchOptions): boolean {
    if (options.recommendedOnly && !entry.recommended) return false;
    const q = options.query.toLowerCase();
    if (q.length === 0) return true;
    const desc = entry.description?.toLowerCase() ?? "";
    return entry.name.toLowerCase().includes(q) || desc.includes(q);
  }
}
