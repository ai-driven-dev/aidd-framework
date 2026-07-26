import { join } from "node:path";
import { PluginNotFoundError } from "../../../domain/errors.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import { DOCS_DIR, PLUGIN_CACHE_SUBDIR } from "../../../domain/models/paths.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type { FileMerger } from "../../../domain/ports/file-merger.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { PluginDistributionReader } from "../../../domain/ports/plugin-distribution-reader.js";
import type { PluginFetcher } from "../../../domain/ports/plugin-fetcher.js";
import { getToolConfig, isAiTool } from "../../../domain/tools/registry.js";
import { NoManifestError } from "../../errors.js";
import {
  ApplyPluginFilesUseCase,
  type BuiltMaterializationDeps,
} from "../shared/apply-plugin-files-use-case.js";

export interface RestorePluginOptions {
  pluginName: string;
  projectRoot: string;
}

export interface RestorePluginResult {
  totalRestored: number;
}

export class RestorePluginUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter & FileMerger,
    private readonly manifestRepo: ManifestRepository,
    private readonly pluginFetcher: PluginFetcher,
    private readonly pluginDistributionReader: PluginDistributionReader,
    private readonly hasher: Hasher,
    private readonly builtDeps?: BuiltMaterializationDeps
  ) {}

  async execute(options: RestorePluginOptions): Promise<RestorePluginResult> {
    const { pluginName, projectRoot } = options;
    const manifest = await this.manifestRepo.load();
    if (manifest === null) throw new NoManifestError();
    const cacheDir = join(projectRoot, PLUGIN_CACHE_SUBDIR);
    const docsDir = DOCS_DIR;
    const toolIds = AI_TOOL_IDS.filter((id) => manifest.hasTool(id)) as AiToolId[];
    let totalRestored = 0;
    for (const toolId of toolIds) {
      totalRestored += await this.applyPluginForTool(
        toolId,
        pluginName,
        projectRoot,
        cacheDir,
        manifest,
        docsDir
      );
    }
    if (totalRestored === 0) throw new PluginNotFoundError(pluginName);
    await this.manifestRepo.save(manifest);
    return { totalRestored };
  }

  private async applyPluginForTool(
    toolId: AiToolId,
    pluginName: string,
    projectRoot: string,
    cacheDir: string,
    manifest: Manifest,
    docsDir: string
  ): Promise<number> {
    const plugin = manifest.getPlugins(toolId).find((p) => p.name === pluginName);
    if (plugin === undefined) return 0;
    const toolConfig = getToolConfig(toolId);
    if (!isAiTool(toolConfig)) return 0;
    return new ApplyPluginFilesUseCase(
      this.fs,
      this.hasher,
      this.pluginFetcher,
      this.pluginDistributionReader,
      this.builtDeps
    ).execute({ toolId, plugin, toolConfig, projectRoot, cacheDir, manifest, docsDir });
  }
}
