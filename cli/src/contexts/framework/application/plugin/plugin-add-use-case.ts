import { homedir as nodeHomedir } from "node:os";
import { join } from "node:path";
import {
  DuplicatePluginError,
  MissingPluginMetadataError,
  VersionMismatchError,
} from "../../../../kernel/errors.js";
import type { InstallationFile } from "../../../../kernel/file.js";
import { PLUGIN_CACHE_SUBDIR } from "../../../../kernel/paths.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../../kernel/ports/hasher.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { PluginSource } from "../../../../kernel/source.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";
import type { PluginFetcher } from "../../../distribution/domain/ports/plugin-fetcher.js";
import type { ReadonlyNoticeList } from "../../../tools/domain/models/plugin-install-notice.js";
import { getToolConfig, isAiTool } from "../../../tools/domain/registry.js";
import { PluginContentTranslator } from "../../../translate/domain/content-translator.js";
import type { PluginDistribution } from "../../../translate/domain/plugin-distribution.js";
import type { ReadonlySkipList } from "../../../translate/domain/plugin-translation-skip.js";
import type { Manifest } from "../../domain/manifest.js";
import { InstalledPlugin } from "../../domain/plugins/installed-plugin.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { PluginDistributionReader } from "../../domain/ports/plugin-distribution-reader.js";
import type { PluginTranslator } from "../framework/translator/plugin-translator.js";
import { resolvePluginTranslator } from "../framework/translator/resolve-plugin-translator.js";
import type { EnsureBuiltMarketplace } from "../shared/ensure-built-marketplace-use-case.js";
import { loadPluginManifest, writePluginFiles } from "./plugin-helpers.js";
import { resolvePluginToolIds } from "./plugin-target-resolution.js";

export interface PluginAddOptions {
  source: PluginSource;
  toolIds: AiToolId[] | "all";
  projectRoot: string;
  interactive: boolean;
  marketplace?: string;
  requiredVersion?: string;
  pluginMetadata?: { name: string; version?: string; strict: boolean };
  /** When true, drop any existing entry with the same name before adding (idempotent re-add for setup re-runs). */
  replace?: boolean;
}

/** Adding a plugin to the tools that host it, as its callers need it. */
export interface PluginAdd {
  execute(options: PluginAddOptions): Promise<void>;
}

export class PluginAddUseCase implements PluginAdd {
  constructor(
    private readonly fs: FileWriter & FileReader,
    private readonly manifestRepo: ManifestRepository,
    private readonly pluginFetcher: PluginFetcher,
    private readonly pluginDistributionReader: PluginDistributionReader,
    private readonly hasher: Hasher,
    private readonly logger: Logger,
    private readonly marketplaceRegistry: MarketplaceRegistry,
    private readonly ensureBuilt: EnsureBuiltMarketplace
  ) {}

  async execute(options: PluginAddOptions): Promise<void> {
    const { source, toolIds, projectRoot, marketplace } = options;
    const manifest = await loadPluginManifest(this.manifestRepo);
    const resolvedToolIds = resolvePluginToolIds(toolIds, manifest);
    if (marketplace !== undefined && (await this.isGithubMarketplace(marketplace, projectRoot))) {
      await this.addGithubMarketplacePlugin(options, resolvedToolIds, manifest);
    } else {
      await this.addLocalPlugin(options, resolvedToolIds, manifest, source, projectRoot);
    }
    await this.manifestRepo.save(manifest);
  }

  private async isGithubMarketplace(name: string, projectRoot: string): Promise<boolean> {
    const all = await this.marketplaceRegistry.list(projectRoot);
    const found = all.find((m) => m.name === name);
    return found?.source.kind === "github";
  }

  private async addGithubMarketplacePlugin(
    options: PluginAddOptions,
    toolIds: AiToolId[],
    manifest: Manifest
  ): Promise<void> {
    const { pluginMetadata } = options;
    if (pluginMetadata === undefined) throw new MissingPluginMetadataError();
    if (options.replace === true) this.dropExistingPlugin(pluginMetadata.name, toolIds, manifest);
    else this.validateNoDuplicates(pluginMetadata.name, toolIds, manifest);
    const adapterMap = this.buildAdapterMap(toolIds);
    const flatToolIds = toolIds.filter((id) => adapterMap.get(id)?.mode === "flat");
    const nativeToolIds = toolIds.filter((id) => adapterMap.get(id)?.mode !== "flat");
    if (flatToolIds.length > 0) {
      await this.addLocalPlugin(
        options,
        flatToolIds,
        manifest,
        options.source,
        options.projectRoot
      );
    }
    await this.registerNativeGithubPlugins(options, nativeToolIds, manifest);
  }

