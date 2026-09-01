// Called from use-cases/marketplace, use-cases/plugin, and use-cases/setup.
import type { Marketplace } from "../../../domain/models/marketplace.js";
import type { PluginCatalog } from "../../../domain/models/plugin-catalog.js";
import type { PluginCatalogRepository } from "../../../domain/ports/plugin-catalog-repository.js";
import { marketplaceCacheDir } from "../../../kernel/paths.js";
import type { FetchMarketplaceSourceUseCase } from "./resolve-marketplace/fetch-marketplace-source-use-case.js";

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

export class ResolveMarketplaceUseCase {
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
