import type { ResolveMarketplaceUseCase } from "../../../contexts/distribution/application/resolve-marketplace-use-case.js";
import {
  isMarketplaceStale,
  type Marketplace,
  STALE_MAX_DAYS_DEFAULT,
} from "../../../contexts/distribution/domain/marketplace.js";
import type { MarketplaceRegistry } from "../../../contexts/distribution/domain/ports/marketplace-registry.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../kernel/tool.js";

export interface MarketplaceCheckOptions {
  projectRoot: string;
  staleMaxDays?: number;
}

export interface UpstreamRemoved {
  marketplace: string;
  plugin: string;
  toolId: AiToolId;
}

export interface SkippedMarketplace {
  marketplace: string;
  error: string;
}

export interface MarketplaceCheckResult {
  stale: readonly Marketplace[];
  upstreamRemoved: readonly UpstreamRemoved[];
  skipped: readonly SkippedMarketplace[];
}

interface CatalogReadResult {
  known: Set<string> | null;
  error?: string;
}

export class MarketplaceCheckUseCase {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly registry: MarketplaceRegistry,
    private readonly resolveMarketplace: ResolveMarketplaceUseCase
  ) {}

  async execute(options: MarketplaceCheckOptions): Promise<MarketplaceCheckResult> {
    const maxDays = options.staleMaxDays ?? STALE_MAX_DAYS_DEFAULT;
    const marketplaces = await this.registry.list(options.projectRoot);
    const now = Date.now();
    const stale = marketplaces.filter((m) => isMarketplaceStale(m, now, maxDays));
    const manifest = await this.manifestRepo.load();
    const { upstreamRemoved, skipped } = await this.collectStatus(
      marketplaces,
      manifest,
      options.projectRoot
    );
    return { stale, upstreamRemoved, skipped };
  }

  private async collectStatus(
    marketplaces: readonly Marketplace[],
    manifest: Manifest | null,
    projectRoot: string
  ): Promise<{ upstreamRemoved: UpstreamRemoved[]; skipped: SkippedMarketplace[] }> {
    const upstreamRemoved: UpstreamRemoved[] = [];
    const skipped: SkippedMarketplace[] = [];
    for (const m of marketplaces) {
      const { known, error } = await this.readCatalog(m, projectRoot);
      if (known === null) {
        if (error !== undefined) skipped.push({ marketplace: m.name, error });
        continue;
      }
      if (manifest !== null) {
        upstreamRemoved.push(...this.diffInstalledAgainst(known, m.name, manifest));
      }
    }
    return { upstreamRemoved, skipped };
  }

  // @policy report-and-continue: a single unreadable catalog must not abort the
  // overall report. Errors are surfaced via the `skipped` channel for logging.
  private async readCatalog(m: Marketplace, projectRoot: string): Promise<CatalogReadResult> {
    try {
      const { catalog } = await this.resolveMarketplace.execute({ marketplace: m, projectRoot });
      if (!catalog) return { known: null };
      return { known: new Set(catalog.plugins.map((p) => p.name)) };
    } catch (err) {
      return { known: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private diffInstalledAgainst(
    known: Set<string>,
    marketplaceName: string,
    manifest: Manifest
  ): UpstreamRemoved[] {
    const out: UpstreamRemoved[] = [];
    for (const toolId of AI_TOOL_IDS) {
      for (const plugin of manifest.getPlugins(toolId)) {
        if (plugin.marketplace !== marketplaceName) continue;
        if (!known.has(plugin.name)) {
          out.push({ marketplace: marketplaceName, plugin: plugin.name, toolId });
        }
      }
    }
    return out;
  }
}
