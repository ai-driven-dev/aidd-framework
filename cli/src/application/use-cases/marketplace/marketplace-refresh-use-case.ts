import { join, resolve } from "node:path";
import type { Marketplace } from "../../../domain/models/marketplace.js";
import { marketplaceCacheDir } from "../../../domain/models/paths.js";
import {
  hasRelativePluginSources,
  type PluginCatalog,
  parsePluginCatalog,
} from "../../../domain/models/plugin-catalog.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { MarketplaceCachePort } from "../../../domain/ports/marketplace-cache.js";
import type { MarketplaceRegistry } from "../../../domain/ports/marketplace-registry.js";
import type { PluginCatalogRepository } from "../../../domain/ports/plugin-catalog-repository.js";
import type { FetchMarketplaceSourceUseCase } from "../shared/fetch-marketplace-source-use-case.js";

export interface MarketplaceRefreshOptions {
  projectRoot: string;
  name?: string;
  force?: boolean;
}

export interface RefreshEntryResult {
  name: string;
  status: "ok" | "failed";
  error?: string;
}

export interface MarketplaceRefreshResult {
  results: readonly RefreshEntryResult[];
  failedCount: number;
}

const CLAUDE_CATALOG_PATH = ".claude-plugin/marketplace.json";

export class MarketplaceRefreshUseCase {
  constructor(
    private readonly catalogRepo: PluginCatalogRepository,
    private readonly registry: MarketplaceRegistry,
    private readonly fetchMarketplaceSource: FetchMarketplaceSourceUseCase,
    private readonly cache: MarketplaceCachePort,
    private readonly logger?: Logger,
    private readonly fs?: FileReader
  ) {}

  async execute(options: MarketplaceRefreshOptions): Promise<MarketplaceRefreshResult> {
    if (options.force) await this.cache.clear(options.name);
    const all = await this.registry.list(options.projectRoot);
    const targets = options.name ? all.filter((m) => m.name === options.name) : all;
    const results: RefreshEntryResult[] = [];
    for (const m of targets) {
      results.push(await this.refreshOne(options.projectRoot, m));
    }
    const failedCount = results.filter((r) => r.status === "failed").length;
    return { results, failedCount };
  }

  // @policy report-and-continue: a single failed marketplace must not abort the
  // batch refresh. Each failure is reported via the result, never thrown.
  private async refreshOne(projectRoot: string, m: Marketplace): Promise<RefreshEntryResult> {
    try {
      const cacheDir = marketplaceCacheDir(projectRoot, m.name);
      await this.warnIfStale(m.name, cacheDir);
      this.logger?.info(`Fetching marketplace '${m.name}'...`);
      const localPath = await this.fetchSource(m, cacheDir);
      const catalog = await this.catalogRepo.load(localPath);
      await this.registry.updateLastFetched(projectRoot, m.name, m.scope, new Date().toISOString());
      if (catalog?.version !== undefined) {
        await this.registry.updateVersion(projectRoot, m.name, m.scope, catalog.version);
      }
      return { name: m.name, status: "ok" };
    } catch (err) {
      return {
        name: m.name,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async fetchSource(m: Marketplace, cacheDir: string): Promise<string> {
    return this.fetchMarketplaceSource.execute({
      marketplace: m,
      cacheDir,
      fetchOptions: { forceRefresh: true },
    });
  }

  private async warnIfStale(name: string, cacheDir: string): Promise<void> {
    if (this.logger === undefined || this.fs === undefined) return;
    if (await this.isStaleCache(this.fs, cacheDir)) {
      this.logger.info(`Detected stale cache for '${name}' — re-fetching.`);
    }
  }

  private async isStaleCache(fs: FileReader, cacheDir: string): Promise<boolean> {
    try {
      const catalogFilePath = join(cacheDir, CLAUDE_CATALOG_PATH);
      const raw = JSON.parse(await fs.readFile(catalogFilePath)) as unknown;
      const catalog = parsePluginCatalog(raw);
      if (!hasRelativePluginSources(catalog)) return false;
      return this.hasAnyMissingPluginPath(fs, catalog, cacheDir);
    } catch {
      return false;
    }
  }

  private async hasAnyMissingPluginPath(
    fs: FileReader,
    catalog: PluginCatalog,
    cacheDir: string
  ): Promise<boolean> {
    for (const entry of catalog.plugins) {
      if (entry.source.kind !== "local") continue;
      const resolvedPath = resolve(cacheDir, entry.source.path);
      if (!(await fs.fileExists(resolvedPath))) return true;
    }
    return false;
  }
}
