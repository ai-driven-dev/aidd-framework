import { dirname, join } from "node:path";
import { NoManifestError, PluginNotFoundError } from "../../../../kernel/errors.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { AiToolId, ToolId } from "../../../../kernel/tool.js";
import { AI_TOOL_IDS } from "../../../../kernel/tool.js";
import type { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";

export interface UninstallPluginOptions {
  pluginName: string;
  toolIds: ToolId[];
  projectRoot: string;
}

export interface UninstallPluginResult {
  toolId: ToolId;
  fileCount: number;
  deletedFiles: string[];
}

export class UninstallPluginUseCase {
  constructor(
    private readonly fs: FileWriter,
    private readonly manifestRepo: ManifestRepository
  ) {}

  async execute(options: UninstallPluginOptions): Promise<UninstallPluginResult[]> {
    const { pluginName, toolIds, projectRoot } = options;
    const manifest = await this.manifestRepo.load();
    if (manifest === null) throw new NoManifestError();
    const scope = this.resolveToolScope(toolIds, manifest);
    const results = await this.removeFromTools(pluginName, scope, projectRoot, manifest);
    if (results.length === 0) throw new PluginNotFoundError(pluginName);
    await this.manifestRepo.save(manifest);
    return results;
  }

  private resolveToolScope(toolIds: ToolId[], manifest: Manifest): AiToolId[] {
    if (toolIds.length > 0) return toolIds.filter((id) => manifest.hasTool(id)) as AiToolId[];
    return AI_TOOL_IDS.filter((id) => manifest.hasTool(id)) as AiToolId[];
  }

  private async removeFromTools(
    pluginName: string,
    toolIds: AiToolId[],
    projectRoot: string,
    manifest: Manifest
  ): Promise<UninstallPluginResult[]> {
    const results: UninstallPluginResult[] = [];
    for (const toolId of toolIds) {
      const plugin = manifest.getPlugins(toolId).find((p) => p.name === pluginName);
      if (plugin === undefined) continue;
      const deletedFiles = await this.deleteFiles(plugin.files, projectRoot);
      manifest.removePlugin(toolId, pluginName);
      results.push({ toolId, fileCount: deletedFiles.length, deletedFiles });
    }
    return results;
  }

  private async deleteFiles(
    files: ReadonlyMap<string, string>,
    projectRoot: string
  ): Promise<string[]> {
    const deleted: string[] = [];
    for (const relativePath of files.keys()) {
      const fullPath = join(projectRoot, relativePath);
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
      deleted.push(relativePath);
    }
    return deleted;
  }
}