  private buildAdapterMap(toolIds: AiToolId[]): Map<AiToolId, PluginTranslator | null> {
    const map = new Map<AiToolId, PluginTranslator | null>();
    for (const id of toolIds) {
      map.set(id, this.resolveAdapter(getToolConfig(id)));
    }
    return map;
  }

  private async registerNativeGithubPlugins(
    options: PluginAddOptions,
    toolIds: AiToolId[],
    manifest: Manifest
  ): Promise<void> {
    const { pluginMetadata, marketplace, source } = options;
    if (pluginMetadata === undefined || toolIds.length === 0) return;
    const version = await this.resolveNativeVersion(options, pluginMetadata);
    for (const toolId of toolIds) {
      manifest.addPlugin(
        toolId,
        InstalledPlugin.fromMetadata(
          pluginMetadata.name,
          version,
          source,
          pluginMetadata.strict,
          marketplace
        )
      );
    }
  }

  // Catalog versions are optional: when omitted, plugin.json is the authoritative
  // source, so fetch the distribution to read its version (no files materialized).
  private async resolveNativeVersion(
    options: PluginAddOptions,
    pluginMetadata: NonNullable<PluginAddOptions["pluginMetadata"]>
  ): Promise<string> {
    if (pluginMetadata.version) return pluginMetadata.version;
    const dist = await this.readDistribution(options.source, options.projectRoot);
    return dist.manifest.version;
  }

  private async readDistribution(
    source: PluginSource,
    projectRoot: string
  ): Promise<PluginDistribution> {
    const cacheDir = join(projectRoot, PLUGIN_CACHE_SUBDIR);
    const localPath = await this.pluginFetcher.fetch(source, cacheDir);
    return this.pluginDistributionReader.read(localPath);
  }

  private async addLocalPlugin(
    options: PluginAddOptions,
    resolvedToolIds: AiToolId[],
    manifest: Manifest,
    source: PluginSource,
    projectRoot: string
  ): Promise<void> {
    const { marketplace, requiredVersion, replace } = options;
    const dist = await this.readDistribution(source, projectRoot);
    const pluginName = dist.manifest.name;
    this.assertPluginVersionMatches(pluginName, dist.manifest.version, requiredVersion);
    const { prevMcpMap } = this.prepareForInstall(pluginName, resolvedToolIds, manifest, replace);
    await this.installPluginForAllTools(
      dist,
      resolvedToolIds,
      source,
      projectRoot,
      manifest,
      marketplace,
      prevMcpMap
    );
  }

  private prepareForInstall(
    pluginName: string,
    toolIds: AiToolId[],
    manifest: Manifest,
    replace: boolean | undefined
  ): { prevMcpMap: Map<AiToolId, ReadonlyMap<string, string>> } {
    const prevMcpMap = this.collectPreviousMcpEntries(pluginName, toolIds, manifest);
    if (replace === true) {
      this.dropExistingPlugin(pluginName, toolIds, manifest);
    } else {
      this.validateNoDuplicates(pluginName, toolIds, manifest);
    }
    return { prevMcpMap };
  }

  private async installPluginForAllTools(
    dist: PluginDistribution,
    toolIds: AiToolId[],
    source: PluginSource,
    projectRoot: string,
    manifest: Manifest,
    marketplace: string | undefined,
    prevMcpMap: Map<AiToolId, ReadonlyMap<string, string>>
  ): Promise<void> {
    const allSkipped: ReadonlySkipList[] = [];
    const allNotices: ReadonlyNoticeList[] = [];
    for (const toolId of toolIds) {
      const prev = prevMcpMap.get(toolId) ?? new Map();
      const { skipped, notices } = await this.addPluginForTool(
        dist,
        toolId,
        source,
        projectRoot,
        manifest,
        marketplace,
        prev
      );
      allSkipped.push(skipped);
      allNotices.push(notices);
    }
    this.emitSkipWarnings(allSkipped.flat());
    this.emitInstallNotices(allNotices.flat());
  }

  private collectPreviousMcpEntries(
    pluginName: string,
    toolIds: AiToolId[],
    manifest: Manifest
  ): Map<AiToolId, ReadonlyMap<string, string>> {
    const result = new Map<AiToolId, ReadonlyMap<string, string>>();
    for (const toolId of toolIds) {
      const existing = manifest.getPlugins(toolId).find((p) => p.name === pluginName);
      if (existing !== undefined && existing.mcpEntries.size > 0) {
        result.set(toolId, existing.mcpEntries);
      }
    }
    return result;
  }

