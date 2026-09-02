import { join } from "node:path";
import { NoManifestError, ToolNotInstalledError } from "../../../kernel/errors.js";
import type { FileHash } from "../../../kernel/file.js";
import { extractMergeEntries, type MergeFileEntry } from "../../../kernel/merge.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { Hasher } from "../../../kernel/ports/hasher.js";
import type { AiToolId, ToolCategory, ToolId } from "../../../kernel/tool.js";
import {
  getToolConfig,
  machineLocalFilesOf,
  toolIdsForCategory,
} from "../../tools/domain/registry.js";
import type { Manifest } from "../domain/manifest.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import type { DetectPluginDriftUseCase } from "./shared/detect-plugin-drift-use-case.js";

type FileStatusKind = "modified" | "deleted" | "added";

interface FileDrift {
  relativePath: string;
  status: FileStatusKind;
}

interface ToolStatus {
  toolId: ToolId;
  version: string;
  drifted: FileDrift[];
}

interface PluginDriftEntry {
  toolId: AiToolId;
  pluginName: string;
  driftedFiles: string[];
}

interface StatusReport {
  tools: ToolStatus[];
  pluginDrift: PluginDriftEntry[];
  inSync: boolean;
}

interface StatusOptions {
  projectRoot: string;
  filterToolId?: ToolId;
  category?: ToolCategory;
  pluginName?: string;
}

export class StatusUseCase {
  constructor(
    private readonly fs: FileReader,
    private readonly manifestRepo: ManifestRepository,
    private readonly hasher: Hasher,
    private readonly detectPluginDrift: DetectPluginDriftUseCase
  ) {}

  async execute(options: StatusOptions): Promise<StatusReport> {
    const { projectRoot, filterToolId, category, pluginName } = options;
    const manifest = await this.manifestRepo.load();
    if (manifest === null) throw new NoManifestError();
    if (filterToolId && !manifest.hasTool(filterToolId))
      throw new ToolNotInstalledError(filterToolId);

    const installedToolIds = this.resolveToolIds(filterToolId, category, manifest);
    const tools = await this.checkAllTools(installedToolIds, manifest, projectRoot);
    const pluginDrift = await this.checkAllPlugins(
      installedToolIds,
      manifest,
      projectRoot,
      pluginName
    );
    const inSync = tools.every((t) => t.drifted.length === 0) && pluginDrift.length === 0;
    return { tools, pluginDrift, inSync };
  }

  private resolveToolIds(
    filterToolId: ToolId | undefined,
    category: ToolCategory | undefined,
    manifest: Manifest
  ): ToolId[] {
    if (filterToolId) return [filterToolId];
    if (category) {
      const allowed = toolIdsForCategory(category);
      return manifest
        .getInstalledToolIds()
        .filter((id) => (allowed as readonly string[]).includes(id));
    }
    return manifest.getInstalledToolIds();
  }

  private async checkAllTools(
    toolIds: ToolId[],
    manifest: Manifest,
    projectRoot: string
  ): Promise<ToolStatus[]> {
    const tools: ToolStatus[] = [];
    for (const toolId of toolIds) {
      tools.push(await this.checkOneTool(toolId, manifest, projectRoot));
    }
    return tools;
  }

  private async checkOneTool(
    toolId: ToolId,
    manifest: Manifest,
    projectRoot: string
  ): Promise<ToolStatus> {
    const version = manifest.getToolVersion(toolId) ?? "unknown";
    const trackedFiles = manifest.getToolFiles(toolId);
    const mergeFiles = manifest.getMergeFiles(toolId);
    const drifted = await this.checkTrackedFiles(trackedFiles, projectRoot);
    drifted.push(...(await this.checkMergeFiles(mergeFiles, projectRoot)));
    const dir = getToolConfig(toolId).directory;
    const trackedSet = manifest.getTrackedPathsInDirectory(dir);
    drifted.push(
      ...(await this.detectAddedFiles(dir, trackedSet, projectRoot, machineLocalFilesOf(toolId)))
    );
    return { toolId, version, drifted };
  }

