import { join } from "node:path";
import type { Manifest } from "../../../domain/models/manifest.js";
import { PLUGIN_CACHE_SUBDIR } from "../../../domain/models/paths.js";
import { AI_TOOL_IDS } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { PluginDistributionReader } from "../../../domain/ports/plugin-distribution-reader.js";
import type { PluginFetcher } from "../../../domain/ports/plugin-fetcher.js";
import { getToolConfig, isAiTool, type ToolConfig } from "../../../domain/tools/registry.js";
import {
  ApplyPluginFilesUseCase,
  type BuiltMaterializationDeps,
} from "../shared/apply-plugin-files-use-case.js";

interface RestoreAllPluginsOptions {
  projectRoot: string;
  manifest: Manifest;
  docsDir: string;
  fileFilter: ((p: string) => boolean) | null;
  pluginName?: string;
}

export class RestoreAllPluginsUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly hasher: Hasher,
    private readonly pluginFetcher: PluginFetcher,
    private readonly pluginDistributionReader: PluginDistributionReader,
    private readonly builtDeps?: BuiltMaterializationDeps
  ) {}

  async execute(options: RestoreAllPluginsOptions): Promise<number> {
    const { projectRoot, manifest, docsDir, fileFilter, pluginName } = options;
    const cacheDir = join(projectRoot, PLUGIN_CACHE_SUBDIR);
    let total = 0;
    for (const toolId of AI_TOOL_IDS) {
      if (!manifest.hasTool(toolId)) continue;
      const toolConfig = getToolConfig(toolId);
      if (!isAiTool(toolConfig)) continue;
      total += await this.restoreToolPlugins(
        toolId,
        manifest,
        toolConfig,
        projectRoot,
        cacheDir,
        docsDir,
        fileFilter,
        pluginName
      );
    }
    return total;
  }

  private async restoreToolPlugins(
    toolId: (typeof AI_TOOL_IDS)[number],
    manifest: Manifest,
    toolConfig: ToolConfig,
    projectRoot: string,
    cacheDir: string,
    docsDir: string,
    fileFilter: ((p: string) => boolean) | null,
    pluginName: string | undefined
  ): Promise<number> {
    let total = 0;
    const plugins = manifest.getPlugins(toolId);
    const targets =
      pluginName !== undefined ? plugins.filter((p) => p.name === pluginName) : plugins;
    for (const plugin of targets) {
      total += await new ApplyPluginFilesUseCase(
        this.fs,
        this.hasher,
        this.pluginFetcher,
        this.pluginDistributionReader,
        this.builtDeps
      ).execute({
        toolId,
        plugin,
        toolConfig,
        projectRoot,
        cacheDir,
        manifest,
        docsDir,
        fileFilter,
      });
    }
    return total;
  }
}
