import { dirname, join } from "node:path";
import {
  isMergeContentEmpty,
  type MergeFileEntry,
  removeEntriesFromJson,
} from "../../../kernel/merge.js";
import {
  AIDD_CONFIG_FILENAME,
  AIDD_DIR,
  AIDD_MARKETPLACES_FILENAME,
  PLUGIN_CACHE_SUBDIR,
} from "../../../kernel/paths.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../kernel/ports/logger.js";
import type { Prompter } from "../../../kernel/ports/prompter.js";
import type { AiToolId, ToolId } from "../../../kernel/tool.js";
import { isAiToolId } from "../../../kernel/tool.js";
import type { Manifest } from "../domain/manifest.js";
import { aiddGitignoreEntries } from "../domain/manifest-gitignore-entries.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import type { GitignoreUseCase } from "./gitignore-use-case.js";
import { deletePluginFilesForTool } from "./plugin/plugin-helpers.js";

interface CleanOptions {
  projectRoot: string;
  force: boolean;
  interactive?: boolean;
}

interface CleanPreview {
  tools: Array<{ toolId: ToolId; fileCount: number }>;
  totalFileCount: number;
}

interface CleanResult {
  dryRun: boolean;
  manifestFound: boolean;
  preview: CleanPreview;
  fileCount: number;
}

export class CleanUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly logger: Logger,
    private readonly gitignoreUseCase: GitignoreUseCase,
    private readonly prompter?: Prompter
  ) {}

  async execute(options: CleanOptions): Promise<CleanResult> {
    const manifest = await this.manifestRepo.load();
    if (manifest === null) {
      const emptyPreview: CleanPreview = { tools: [], totalFileCount: 0 };
      return { dryRun: false, manifestFound: false, preview: emptyPreview, fileCount: 0 };
    }
    const preview = this.buildPreview(manifest);
    const dryRunResult = await this.confirmOrDryRun(options, preview);
    if (dryRunResult !== null) return dryRunResult;
    const deleted = await this.deleteAllToolFiles(manifest, options.projectRoot);
    await this.removeAiddState(options.projectRoot);
    // The same entries the pipeline added on install — clean must remove exactly what
    // was added, never a subset of it.
    await this.gitignoreUseCase.remove(options.projectRoot, aiddGitignoreEntries(manifest));
    return { dryRun: false, manifestFound: true, preview, fileCount: deleted };
  }

  // config.json is the committed telemetry switch: a file clean did not write,
  // so clean never removes it. Everything AIDD did write must go before the
  // emptiness check, or its own presence blocks a removal that should happen —
  // the registry `marketplace add` writes included, which is a file and was
  // missed while only the directories were listed.
  private async removeAiddState(projectRoot: string): Promise<void> {
    const aiddDir = join(projectRoot, AIDD_DIR);
    const configKept = await this.fs.fileExists(join(aiddDir, AIDD_CONFIG_FILENAME));

    await this.fs.deleteDirectory(join(aiddDir, "cache"));
    await this.fs.deleteDirectory(join(projectRoot, PLUGIN_CACHE_SUBDIR));
    await this.fs.deleteFile(join(aiddDir, AIDD_MARKETPLACES_FILENAME));
    await this.manifestRepo.delete();

    if (!(await this.fs.fileExists(aiddDir))) return;
    const remaining = await this.fs.listDirectory(aiddDir);
    if (remaining.length === 0) {
      await this.fs.deleteDirectory(aiddDir);
      return;
    }
    if (configKept) this.logger.info(`Kept ${AIDD_DIR}/${AIDD_CONFIG_FILENAME}`);
  }

  private buildPreview(manifest: Manifest): CleanPreview {
    const tools = manifest.getInstalledToolIds().map((toolId) => ({
      toolId,
      fileCount: manifest.getToolFiles(toolId).length + manifest.getMergeFiles(toolId).length,
    }));
    const totalFileCount = tools.reduce((s, t) => s + t.fileCount, 0);
    return { tools, totalFileCount };
  }

  private async confirmOrDryRun(
    options: CleanOptions,
    preview: CleanPreview
  ): Promise<CleanResult | null> {
    if (options.force) return null;
    if (options.interactive && this.prompter) {
      const confirmed = await this.prompter.confirm("Remove all AIDD files?");
      if (!confirmed) return { dryRun: true, manifestFound: true, preview, fileCount: 0 };
      return null;
    }
    return { dryRun: true, manifestFound: true, preview, fileCount: 0 };
  }

  private async deleteAllToolFiles(manifest: Manifest, projectRoot: string): Promise<number> {
    let deleted = 0;
    for (const toolId of manifest.getInstalledToolIds()) {
      this.logger.info(`Removing ${toolId} files...`);
      deleted += await this.deleteFiles(manifest.getToolFiles(toolId), projectRoot);
      deleted += await this.cleanMergeFileKeys(manifest.getMergeFiles(toolId), projectRoot);
      if (isAiToolId(toolId)) {
        deleted += await this.deleteToolPluginFiles(manifest, toolId, projectRoot);
      }
    }
    return deleted;
  }

  private async deleteToolPluginFiles(
    manifest: Manifest,
    toolId: AiToolId,
    projectRoot: string
  ): Promise<number> {
    let count = 0;
    for (const plugin of manifest.getPlugins(toolId)) {
      const deleted = await deletePluginFilesForTool(
        plugin.files,
        plugin.scope,
        toolId,
        projectRoot,
        this.fs
      );
      count += deleted.length;
    }
    return count;
  }

  private async cleanMergeFileKeys(
    mergeFiles: readonly MergeFileEntry[],
    projectRoot: string
  ): Promise<number> {
    let count = 0;
    for (const mergeFile of mergeFiles) {
      const fullPath = join(projectRoot, mergeFile.relativePath);
      if (!(await this.fs.fileExists(fullPath))) continue;
      await this.applyMergeFileCleaning(fullPath, mergeFile);
      count++;
    }
    return count;
  }

  private async applyMergeFileCleaning(fullPath: string, mergeFile: MergeFileEntry): Promise<void> {
    const keys = Object.keys(mergeFile.entries);
    if (keys.length === 0) {
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
      return;
    }
    const content = await this.fs.readFile(fullPath);
    const cleaned = removeEntriesFromJson(content, mergeFile.sectionKey, keys);
    if (isMergeContentEmpty(cleaned, mergeFile.sectionKey)) {
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
    } else {
      await this.fs.writeFile(fullPath, cleaned);
    }
  }

  private async deleteFiles(
    files: ReadonlyArray<{ relativePath: string }>,
    projectRoot: string
  ): Promise<number> {
    let count = 0;
    for (const file of files) {
      const fullPath = join(projectRoot, file.relativePath);
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
      count++;
    }
    return count;
  }
}
