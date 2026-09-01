import { homedir as nodeHomedir } from "node:os";
import { join } from "node:path";
import type { Manifest } from "../../../domain/models/manifest.js";
import { Plugin } from "../../../domain/models/plugin.js";
import { PluginContentTranslator } from "../../../domain/models/plugin-content-translator.js";
import type { PluginDistribution } from "../../../domain/models/plugin-distribution.js";
import { compareSemver } from "../../../domain/models/semver.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { PluginDistributionReader } from "../../../domain/ports/plugin-distribution-reader.js";
import type { PluginFetcher } from "../../../domain/ports/plugin-fetcher.js";
import { getToolConfig, type ToolConfig } from "../../../domain/tools/registry.js";
import { DOCS_DIR, PLUGIN_CACHE_SUBDIR } from "../../../kernel/paths.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../kernel/ports/hasher.js";
import type { AiToolId } from "../../../kernel/tool.js";
import type { PluginTranslator } from "../framework/translator/plugin-translator.js";
import { resolvePluginTranslator } from "../framework/translator/resolve-plugin-translator.js";
import type { BuiltMaterializationDeps } from "../shared/apply-plugin-files-use-case.js";
import {
  deleteOldFiles,
  loadPluginManifest,
  materializeViaTranslator,
  resolvePluginBaseDir,
  resolvePluginToolIds,
  writePluginFiles,
} from "./plugin-helpers.js";

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
    const baseDir = resolvePluginBaseDir(toolId, projectRoot, nodeHomedir);
    await deleteOldFiles(plugin.files, baseDir, this.fs);
    const toolConfig = getToolConfig(toolId);
    const translator = this.resolveTranslator(toolConfig);
    if (translator !== null && plugin.marketplace !== undefined) {
      await materializeViaTranslator(
        translator,
        dist,
        toolId,
        plugin,
        projectRoot,
        manifest,
        docsDir
      );
      return;
    }
    const { files: newFiles, componentPaths } = new PluginContentTranslator(
      this.hasher
    ).translateWithComponentPaths(dist, toolConfig, docsDir);
    await writePluginFiles(newFiles, baseDir, this.fs);
    manifest.updatePlugin(
      toolId,
      Plugin.fromDistribution(dist, plugin.source, newFiles, componentPaths)
    );
  }

  // Materializing tools (cursor/opencode) re-materialize from the BUILT tree, and Mode A
  // marketplace tools (claude/codex/copilot) re-register without writing files, so an
  // update matches whatever install would have done for that tool.
  private resolveTranslator(toolConfig: ToolConfig): PluginTranslator | null {
    if (this.builtDeps === undefined) return null;
    return resolvePluginTranslator(toolConfig, {
      fs: this.fs,
      hasher: this.hasher,
      homedir: this.builtDeps.homedir,
      ensureBuilt: this.builtDeps.ensureBuilt,
      marketplaceRegistry: this.builtDeps.marketplaceRegistry,
    });
  }
}
