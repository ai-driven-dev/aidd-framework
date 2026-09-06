import { dirname, join } from "node:path";
import {
  isMergeContentEmpty,
  type MergeFileEntry,
  removeEntriesFromJson,
} from "../../../../kernel/merge.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { ToolId } from "../../../../kernel/tool.js";
import { isAiToolId } from "../../../../kernel/tool.js";
import { getToolConfig, isAiTool } from "../../../tools/domain/registry.js";
import type { Manifest } from "../../domain/manifest.js";
import { deletePluginFilesForTool } from "../plugin/plugin-helpers.js";

export interface UninstallToolsOptions {
  toolIds: ToolId[];
  manifest: Manifest;
  projectRoot: string;
}

export interface UninstallToolsResult {
  toolId: ToolId;
  fileCount: number;
  deletedFiles: string[];
}

export class UninstallToolsUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly logger: Logger
  ) {}

  async execute(options: UninstallToolsOptions): Promise<UninstallToolsResult[]> {
    const { toolIds, manifest, projectRoot } = options;
    const results: UninstallToolsResult[] = [];
    for (const toolId of toolIds) {
      results.push(await this.removeOneTool(toolId, toolIds, manifest, projectRoot));
    }
    return results;
  }

  private async removeOneTool(
    toolId: ToolId,
    allToolIds: ToolId[],
    manifest: Manifest,
    projectRoot: string
  ): Promise<UninstallToolsResult> {
    this.logger.info(`Removing ${toolId} files...`);
    const sharedPaths = this.computeSharedPaths(toolId, allToolIds, manifest);
    const mergeFilePaths = this.collectMergeFilePaths(toolId, manifest);
    const allPaths = this.collectToolPaths(toolId, manifest);
    const deletedFiles = await this.deleteToolFiles(
      toolId,
      allToolIds,
      allPaths,
      sharedPaths,
      mergeFilePaths,
      manifest,
      projectRoot
    );
    await this.removeAllPluginFiles(toolId, manifest, projectRoot);
    manifest.removeTool(toolId);
    return { toolId, fileCount: deletedFiles.length, deletedFiles };
  }

  private async deleteToolFiles(
    toolId: ToolId,
    allToolIds: ToolId[],
    allPaths: string[],
    sharedPaths: Set<string>,
    mergeFilePaths: Set<string>,
    manifest: Manifest,
    projectRoot: string
  ): Promise<string[]> {
    const deleted: string[] = [];
    for (const relativePath of allPaths) {
      if (sharedPaths.has(relativePath) && !mergeFilePaths.has(relativePath)) continue;
      if (mergeFilePaths.has(relativePath)) {
        const removed = await this.removeMergeFile(
          toolId,
          allToolIds,
          relativePath,
          manifest,
          projectRoot
        );
        if (removed) deleted.push(relativePath);
        continue;
      }
      const fullPath = join(projectRoot, relativePath);
      await this.fs.deleteFile(fullPath);
      deleted.push(relativePath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
    }
    return deleted;
  }

  private async removeAllPluginFiles(
    toolId: ToolId,
    manifest: Manifest,
    projectRoot: string
  ): Promise<void> {
    if (!isAiToolId(toolId)) return;
    for (const plugin of manifest.getPlugins(toolId)) {
      await deletePluginFilesForTool(plugin.files, toolId, projectRoot, this.fs);
    }
  }

  private collectMergeFilePaths(toolId: ToolId, manifest: Manifest): Set<string> {
    return new Set(manifest.getMergeFiles(toolId).map((m) => m.relativePath));
  }

  private collectToolPaths(toolId: ToolId, manifest: Manifest): string[] {
    const filePaths = manifest.getToolFiles(toolId).map((f) => f.relativePath);
    const mergePaths = manifest.getMergeFiles(toolId).map((m) => m.relativePath);
    return [...filePaths, ...mergePaths];
  }

  private async removeMergeFile(
    toolId: ToolId,
    allToolIds: ToolId[],
    relativePath: string,
    manifest: Manifest,
    projectRoot: string
  ): Promise<boolean> {
    const mergeEntry = manifest.getMergeFiles(toolId).find((m) => m.relativePath === relativePath);
    if (!mergeEntry) return false;
    const fullPath = join(projectRoot, relativePath);
    if (!(await this.fs.fileExists(fullPath))) return false;
    const canDelete = this.computeDeletePermission(toolId, allToolIds, relativePath, manifest);
    if (mergeEntry.sectionKey === null && canDelete) {
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
      return true;
    }
    return this.deleteOrWriteStripped(fullPath, mergeEntry, canDelete);
  }

  private computeDeletePermission(
    toolId: ToolId,
    allToolIds: ToolId[],
    relativePath: string,
    manifest: Manifest
  ): boolean {
    const otherOwnersExist = this.otherToolsOwnMergeFile(
      toolId,
      allToolIds,
      relativePath,
      manifest
    );
    const isIdeTool = !isAiTool(getToolConfig(toolId));
    return !otherOwnersExist && !isIdeTool;
  }

  private async deleteOrWriteStripped(
    fullPath: string,
    mergeEntry: MergeFileEntry,
    canDelete: boolean
  ): Promise<boolean> {
    const keys = Object.keys(mergeEntry.entries);
    if (keys.length === 0) {
      if (!canDelete) return false;
      await this.deleteFileAndDir(fullPath);
      return true;
    }
    const content = await this.fs.readFile(fullPath);
    const cleaned = removeEntriesFromJson(content, mergeEntry.sectionKey, keys);
    if (isMergeContentEmpty(cleaned, mergeEntry.sectionKey) || canDelete) {
      await this.deleteFileAndDir(fullPath);
      return true;
    }
    await this.fs.writeFile(fullPath, cleaned);
    return false;
  }

  private async deleteFileAndDir(fullPath: string): Promise<void> {
    await this.fs.deleteFile(fullPath);
    await this.fs.deleteEmptyDirectories(dirname(fullPath));
  }

  private otherToolsOwnMergeFile(
    toolId: ToolId,
    allToolIds: ToolId[],
    relativePath: string,
    manifest: Manifest
  ): boolean {
    const uninstallingSet = new Set([toolId, ...allToolIds]);
    return manifest
      .getInstalledToolIds()
      .filter((id) => !uninstallingSet.has(id))
      .some((id) => manifest.getMergeFiles(id).some((m) => m.relativePath === relativePath));
  }

  private computeSharedPaths(
    toolId: ToolId,
    allToolIds: ToolId[],
    manifest: Manifest
  ): Set<string> {
    const remainingToolIds = manifest
      .getInstalledToolIds()
      .filter((id) => id !== toolId && !allToolIds.includes(id));
    return new Set([
      ...remainingToolIds.flatMap((id) => manifest.getToolFiles(id).map((f) => f.relativePath)),
      ...remainingToolIds.flatMap((id) => manifest.getMergeFiles(id).map((m) => m.relativePath)),
    ]);
  }
}
