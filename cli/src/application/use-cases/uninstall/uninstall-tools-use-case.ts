import { dirname, join } from "node:path";
import type { Manifest } from "../../../domain/models/manifest.js";
import {
  isMergeContentEmpty,
  type MergeFileEntry,
  removeEntriesFromJson,
} from "../../../domain/models/merge.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Logger } from "../../../domain/ports/logger.js";
import { getToolConfig, isAiTool, type ToolId } from "../../../domain/tools/registry.js";
import { computeRetainedPaths, type RetainedPaths } from "./shared-path-guard.js";

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
    const retained = computeRetainedPaths(
      manifest,
      allToolIds.map((id) => ({ toolId: id, pluginName: null }))
    );
    const mergeFilePaths = this.collectMergeFilePaths(toolId, manifest);
    const allPaths = this.collectToolPaths(toolId, manifest);
    const deletedFiles = await this.deleteToolFiles(
      toolId,
      allToolIds,
      allPaths,
      retained,
      mergeFilePaths,
      manifest,
      projectRoot
    );
    await this.removeAllPluginFiles(toolId, manifest, projectRoot, retained);
    manifest.removeTool(toolId);
    return { toolId, fileCount: deletedFiles.length, deletedFiles };
  }

  private async deleteToolFiles(
    toolId: ToolId,
    allToolIds: ToolId[],
    allPaths: string[],
    retained: RetainedPaths,
    mergeFilePaths: Set<string>,
    manifest: Manifest,
    projectRoot: string
  ): Promise<string[]> {
    const deleted: string[] = [];
    for (const relativePath of allPaths) {
      if (retained.has(relativePath) && !mergeFilePaths.has(relativePath)) {
        this.warnRetained(relativePath, retained);
        continue;
      }
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
    projectRoot: string,
    retained: RetainedPaths
  ): Promise<void> {
    for (const plugin of manifest.getPlugins(toolId)) {
      await this.deletePluginFiles(plugin.files, projectRoot, retained);
    }
  }

  private async deletePluginFiles(
    files: ReadonlyMap<string, string>,
    projectRoot: string,
    retained: RetainedPaths
  ): Promise<void> {
    for (const relativePath of files.keys()) {
      if (retained.has(relativePath)) {
        this.warnRetained(relativePath, retained);
        continue;
      }
      const fullPath = join(projectRoot, relativePath);
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
    }
  }

  private warnRetained(relativePath: string, retained: RetainedPaths): void {
    const owners = retained.get(relativePath) ?? [];
    this.logger.warn(`Kept ${relativePath}: still installed for ${owners.join(", ")}`);
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
}
