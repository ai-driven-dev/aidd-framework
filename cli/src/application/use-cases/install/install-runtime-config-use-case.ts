import { join } from "node:path";
import { SettingsCapability } from "../../../domain/capabilities/settings-capability.js";
import { KiloDualConfigError } from "../../../domain/errors.js";
import { InstallationFile } from "../../../domain/models/file.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import { extractMergeEntries, type MergeFileEntry } from "../../../domain/models/merge.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import type { AssetProvider } from "../../../domain/ports/asset-provider.js";
import type { FileMerger } from "../../../domain/ports/file-merger.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { Logger } from "../../../domain/ports/logger.js";
import { getToolConfig, isAiTool } from "../../../domain/tools/registry.js";
import type { PostInstallPipelineUseCase } from "../shared/post-install-pipeline-use-case.js";

export interface InstallRuntimeConfigOptions {
  toolId: AiToolId;
  projectRoot: string;
  manifest: Manifest;
  force: boolean;
  version: string;
  /** Optional per-file gate for the update path. Returns "skip" to leave the file unwritten. Defaults to always-write. */
  onBeforeWriteRegularFile?: (relativePath: string) => Promise<"write" | "skip">;
}

export interface InstallRuntimeConfigResult {
  toolId: AiToolId;
  fileCount: number;
  files: InstallationFile[];
  skipped: boolean;
  warnings: string[];
}

export class InstallRuntimeConfigUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter & FileMerger,
    private readonly hasher: Hasher,
    private readonly logger: Logger,
    private readonly assets: AssetProvider,
    private readonly postInstallPipelineUseCase: PostInstallPipelineUseCase
  ) {}

  async execute(options: InstallRuntimeConfigOptions): Promise<InstallRuntimeConfigResult> {
    const { toolId, manifest, force } = options;
    if (manifest.hasTool(toolId) && !force) {
      return { toolId, fileCount: 0, files: [], skipped: true, warnings: [] };
    }
    const regularFiles = await this.buildConfigFiles(options);
    const mergeFiles = this.buildStaticSettingsFiles(options);
    await this.applyAndTrack(regularFiles, mergeFiles, options);
    const allFiles = [...regularFiles, ...mergeFiles];
    return { toolId, fileCount: allFiles.length, files: allFiles, skipped: false, warnings: [] };
  }

  private async applyAndTrack(
    regularFiles: InstallationFile[],
    mergeFiles: InstallationFile[],
    options: InstallRuntimeConfigOptions
  ): Promise<void> {
    const allTracked = await this.writeRegularFiles(
      regularFiles,
      options.projectRoot,
      options.onBeforeWriteRegularFile
    );
    await this.writeMergeFiles(mergeFiles, options.projectRoot);
    const mergeEntries = await this.buildMergeEntries(mergeFiles, options.projectRoot);
    options.manifest.addTool(options.toolId, options.version, allTracked, mergeEntries);
    await this.postInstallPipelineUseCase.execute({
      projectRoot: options.projectRoot,
      manifest: options.manifest,
    });
  }

  private async buildConfigFiles(
    options: InstallRuntimeConfigOptions
  ): Promise<InstallationFile[]> {
    const toolConfig = getToolConfig(options.toolId);
    if (!isAiTool(toolConfig) || !toolConfig.configOutputPaths) return [];
    const files: InstallationFile[] = [];
    for (const [fileName, configuredOutputPath] of Object.entries(toolConfig.configOutputPaths)) {
      const outputPath = await this.resolveConfigOutputPath(
        options.toolId,
        fileName,
        configuredOutputPath,
        options.projectRoot
      );
      const asset = this.assets.loadConfigAsset(options.toolId, fileName);
      const content = typeof asset === "string" ? asset : JSON.stringify(asset, null, 2);
      if (await this.isUserOwned(outputPath, options)) continue;
      files.push(
        new InstallationFile({ relativePath: outputPath, content, hash: this.hasher.hash(content) })
      );
    }
    return files;
  }

  private async resolveConfigOutputPath(
    toolId: AiToolId,
    fileName: string,
    configuredOutputPath: string,
    projectRoot: string
  ): Promise<string> {
    if (toolId !== "kilo" || fileName !== "kilo.json") return configuredOutputPath;
    const jsonPath = join(projectRoot, "kilo.json");
    const jsoncPath = join(projectRoot, "kilo.jsonc");
    const jsonExists = await this.fs.fileExists(jsonPath);
    const jsoncExists = await this.fs.fileExists(jsoncPath);
    if (jsonExists && jsoncExists) throw new KiloDualConfigError();
    return jsoncExists ? "kilo.jsonc" : configuredOutputPath;
  }

  private buildStaticSettingsFiles(options: InstallRuntimeConfigOptions): InstallationFile[] {
    const toolConfig = getToolConfig(options.toolId);
    if (!isAiTool(toolConfig)) return [];
    const caps = toolConfig.capabilities as Record<string, unknown>;
    const raw = caps.settings;
    const capabilities = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
    const result: InstallationFile[] = [];
    for (const cap of capabilities) {
      const file = this.buildStaticSettingsFile(cap, options);
      if (file !== null) result.push(file);
    }
    return result;
  }

  private buildStaticSettingsFile(
    cap: unknown,
    options: InstallRuntimeConfigOptions
  ): InstallationFile | null {
    if (!(cap instanceof SettingsCapability)) return null;
    const hasStaticForm =
      cap.staticContent !== undefined || cap.staticContentAssetFile !== undefined;
    if (!hasStaticForm) return null;
    if (cap.requiresTool && !options.manifest.hasTool(cap.requiresTool)) return null;
    const content = this.resolveStaticContent(cap, options.toolId);
    return new InstallationFile({
      relativePath: cap.buildOutputPath(),
      content,
      hash: this.hasher.hash(content),
      mergeStrategy: cap.getMergeStrategy(),
    });
  }

  private resolveStaticContent(cap: SettingsCapability, toolId: AiToolId): string {
    if (cap.staticContent !== undefined) return cap.staticContent;
    const asset = this.assets.loadConfigAsset(toolId, cap.staticContentAssetFile as string);
    return typeof asset === "string" ? asset : JSON.stringify(asset, null, 2);
  }

  private async isUserOwned(
    relativePath: string,
    options: InstallRuntimeConfigOptions
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
