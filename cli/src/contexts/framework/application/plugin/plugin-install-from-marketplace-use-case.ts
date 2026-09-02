import type { Prompter } from "../../../../domain/ports/prompter.js";
import {
  AmbiguousPluginMatchError,
  PluginNotInMarketplaceError,
  VersionMismatchError,
} from "../../../../kernel/errors.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import type { ResolveMarketplaceUseCase } from "../../../distribution/application/resolve-marketplace-use-case.js";
import type { PluginCatalogEntry } from "../../../distribution/domain/catalog.js";
import type { Marketplace } from "../../../distribution/domain/marketplace.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";
import { resolvePluginSourceFromMarketplace } from "../../domain/plugins/plugin-source-resolver.js";
import {
  DEFAULT_REQUESTED_VERSION_POLICY,
  type RequestedVersionPolicy,
} from "../../domain/plugins/requested-version-policy.js";
import type { PluginAddUseCase } from "./plugin-add-use-case.js";

export interface PluginInstallFromMarketplaceOptions {
  pluginName: string;
  version?: string;
  fromMarketplace?: string;
  toolIds: AiToolId[] | "all";
  projectRoot: string;
  interactive: boolean;
  autoSelect?: boolean;
  /** When true, drop existing plugin entry before adding (idempotent setup re-runs). */
  replace?: boolean;
  requestedVersionPolicy?: RequestedVersionPolicy;
}

export interface PluginInstallFromMarketplaceResult {
  marketplace: Marketplace;
  entry: PluginCatalogEntry;
}

interface MatchEntry {
  marketplace: Marketplace;
  entry: PluginCatalogEntry;
  localPath: string;
}

export class PluginInstallFromMarketplaceUseCase {
  constructor(
    private readonly resolveMarketplace: ResolveMarketplaceUseCase,
    private readonly registry: MarketplaceRegistry,
    private readonly pluginAddUseCase: PluginAddUseCase,
    private readonly prompter: Prompter,
    private readonly logger?: Logger
  ) {}

  async execute(
    options: PluginInstallFromMarketplaceOptions
  ): Promise<PluginInstallFromMarketplaceResult> {
    const policy = options.requestedVersionPolicy ?? DEFAULT_REQUESTED_VERSION_POLICY;
    const matches = await this.findMatches(options);
    const chosen = await this.chooseOne(matches, options);
    await this.installChosen(chosen, options, policy);
    return { marketplace: chosen.marketplace, entry: chosen.entry };
  }

  private async installChosen(
    chosen: MatchEntry,
    options: PluginInstallFromMarketplaceOptions,
    policy: RequestedVersionPolicy
  ): Promise<void> {
    const effectiveVersion = this.assertOrCoerceCatalogVersion(
      chosen.entry,
      options.version,
      policy
    );
    const resolvedSource = resolvePluginSourceFromMarketplace(
      chosen.entry.source,
      chosen.marketplace,
      chosen.localPath
    );
    await this.pluginAddUseCase.execute({
      source: resolvedSource,
      toolIds: options.toolIds,
      projectRoot: options.projectRoot,
      interactive: options.interactive,
      marketplace: chosen.marketplace.name,
      requiredVersion: effectiveVersion,
      pluginMetadata: {
        name: chosen.entry.name,
        version: chosen.entry.version,
        strict: chosen.entry.strict,
      },
      replace: options.replace,
    });
  }

  private async findMatches(options: PluginInstallFromMarketplaceOptions): Promise<MatchEntry[]> {
    const all = await this.registry.list(options.projectRoot);
    const filtered = options.fromMarketplace
      ? all.filter((m) => m.name === options.fromMarketplace)
      : all;
    const matches: MatchEntry[] = [];
    for (const m of filtered) {
      matches.push(...(await this.matchesIn(m, options)));
    }
    if (matches.length === 0) throw new PluginNotInMarketplaceError(options.pluginName);
    return matches;
  }

  private async matchesIn(
    m: Marketplace,
    options: PluginInstallFromMarketplaceOptions
  ): Promise<MatchEntry[]> {
    const { catalog, localPath } = await this.resolveMarketplace.execute({
      marketplace: m,
      projectRoot: options.projectRoot,
    });
    if (!catalog) return [];
    return catalog.plugins
      .filter((entry) => entry.name === options.pluginName)
      .map((entry) => ({ marketplace: m, entry, localPath }));
  }

  private async chooseOne(
    matches: MatchEntry[],
    options: PluginInstallFromMarketplaceOptions
  ): Promise<MatchEntry> {
    const head = matches[0];
    if (matches.length === 1 && head !== undefined) return head;
    if (options.autoSelect && head !== undefined) return head;
    if (!options.interactive) {
      throw new AmbiguousPluginMatchError(
        options.pluginName,
        matches.map((m) => m.marketplace.name)
      );
    }
    return this.prompter.select(
      `Multiple matches for '${options.pluginName}'. Select one:`,
      matches.map((m) => ({
        name: `${m.marketplace.name} — ${m.entry.version ?? "?"}`,
        value: m,
      }))
    );
  }

  // Catalog-level version check. Policy controls whether mismatch is fatal or silent.
  // Plugin-level (plugin.json) check happens in PluginAddUseCase.
  private assertOrCoerceCatalogVersion(
    entry: PluginCatalogEntry,
    requested: string | undefined,
    policy: RequestedVersionPolicy
  ): string | undefined {
    if (policy === "prefer-catalog") {
      if (requested && entry.version && entry.version !== requested) {
        this.logger?.info(
          `Plugin '${entry.name}': catalog version ${entry.version} differs from requested ${requested}; using catalog version.`
        );
      }
      // prefer-catalog always bypasses both the catalog-entry check (this site)
      // and the downstream plugin.json on-disk check in PluginAddUseCase.
      return undefined;
    }
    if (!requested || !entry.version || entry.version === requested) return requested;
    throw new VersionMismatchError(entry.name, requested, entry.version);
  }
}
