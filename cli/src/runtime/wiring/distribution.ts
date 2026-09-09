import { FetchMarketplaceSourceUseCase } from "../../contexts/distribution/application/fetch-marketplace-source-use-case.js";
import { MarketplaceListUseCase } from "../../contexts/distribution/application/marketplace-list-use-case.js";
import { MarketplaceRefreshUseCase } from "../../contexts/distribution/application/marketplace-refresh-use-case.js";
import { MarketplaceRegisterFrameworkUseCase } from "../../contexts/distribution/application/marketplace-register-framework-use-case.js";
import { ResolveMarketplaceUseCase } from "../../contexts/distribution/application/resolve-marketplace-use-case.js";
import type { MarketplaceRegistry } from "../../contexts/distribution/domain/ports/marketplace-registry.js";
import type { MarketplaceTrustStore } from "../../contexts/distribution/domain/ports/marketplace-trust-store.js";
import type { PluginCatalogRepository } from "../../contexts/distribution/domain/ports/plugin-catalog-repository.js";
import type { PluginFetcher } from "../../contexts/distribution/domain/ports/plugin-fetcher.js";
import { GitHubRawFetcherAdapter } from "../../contexts/distribution/infrastructure/github-raw-fetcher-adapter.js";
import { MarketplaceCacheAdapter } from "../../contexts/distribution/infrastructure/marketplace-cache-adapter.js";
import { MarketplaceRegistryAdapter } from "../../contexts/distribution/infrastructure/marketplace-registry-adapter.js";
import { MarketplaceTrustStoreAdapter } from "../../contexts/distribution/infrastructure/marketplace-trust-store-adapter.js";
import { PluginCatalogRepositoryAdapter } from "../../contexts/distribution/infrastructure/plugin-catalog-repository-adapter.js";
import { PluginFetcherAdapter } from "../../contexts/distribution/infrastructure/plugin-fetcher-adapter.js";
import type { FileMerger } from "../../contexts/tools/domain/ports/file-merger.js";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import type { Hasher } from "../../kernel/ports/hasher.js";
import type { Logger } from "../../kernel/ports/logger.js";
import type { AuthReaderAdapter } from "../auth/auth-reader-adapter.js";
import type { HttpClient } from "../http/http-client.js";

export interface DistributionWiringShared {
  fs: FileReader & FileWriter & FileMerger;
  hasher: Hasher;
  http: HttpClient;
  authReader: AuthReaderAdapter;
  logger: Logger;
  projectRoot: string;
}

export interface DistributionDeps {
  pluginCatalogRepository: PluginCatalogRepository;
  pluginFetcher: PluginFetcher;
  marketplaceRegistry: MarketplaceRegistry;
  marketplaceTrustStore: MarketplaceTrustStore;
  resolveMarketplaceUseCase: ResolveMarketplaceUseCase;
  marketplaceListUseCase: MarketplaceListUseCase;
  marketplaceRefreshUseCase: MarketplaceRefreshUseCase;
  marketplaceRegisterFrameworkUseCase: MarketplaceRegisterFrameworkUseCase;
}

/** `marketplaceAddUseCase` is deliberately absent: it takes framework's
 * `marketplaceRemoveUseCase`, so it is composed in `wiring/framework.ts` rather than pulling
 * framework in here. */
export function wireDistribution(shared: DistributionWiringShared): DistributionDeps {
  const pluginCatalogRepository = new PluginCatalogRepositoryAdapter(shared.fs);
  const marketplaceCache = new MarketplaceCacheAdapter(shared.projectRoot);
  const marketplaceRegistry = new MarketplaceRegistryAdapter();
  const marketplaceTrustStore = new MarketplaceTrustStoreAdapter(shared.hasher);
  const pluginFetcher = new PluginFetcherAdapter(shared.fs, shared.authReader);
  const rawCatalogFetcher = new GitHubRawFetcherAdapter(shared.http, shared.authReader);
  const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(
    pluginFetcher,
    rawCatalogFetcher,
    shared.fs,
    shared.logger
  );
  const resolveMarketplaceUseCase = new ResolveMarketplaceUseCase(
    fetchMarketplaceSource,
    pluginCatalogRepository
  );
  const marketplaceListUseCase = new MarketplaceListUseCase(
    marketplaceRegistry,
    resolveMarketplaceUseCase,
    shared.logger
  );
  const marketplaceRefreshUseCase = new MarketplaceRefreshUseCase(
    marketplaceRegistry,
    resolveMarketplaceUseCase,
    marketplaceCache,
    shared.logger,
    shared.fs
  );
  const marketplaceRegisterFrameworkUseCase = new MarketplaceRegisterFrameworkUseCase(
    marketplaceRegistry
  );
  return {
    pluginCatalogRepository,
    pluginFetcher,
    marketplaceRegistry,
    marketplaceTrustStore,
    resolveMarketplaceUseCase,
    marketplaceListUseCase,
    marketplaceRefreshUseCase,
    marketplaceRegisterFrameworkUseCase,
  };
}
