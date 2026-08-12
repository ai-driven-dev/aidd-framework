import { dirname, join } from "node:path";
import { PluginNotFoundError } from "../../../domain/errors.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import { AI_TOOL_IDS } from "../../../domain/models/tool-ids.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { ToolId } from "../../../domain/tools/registry.js";
import { NoManifestError } from "../../errors.js";
import { computeRetainedPaths, type RetainedPaths } from "./shared-path-guard.js";

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
    private readonly manifestRepo: ManifestRepository,
    private readonly logger: Logger
  ) {}

  async execute(options: UninstallPluginOptions): Promise<UninstallPluginResult[]> {
    const { pluginName, toolIds, projectRoot } = options;
    const manifest = await this.manifestRepo.load();
    if (manifest === null) throw new NoManifestError();
    const scope = this.resolveToolScope(toolIds, manifest);
    const retained = computeRetainedPaths(
      manifest,
      scope.map((toolId) => ({ toolId, pluginName }))
    );
    const results = await this.removeFromTools(pluginName, scope, projectRoot, manifest, retained);
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
    manifest: Manifest,
    retained: RetainedPaths
  ): Promise<UninstallPluginResult[]> {
    const results: UninstallPluginResult[] = [];
    for (const toolId of toolIds) {
      const plugin = manifest.getPlugins(toolId).find((p) => p.name === pluginName);
      if (plugin === undefined) continue;
      const deletedFiles = await this.deleteFiles(plugin.files, projectRoot, retained);
      manifest.removePlugin(toolId, pluginName);
      results.push({ toolId, fileCount: deletedFiles.length, deletedFiles });
    }
    return results;
  }

  private async deleteFiles(
    files: ReadonlyMap<string, string>,
    projectRoot: string,
    retained: RetainedPaths
  ): Promise<string[]> {
    const deleted: string[] = [];
    for (const relativePath of files.keys()) {
      const owners = retained.get(relativePath);
      if (owners !== undefined) {
        this.logger.warn(`Kept ${relativePath}: still installed for ${owners.join(", ")}`);
        continue;
      }
      const fullPath = join(projectRoot, relativePath);
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
      deleted.push(relativePath);
    }
    return deleted;
  }
}
