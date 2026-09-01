import { join } from "node:path";
import type { Marketplace } from "../../../../domain/models/marketplace.js";
import {
  hasRelativePluginSources,
  type PluginCatalog,
  parsePluginCatalog,
} from "../../../../domain/models/plugin-catalog.js";
import type { PluginFetcher, PluginFetchOptions } from "../../../../domain/ports/plugin-fetcher.js";
import type { RawCatalogFetcher } from "../../../../domain/ports/raw-catalog-fetcher.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { PluginSourceGitHub } from "../../../../kernel/source.js";

const CLAUDE_CATALOG_PATH = ".claude-plugin/marketplace.json";

export interface FetchMarketplaceSourceOptions {
  marketplace: Marketplace;
  cacheDir: string;
  fetchOptions?: PluginFetchOptions;
}

export class FetchMarketplaceSourceUseCase {
  constructor(
    private readonly pluginFetcher: PluginFetcher,
    private readonly rawCatalogFetcher?: RawCatalogFetcher,
    private readonly fs?: FileReader & FileWriter,
    private readonly logger?: Logger
  ) {}

  async execute(options: FetchMarketplaceSourceOptions): Promise<string> {
    const { marketplace, cacheDir, fetchOptions } = options;
    if (marketplace.source.kind === "github" && this.rawCatalogFetcher !== undefined) {
      await this.rawCatalogFetcher.fetchCatalog(
        marketplace.source as PluginSourceGitHub,
        CLAUDE_CATALOG_PATH,
        cacheDir
      );
      return this.probeAndMaybeFallback(marketplace, cacheDir, fetchOptions);
    }
    return this.pluginFetcher.fetch(marketplace.source, cacheDir, fetchOptions);
  }

  private async probeAndMaybeFallback(
    marketplace: Marketplace,
    cacheDir: string,
    fetchOptions?: PluginFetchOptions
  ): Promise<string> {
    if (this.fs === undefined) return cacheDir;
    try {
      const catalog = await this.loadRawCatalogSafely(this.fs, cacheDir);
      if (catalog === null || !hasRelativePluginSources(catalog)) return cacheDir;
      return this.runFallback(this.fs, marketplace, cacheDir, fetchOptions);
    } catch (err) {
      this.logger?.warn(
        `Probe failed for ${marketplace.name}, falling back to cache: ${String(err)}`
      );
      return cacheDir;
    }
  }

  private async loadRawCatalogSafely(
    fs: FileReader,
    cacheDir: string
  ): Promise<PluginCatalog | null> {
    try {
      const catalogFilePath = join(cacheDir, CLAUDE_CATALOG_PATH);
      const raw = JSON.parse(await fs.readFile(catalogFilePath)) as unknown;
      return parsePluginCatalog(raw);
    } catch (err) {
      this.logger?.warn(`Could not load raw catalog from ${cacheDir}: ${String(err)}`);
      return null;
    }
  }

  private async runFallback(
    fs: FileWriter,
    marketplace: Marketplace,
    cacheDir: string,
    fetchOptions?: PluginFetchOptions
  ): Promise<string> {
    await fs.deleteFile(join(cacheDir, CLAUDE_CATALOG_PATH));
    return this.pluginFetcher.fetch(marketplace.source, cacheDir, fetchOptions);
  }
}
