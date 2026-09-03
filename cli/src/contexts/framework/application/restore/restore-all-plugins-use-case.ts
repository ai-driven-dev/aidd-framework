import { join } from "node:path";
import { PLUGIN_CACHE_SUBDIR } from "../../../../kernel/paths.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../../kernel/ports/hasher.js";
import type { ToolId } from "../../../../kernel/tool.js";
import { AI_TOOL_IDS } from "../../../../kernel/tool.js";
import type { PluginFetcher } from "../../../distribution/domain/ports/plugin-fetcher.js";
import { getToolConfig, isAiTool, type ToolConfig } from "../../../tools/domain/registry.js";
import type { Manifest } from "../../domain/manifest.js";
import type { PluginDistributionReader } from "../../domain/ports/plugin-distribution-reader.js";
import {
  ApplyPluginFilesUseCase,
  type BuiltMaterializationDeps,
} from "../shared/apply-plugin-files-use-case.js";

interface RestoreAllPluginsOptions {
  projectRoot: string;
  manifest: Manifest;
  fileFilter: ((p: string) => boolean) | null;
  pluginName?: string;
  /** Restrict which AI tools' plugins get touched. Undefined means every installed AI tool (unscoped). */
  toolIds?: readonly ToolId[];
}

export interface RestoreAllPluginsResult {
  totalFiles: number;
  /** Names of plugins that had >=1 file actually restored, deduped across tools. */
  pluginNames: string[];
}

export class RestoreAllPluginsUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly hasher: Hasher,
    private readonly pluginFetcher: PluginFetcher,
    private readonly pluginDistributionReader: PluginDistributionReader,
    private readonly builtDeps?: BuiltMaterializationDeps
  ) {}

  async execute(options: RestoreAllPluginsOptions): Promise<RestoreAllPluginsResult> {
    const { projectRoot, manifest, fileFilter, pluginName, toolIds } = options;
    const cacheDir = join(projectRoot, PLUGIN_CACHE_SUBDIR);
    let totalFiles = 0;
    const restoredNames = new Set<string>();
    for (const toolId of AI_TOOL_IDS) {
      if (!manifest.hasTool(toolId)) continue;
      if (toolIds !== undefined && !toolIds.includes(toolId)) continue;
      const toolConfig = getToolConfig(toolId);
      if (!isAiTool(toolConfig)) continue;
      const result = await this.restoreToolPlugins(
        toolId,
        manifest,
        toolConfig,
        projectRoot,
        cacheDir,
        fileFilter,
        pluginName
      );
      totalFiles += result.totalFiles;
      for (const name of result.pluginNames) restoredNames.add(name);
    }
    return { totalFiles, pluginNames: [...restoredNames] };
  }

  private async restoreToolPlugins(
    toolId: (typeof AI_TOOL_IDS)[number],
    manifest: Manifest,
    toolConfig: ToolConfig,
    projectRoot: string,
    cacheDir: string,
    fileFilter: ((p: string) => boolean) | null,
    pluginName: string | undefined
  ): Promise<RestoreAllPluginsResult> {
    let totalFiles = 0;
    const pluginNames: string[] = [];
    const plugins = manifest.getPlugins(toolId);
    const targets =
      pluginName !== undefined ? plugins.filter((p) => p.name === pluginName) : plugins;
    for (const plugin of targets) {
      const filesWritten = await new ApplyPluginFilesUseCase(
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
        fileFilter,
      });
      totalFiles += filesWritten;
      if (filesWritten > 0) pluginNames.push(plugin.name);
    }
    return { totalFiles, pluginNames };
  }
}
