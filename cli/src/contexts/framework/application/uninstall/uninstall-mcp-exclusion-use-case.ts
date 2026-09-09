import { join } from "node:path";
import { type MergeFileEntry, removeEntriesFromJson } from "../../../../kernel/merge.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { ToolId } from "../../../../kernel/tool.js";
import type { McpExclusion } from "../../../tools/domain/mcp-exclusion.js";
import type { Manifest } from "../../domain/manifest.js";

export interface UninstallMcpExclusionOptions {
  toolId: ToolId;
  manifest: Manifest;
  projectRoot: string;
  mcpFilter: string[];
}

export interface UninstallMcpExclusionResult {
  toolId: ToolId;
  fileCount: number;
  deletedFiles: string[];
}

export class UninstallMcpExclusionUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly logger: Logger
  ) {}

  async execute(options: UninstallMcpExclusionOptions): Promise<UninstallMcpExclusionResult> {
    const { toolId, manifest, projectRoot, mcpFilter } = options;
    this.logger.info(`Removing MCP entries from ${toolId}...`);
    const mergeFiles = manifest.getMergeFiles(toolId);
    const removedKeys: string[] = [];
    const exclusions: McpExclusion[] = [];
    for (const mergeFile of mergeFiles) {
      const r = await this.processOneMergeFile(mergeFile, projectRoot, mcpFilter);
      removedKeys.push(...r.keys);
      exclusions.push(...r.exclusions);
    }
    this.rebuildMergeEntries(toolId, manifest, mcpFilter);
    manifest.addExcludedMcp(toolId, exclusions);
    return { toolId, fileCount: removedKeys.length, deletedFiles: removedKeys };
  }

  private async processOneMergeFile(
    mergeFile: MergeFileEntry,
    projectRoot: string,
    mcpFilter: string[]
  ): Promise<{ keys: string[]; exclusions: McpExclusion[] }> {
    if (mergeFile.sectionKey === null) return { keys: [], exclusions: [] };
    const matching = mcpFilter.filter((k) => mergeFile.entries[k] !== undefined);
    if (matching.length === 0) return { keys: [], exclusions: [] };
    await this.removeKeysFromJsonFile(
      join(projectRoot, mergeFile.relativePath),
      mergeFile.sectionKey,
      matching
    );
    const exclusions = matching.map((k) => ({ configPath: mergeFile.relativePath, entryKey: k }));
    return { keys: matching, exclusions };
  }

  private async removeKeysFromJsonFile(
    fullPath: string,
    sectionKey: string | null,
    keysToRemove: string[]
  ): Promise<void> {
    const content = await this.fs.readFile(fullPath);
    await this.fs.writeFile(fullPath, removeEntriesFromJson(content, sectionKey, keysToRemove));
  }

  private rebuildMergeEntries(toolId: ToolId, manifest: Manifest, removedKeys: string[]): void {
    const mergeFiles = manifest.getMergeFiles(toolId);
    const removedSet = new Set(removedKeys);
    const updated = mergeFiles.map((mf) => {
      const entries = { ...mf.entries };
      for (const key of removedSet) delete entries[key];
      return { ...mf, entries };
    });
    manifest.updateToolMergeFiles(toolId, updated);
  }
}
