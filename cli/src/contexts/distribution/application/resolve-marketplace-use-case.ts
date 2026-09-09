import { marketplaceCacheDir } from "../../../kernel/paths.js";
import type { PluginCatalog } from "../domain/catalog.js";
import type { Marketplace } from "../domain/marketplace.js";
import type { PluginCatalogRepository } from "../domain/ports/plugin-catalog-repository.js";
import type { FetchMarketplaceSourceUseCase } from "./fetch-marketplace-source-use-case.js";

export interface ResolveMarketplaceOptions {
  marketplace: Marketplace;
  projectRoot: string;
  forceRefresh?: boolean;
}

export interface ResolveMarketplaceResult {
  marketplace: Marketplace;
  localPath: string;
  catalog: PluginCatalog | null;
}

/** Resolving a marketplace to a local path and catalog, as its callers need it. */
export interface ResolveMarketplace {
  execute(options: ResolveMarketplaceOptions): Promise<ResolveMarketplaceResult>;
}

export class ResolveMarketplaceUseCase implements ResolveMarketplace {
  constructor(
    private readonly fetchMarketplaceSource: FetchMarketplaceSourceUseCase,
    private readonly catalogRepo: PluginCatalogRepository
  ) {}

  async execute(options: ResolveMarketplaceOptions): Promise<ResolveMarketplaceResult> {
    const cacheDir = marketplaceCacheDir(options.projectRoot, options.marketplace.name);
    const localPath = await this.fetchMarketplaceSource.execute({
      marketplace: options.marketplace,
      cacheDir,
      fetchOptions: { forceRefresh: options.forceRefresh ?? false },
    });
    const catalog = await this.catalogRepo.load(localPath);
    return { marketplace: options.marketplace, localPath, catalog };
  }
}