  private async detectAddedFiles(
    directory: string,
    trackedSet: Set<string>,
    projectRoot: string,
    // Written by this CLI on purpose and never tracked, like the `.backup` files
    // below — reporting either as something the user added would be a lie.
    machineLocal: readonly string[]
    // User-scope plugin dirs (e.g. ~/.cursor/plugins/local/) are not scanned for added files;
    // only tracked-file drift is detected for user-scope plugins.
  ): Promise<FileDrift[]> {
    const toolDir = join(projectRoot, directory);
    if (!(await this.fs.fileExists(toolDir))) return [];
    const added: FileDrift[] = [];
    const diskFiles = await this.fs.listDirectory(toolDir);
    for (const diskRelPath of diskFiles) {
      if (diskRelPath.endsWith(".backup")) continue;
      const fullRelPath = `${directory}${diskRelPath}`;
      if (machineLocal.includes(fullRelPath)) continue;
      if (!trackedSet.has(fullRelPath)) added.push({ relativePath: fullRelPath, status: "added" });
    }
    return added;
  }

  private async checkMergeFiles(
    mergeFiles: readonly MergeFileEntry[],
    projectRoot: string
  ): Promise<FileDrift[]> {
    const drifted: FileDrift[] = [];
    for (const mergeFile of mergeFiles) {
      drifted.push(...(await this.checkOneMergeFile(mergeFile, projectRoot)));
    }
    return drifted;
  }

  private async checkOneMergeFile(
    mergeFile: MergeFileEntry,
    projectRoot: string
  ): Promise<FileDrift[]> {
    const fullPath = join(projectRoot, mergeFile.relativePath);
    if (!(await this.fs.fileExists(fullPath))) {
      return Object.keys(mergeFile.entries).map((key) => ({
        relativePath: `${mergeFile.relativePath} > ${key}`,
        status: "deleted" as const,
      }));
    }
    const diskContent = await this.fs.readFile(fullPath);
    const diskEntries = extractMergeEntries(diskContent, mergeFile.sectionKey, this.hasher);
    return this.compareMergeEntries(mergeFile, diskEntries);
  }

  private compareMergeEntries(
    mergeFile: MergeFileEntry,
    diskEntries: Record<string, FileHash>
  ): FileDrift[] {
    const drifted: FileDrift[] = [];
    for (const [key, manifestHash] of Object.entries(mergeFile.entries)) {
      const diskHash = diskEntries[key];
      if (!diskHash) {
        drifted.push({ relativePath: `${mergeFile.relativePath} > ${key}`, status: "deleted" });
      } else if (!diskHash.equals(manifestHash)) {
        drifted.push({ relativePath: `${mergeFile.relativePath} > ${key}`, status: "modified" });
      }
    }
    return drifted;
  }

  private async checkTrackedFiles(
    files: ReadonlyArray<{ relativePath: string; hash: FileHash }>,
    projectRoot: string
  ): Promise<FileDrift[]> {
    const drifted: FileDrift[] = [];
    for (const file of files) {
      const fullPath = join(projectRoot, file.relativePath);
      if (!(await this.fs.fileExists(fullPath))) {
        drifted.push({ relativePath: file.relativePath, status: "deleted" });
      } else {
        const diskHash = await this.fs.readFileHash(fullPath);
        if (!diskHash.equals(file.hash)) {
          drifted.push({ relativePath: file.relativePath, status: "modified" });
        }
      }
    }
    return drifted;
  }

  private async checkAllPlugins(
    toolIds: ToolId[],
    manifest: Manifest,
    projectRoot: string,
    pluginName?: string
  ): Promise<PluginDriftEntry[]> {
    const drifts = await this.detectPluginDrift.execute({
      manifest,
      projectRoot,
      toolIds,
      pluginName,
    });
    return drifts.map((drift) => ({
      toolId: drift.toolId,
      pluginName: drift.pluginName,
      driftedFiles: drift.files.map((file) => file.relativePath),
    }));
  }
}
