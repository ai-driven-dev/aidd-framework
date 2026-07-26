import { homedir as nodeHomedir } from "node:os";
import { join } from "node:path";
import type { PluginsCapability } from "../../../domain/capabilities/plugins-capability.js";
import {
  DuplicatePluginError,
  MissingPluginMetadataError,
  VersionMismatchError,
} from "../../../domain/errors.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import { DOCS_DIR, PLUGIN_CACHE_SUBDIR } from "../../../domain/models/paths.js";
import { Plugin } from "../../../domain/models/plugin.js";
import type { PluginDistribution } from "../../../domain/models/plugin-distribution.js";
import type { PluginSource } from "../../../domain/models/plugin-source.js";
import type { ReadonlySkipList } from "../../../domain/models/plugin-translation-skip.js";
import { PluginTranslator } from "../../../domain/models/plugin-translator.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { MarketplaceRegistry } from "../../../domain/ports/marketplace-registry.js";
import type { PluginDistributionReader } from "../../../domain/ports/plugin-distribution-reader.js";
import type { PluginFetcher } from "../../../domain/ports/plugin-fetcher.js";
import { getToolConfig, isAiTool } from "../../../domain/tools/registry.js";
import type { EnsureBuiltMarketplaceUseCase } from "../shared/ensure-built-marketplace-use-case.js";
import { loadPluginManifest, resolvePluginToolIds, writePluginFiles } from "./plugin-helpers.js";
import { resolveTranslator } from "./translator/plugin-translator-factory.js";

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

export class PluginAddUseCase {
  constructor(
    private readonly fs: FileWriter & FileReader,
    private readonly manifestRepo: ManifestRepository,
    private readonly pluginFetcher: PluginFetcher,
    private readonly pluginDistributionReader: PluginDistributionReader,
    private readonly hasher: Hasher,
    private readonly logger: Logger,
    private readonly marketplaceRegistry: MarketplaceRegistry,
    private readonly ensureBuilt: EnsureBuiltMarketplaceUseCase
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

  private buildAdapterMap(
    toolIds: AiToolId[]
  ): Map<AiToolId, ReturnType<typeof resolveTranslator>> {
    const map = new Map<AiToolId, ReturnType<typeof resolveTranslator>>();
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
        Plugin.fromMetadata(
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
    for (const toolId of toolIds) {
      const prev = prevMcpMap.get(toolId) ?? new Map();
      const { skipped } = await this.addPluginForTool(
        dist,
        toolId,
        source,
        projectRoot,
        manifest,
        marketplace,
        DOCS_DIR,
        prev
      );
      allSkipped.push(skipped);
    }
    this.emitSkipWarnings(allSkipped.flat());
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
    docsDir: string,
    previousMcpEntries: ReadonlyMap<string, string> = new Map()
  ): Promise<{ skipped: ReadonlySkipList }> {
    const toolConfig = getToolConfig(toolId);
    if (!isAiTool(toolConfig)) return { skipped: [] };
    const adapter = this.resolveAdapter(toolConfig);
    if (adapter?.mode === "flat") {
      return adapter.addPlugin(
        dist,
        toolId,
        source,
        projectRoot,
        manifest,
        marketplace,
        docsDir,
        previousMcpEntries
      );
    }
    const { files, componentPaths, skipped } = new PluginTranslator(
      this.hasher
    ).translateWithComponentPaths(dist, toolConfig, docsDir);
    if (files.length === 0) return { skipped };
    if (adapter?.mode === "marketplace" && source.kind === "local" && marketplace !== undefined) {
      return adapter.addPlugin(dist, toolId, source, projectRoot, manifest, marketplace, docsDir);
    }
    await writePluginFiles(files, projectRoot, this.fs);
    manifest.addPlugin(
      toolId,
      Plugin.fromDistribution(dist, source, files, componentPaths, marketplace)
    );
    return { skipped };
  }

  private emitSkipWarnings(skipped: ReadonlySkipList): void {
    for (const entry of skipped) {
      this.logger.warn(
        `Plugin "${entry.pluginName}": ${entry.component} skipped for ${entry.toolId} — ${entry.reason}`
      );
    }
  }

  private resolveAdapter(
    toolConfig: ReturnType<typeof getToolConfig>
  ): ReturnType<typeof resolveTranslator> {
    if (toolConfig === undefined || !isAiTool(toolConfig)) return null;
    if (!("plugins" in (toolConfig.capabilities as object))) return null;
    const caps = toolConfig.capabilities as { plugins: PluginsCapability };
    return resolveTranslator(caps.plugins, {
      fs: this.fs,
      hasher: this.hasher,
      homedir: nodeHomedir,
      ensureBuilt: this.ensureBuilt,
      marketplaceRegistry: this.marketplaceRegistry,
    });
  }
}
