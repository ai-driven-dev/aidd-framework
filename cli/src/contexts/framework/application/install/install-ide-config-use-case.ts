import { basename, join } from "node:path";
import { InstallationFile } from "../../../../kernel/file.js";
import { extractMergeEntries, type MergeFileEntry } from "../../../../kernel/merge.js";
import type { AssetProvider } from "../../../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../../kernel/ports/hasher.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { IdeToolId } from "../../../../kernel/tool.js";
import type { SettingsCapability } from "../../../tools/domain/capabilities/settings-capability.js";
import type { FileMerger } from "../../../tools/domain/ports/file-merger.js";
import { getToolConfig } from "../../../tools/domain/registry.js";
import type { Manifest } from "../../domain/manifest.js";
import type { PostInstallPipelineUseCase } from "./post-install-pipeline-use-case.js";

export interface InstallIdeConfigOptions {
  toolId: IdeToolId;
  projectRoot: string;
  manifest: Manifest;
  force: boolean;
  version: string;
  /** Optional per-file gate for the update path. Returns "skip" to leave the file unwritten. Defaults to always-write. */
  onBeforeWriteRegularFile?: (relativePath: string) => Promise<"write" | "skip">;
}

export interface InstallIdeConfigResult {
  toolId: IdeToolId;
  fileCount: number;
  files: InstallationFile[];
  skipped: boolean;
  warnings: string[];
}

export class InstallIdeConfigUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter & FileMerger,
    private readonly hasher: Hasher,
    private readonly logger: Logger,
    private readonly assets: AssetProvider,
    private readonly postInstallPipelineUseCase: PostInstallPipelineUseCase
  ) {}

  async execute(options: InstallIdeConfigOptions): Promise<InstallIdeConfigResult> {
    const { toolId, manifest, force } = options;
    if (manifest.hasTool(toolId) && !force) {
      return { toolId, fileCount: 0, files: [], skipped: true, warnings: [] };
    }
    const { regularFiles, mergeFiles } = await this.buildSettingsFiles(options);
    const allTracked = await this.writeRegularFiles(
      regularFiles,
      options.projectRoot,
      options.onBeforeWriteRegularFile
    );
    await this.writeMergeFiles(mergeFiles, options.projectRoot);
    const mergeEntries = await this.buildMergeEntries(mergeFiles, options.projectRoot);
    const allFiles = [...regularFiles, ...mergeFiles];
    manifest.addTool(toolId, options.version, allTracked, mergeEntries);
    await this.postInstallPipelineUseCase.execute({
      projectRoot: options.projectRoot,
      manifest,
    });
    return {
      toolId,
      fileCount: allFiles.length,
      files: allFiles,
      skipped: false,
      warnings: [],
    };
  }

  private async buildSettingsFiles(
    options: InstallIdeConfigOptions
  ): Promise<{ regularFiles: InstallationFile[]; mergeFiles: InstallationFile[] }> {
    const toolConfig = getToolConfig(options.toolId);
    if (!("settings" in toolConfig)) return { regularFiles: [], mergeFiles: [] };
    const raw = toolConfig.settings as SettingsCapability | SettingsCapability[];
    const capabilities = Array.isArray(raw) ? raw : [raw];
    const regularFiles: InstallationFile[] = [];
    const mergeFiles: InstallationFile[] = [];
    for (const capability of capabilities) {
      const file = await this.buildSettingsFile(capability, options);
      if (file === null) continue;
      if (file.mergeStrategy !== "none") mergeFiles.push(file);
      else regularFiles.push(file);
    }
    return { regularFiles, mergeFiles };
  }

  private async buildSettingsFile(
    capability: SettingsCapability,
    options: InstallIdeConfigOptions
  ): Promise<InstallationFile | null> {
    const outputPath = capability.buildOutputPath();
    if (await this.isUserOwned(outputPath, options)) return null;
    const fileName = basename(outputPath);
    const asset = this.assets.loadConfigAsset(options.toolId, fileName);
    const content = typeof asset === "string" ? asset : JSON.stringify(asset, null, 2);
    return new InstallationFile({
      relativePath: outputPath,
      content,
      hash: this.hasher.hash(content),
      mergeStrategy: capability.getMergeStrategy(),
    });
  }

  private async isUserOwned(
    relativePath: string,
    options: InstallIdeConfigOptions
  ): Promise<boolean> {
    const fullPath = join(options.projectRoot, relativePath);
    if (!(await this.fs.fileExists(fullPath))) return false;
    if (options.manifest.isFileTracked(relativePath)) return false;
    this.logger.warn(`Skipping ${relativePath} — exists but not tracked by aidd`);
    return true;
  }

  private async writeRegularFiles(
    files: InstallationFile[],
    projectRoot: string,
    onBeforeWrite?: (relativePath: string) => Promise<"write" | "skip">
  ): Promise<InstallationFile[]> {
    const allTracked: InstallationFile[] = [];
    for (const file of files) {
      const decision = onBeforeWrite ? await onBeforeWrite(file.relativePath) : "write";
      if (decision === "skip") {
        const diskFile = await this.buildSkippedFileEntry(file, projectRoot);
        allTracked.push(diskFile);
        continue;
      }
      await this.fs.writeFile(join(projectRoot, file.relativePath), file.content);
      allTracked.push(file);
    }
    return allTracked;
  }

  private async buildSkippedFileEntry(
    file: InstallationFile,
    projectRoot: string
  ): Promise<InstallationFile> {
    const diskPath = join(projectRoot, file.relativePath);
    const diskHash = await this.fs.readFileHash(diskPath);
    return new InstallationFile({ relativePath: file.relativePath, content: "", hash: diskHash });
  }

  private async writeMergeFiles(files: InstallationFile[], projectRoot: string): Promise<void> {
    for (const file of files) {
      await this.fs.mergeJsonFile(
        join(projectRoot, file.relativePath),
        file.content,
        file.mergeStrategy
      );
    }
  }

  private async buildMergeEntries(
    files: InstallationFile[],
    projectRoot: string
  ): Promise<MergeFileEntry[]> {
    const entries: MergeFileEntry[] = [];
    for (const file of files) {
      const fullPath = join(projectRoot, file.relativePath);
      const diskContent = await this.fs.readFile(fullPath);
      const hashes = extractMergeEntries(diskContent, null, this.hasher);
      entries.push({ relativePath: file.relativePath, sectionKey: null, entries: hashes });
    }
    return entries;
  }
}