  private assertPluginVersionMatches(
    name: string,
    actual: string,
    requested: string | undefined
  ): void {
    if (!requested) return;
    if (actual !== requested) throw new VersionMismatchError(name, requested, actual);
  }

  private validateNoDuplicates(pluginName: string, toolIds: AiToolId[], manifest: Manifest): void {
    for (const toolId of toolIds) {
      const exists = manifest.getPlugins(toolId).some((p) => p.name === pluginName);
      if (exists) throw new DuplicatePluginError(pluginName);
    }
  }

  private dropExistingPlugin(pluginName: string, toolIds: AiToolId[], manifest: Manifest): void {
    for (const toolId of toolIds) {
      const exists = manifest.getPlugins(toolId).some((p) => p.name === pluginName);
      if (exists) manifest.removePlugin(toolId, pluginName);
    }
  }

  private async addPluginForTool(
    dist: PluginDistribution,
    toolId: AiToolId,
    source: PluginSource,
    projectRoot: string,
    manifest: Manifest,
    marketplace: string | undefined,
    previousMcpEntries: ReadonlyMap<string, string> = new Map()
  ): Promise<{ skipped: ReadonlySkipList; notices: ReadonlyNoticeList }> {
    const toolConfig = getToolConfig(toolId);
    if (!isAiTool(toolConfig)) return { skipped: [], notices: [] };
    const adapter = this.resolveAdapter(toolConfig);
    if (adapter?.mode === "flat") {
      const result = await adapter.addPlugin(
        dist,
        toolId,
        source,
        projectRoot,
        manifest,
        marketplace,
        previousMcpEntries
      );
      return { ...result, notices: [] };
    }
    const translated = new PluginContentTranslator(this.hasher).translateWithComponentPaths(
      dist,
      toolConfig
    );
    return this.materializeNativePlugin(
      dist,
      toolId,
      source,
      projectRoot,
      manifest,
      marketplace,
      adapter,
      translated
    );
  }

  // `notices` survives every branch below, including the marketplace one that discards its
  // own `translated.skipped` in favor of the adapter's — a delivered hook's trust notice is
  // a fact about the tool, not about which materialization route happened to run.
  private async materializeNativePlugin(
    dist: PluginDistribution,
    toolId: AiToolId,
    source: PluginSource,
    projectRoot: string,
    manifest: Manifest,
    marketplace: string | undefined,
    adapter: PluginTranslator | null,
    translated: {
      files: InstallationFile[];
      componentPaths: ReadonlyMap<string, string>;
      skipped: ReadonlySkipList;
      notices: ReadonlyNoticeList;
    }
  ): Promise<{ skipped: ReadonlySkipList; notices: ReadonlyNoticeList }> {
    const { files, componentPaths, skipped, notices } = translated;
    if (files.length === 0) return { skipped, notices };
    if (adapter?.mode === "marketplace" && source.kind === "local" && marketplace !== undefined) {
      const result = await adapter.addPlugin(
        dist,
        toolId,
        source,
        projectRoot,
        manifest,
        marketplace
      );
      return { ...result, notices };
    }
    await writePluginFiles(files, projectRoot, this.fs);
    manifest.addPlugin(
      toolId,
      InstalledPlugin.fromDistribution(dist, source, files, componentPaths, marketplace)
    );
    return { skipped, notices };
  }

  private emitSkipWarnings(skipped: ReadonlySkipList): void {
    for (const entry of skipped) {
      this.logger.warn(
        `Plugin "${entry.pluginName}": ${entry.component} skipped for ${entry.toolId} — ${entry.reason}`
      );
    }
  }

  private emitInstallNotices(notices: ReadonlyNoticeList): void {
    for (const entry of notices) {
      this.logger.info(`Plugin "${entry.pluginName}" (${entry.toolId}): ${entry.message}`);
    }
  }

  private resolveAdapter(toolConfig: ReturnType<typeof getToolConfig>): PluginTranslator | null {
    if (toolConfig === undefined) return null;
    return resolvePluginTranslator(toolConfig, {
      fs: this.fs,
      hasher: this.hasher,
      homedir: nodeHomedir,
      ensureBuilt: this.ensureBuilt,
      marketplaceRegistry: this.marketplaceRegistry,
    });
  }
}
