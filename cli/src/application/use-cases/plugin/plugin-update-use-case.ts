import { homedir as nodeHomedir } from "node:os";
import { join } from "node:path";
import type { PluginsCapability } from "../../../domain/capabilities/plugins-capability.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import { DOCS_DIR, PLUGIN_CACHE_SUBDIR } from "../../../domain/models/paths.js";
import { Plugin } from "../../../domain/models/plugin.js";
import type { PluginDistribution } from "../../../domain/models/plugin-distribution.js";
import { PluginTranslator } from "../../../domain/models/plugin-translator.js";
import { compareSemver } from "../../../domain/models/semver.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { PluginDistributionReader } from "../../../domain/ports/plugin-distribution-reader.js";
import type { PluginFetcher } from "../../../domain/ports/plugin-fetcher.js";
import { getToolConfig, isAiTool, type ToolConfig } from "../../../domain/tools/registry.js";
import type { BuiltMaterializationDeps } from "../shared/apply-plugin-files-use-case.js";
import { loadPluginManifest, resolvePluginToolIds, writePluginFiles } from "./plugin-helpers.js";
import { BuiltTreeMaterializationTranslator } from "./translator/built-tree-materialization-translator.js";
import { resolveTranslator } from "./translator/plugin-translator-factory.js";

export interface PluginUpdateOptions {
  pluginNames?: string[];
  toolIds: AiToolId[] | "all";
  projectRoot: string;
}

export class PluginUpdateUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly pluginFetcher: PluginFetcher,
    private readonly pluginDistributionReader: PluginDistributionReader,
    private readonly hasher: Hasher,
    private readonly builtDeps?: BuiltMaterializationDeps
  ) {}

  async execute(options: PluginUpdateOptions): Promise<string[]> {
    const { pluginNames, toolIds, projectRoot } = options;
    const manifest = await loadPluginManifest(this.manifestRepo);
    const resolvedToolIds = resolvePluginToolIds(toolIds, manifest);
    const cacheDir = join(projectRoot, PLUGIN_CACHE_SUBDIR);
    const docsDir = DOCS_DIR;
    const updated: string[] = [];
    for (const toolId of resolvedToolIds) {
      const names = await this.updatePluginsForTool(
        toolId,
        pluginNames,
        projectRoot,
        cacheDir,
        manifest,
        docsDir
      );
      updated.push(...names);
    }
    await this.manifestRepo.save(manifest);
    return updated;
  }

  private async updatePluginsForTool(
    toolId: AiToolId,
    pluginNames: string[] | undefined,
    projectRoot: string,
    cacheDir: string,
    manifest: Manifest,
    docsDir: string
  ): Promise<string[]> {
    const plugins = manifest.getPlugins(toolId);
    const targets = pluginNames
      ? plugins.filter((p) => pluginNames.includes(p.name))
      : [...plugins];
    const updated: string[] = [];
    for (const plugin of targets) {
      const didUpdate = await this.updateOnePlugin(
        plugin,
        toolId,
        projectRoot,
        cacheDir,
        manifest,
        docsDir
      );
      if (didUpdate) updated.push(plugin.name);
    }
    return updated;
  }

  private async updateOnePlugin(
    plugin: Plugin,
    toolId: AiToolId,
    projectRoot: string,
    cacheDir: string,
    manifest: Manifest,
    docsDir: string
  ): Promise<boolean> {
    const localPath = await this.pluginFetcher.fetch(plugin.source, cacheDir, {
      forceRefresh: true,
    });
    const dist = await this.pluginDistributionReader.read(localPath);
    if (compareSemver(dist.manifest.version, plugin.version) <= 0) return false;
    await this.replacePluginFiles(plugin, dist, toolId, projectRoot, manifest, docsDir);
    return true;
  }

  private async replacePluginFiles(
    plugin: Plugin,
    dist: PluginDistribution,
    toolId: AiToolId,
    projectRoot: string,
    manifest: Manifest,
    docsDir: string
  ): Promise<void> {
    const baseDir = this.resolveBaseDir(toolId, projectRoot);
    await this.deleteOldFiles(plugin.files, baseDir);
    const toolConfig = getToolConfig(toolId);
    const builtTree = this.builtTreeTranslator(toolConfig);
    if (builtTree !== null && plugin.marketplace !== undefined) {
      manifest.removePlugin(toolId, plugin.name);
      await builtTree.addPlugin(
        dist,
        toolId,
        plugin.source,
        projectRoot,
        manifest,
        plugin.marketplace,
        docsDir
      );
      return;
    }
    const { files: newFiles, componentPaths } = new PluginTranslator(
      this.hasher
    ).translateWithComponentPaths(dist, toolConfig, docsDir);
    const isLocalMarketplace = plugin.source.kind === "local" && plugin.marketplace !== undefined;
    if (!isLocalMarketplace) await writePluginFiles(newFiles, baseDir, this.fs);
    manifest.updatePlugin(
      toolId,
      Plugin.fromDistribution(
        dist,
        plugin.source,
        isLocalMarketplace ? [] : newFiles,
        isLocalMarketplace ? new Map() : componentPaths
      )
    );
  }

  private async deleteOldFiles(files: ReadonlyMap<string, string>, baseDir: string): Promise<void> {
    for (const relativePath of files.keys()) {
      await this.fs.deleteFile(join(baseDir, relativePath));
    }
  }

  // Materializing tools (cursor/opencode) re-materialize from the BUILT tree so an
  // update writes the same content install did — not the raw source transform.
  private builtTreeTranslator(toolConfig: ToolConfig): BuiltTreeMaterializationTranslator | null {
    if (this.builtDeps === undefined || !isAiTool(toolConfig)) return null;
    const caps = toolConfig.capabilities as { plugins?: PluginsCapability };
    if (caps.plugins === undefined) return null;
    const translator = resolveTranslator(caps.plugins, {
      fs: this.fs,
      hasher: this.hasher,
      homedir: this.builtDeps.homedir,
      ensureBuilt: this.builtDeps.ensureBuilt,
      marketplaceRegistry: this.builtDeps.marketplaceRegistry,
    });
    return translator instanceof BuiltTreeMaterializationTranslator ? translator : null;
  }

  private resolveBaseDir(toolId: AiToolId, projectRoot: string): string {
    const toolConfig = getToolConfig(toolId);
    if (!isAiTool(toolConfig)) return projectRoot;
    const caps = toolConfig.capabilities as Record<string, unknown>;
    if (!("plugins" in caps)) return projectRoot;
    const pluginsCap = caps.plugins as PluginsCapability;
    if (pluginsCap.installScope !== "user") return projectRoot;
    return pluginsCap.resolvePluginsBaseDir(projectRoot, nodeHomedir());
  }
}
