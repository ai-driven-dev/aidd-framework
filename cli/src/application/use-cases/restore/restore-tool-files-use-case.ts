import { type FileHash, InstallationFile } from "../../../domain/models/file.js";
import type { FrameworkDescriptor } from "../../../domain/models/framework.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { MergeFileEntry } from "../../../domain/models/merge.js";
import type { ToolId } from "../../../domain/models/tool-ids.js";
import type { AssetProvider } from "../../../domain/ports/asset-provider.js";
import type { FileMerger } from "../../../domain/ports/file-merger.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { Platform } from "../../../domain/ports/platform.js";
import type { Prompter } from "../../../domain/ports/prompter.js";
import { getToolConfig } from "../../../domain/tools/registry.js";
import { GenerateToolDistributionUseCase } from "./generate-tool-distribution-use-case.js";
import { RestoreMergeFilesUseCase } from "./restore-merge-files-use-case.js";
import { RestoreRegularFilesUseCase } from "./restore-regular-files-use-case.js";

export interface RestoreToolFilesOptions {
  toolId: ToolId;
  manifest: Manifest;
  descriptor: FrameworkDescriptor;
  contentFiles: Map<string, string>;
  docsDir: string;
  projectRoot: string;
  version: string;
  force: boolean;
  interactive: boolean;
  fileFilter: ((p: string) => boolean) | null;
}

interface SectionRestoreResult {
  restored: string[];
  kept: string[];
  unrestorable: string[];
  updatedFiles: InstallationFile[];
}

interface MergeSectionRestoreResult {
  restored: string[];
  kept: string[];
  unrestorable: string[];
  updatedMergeFiles: MergeFileEntry[];
}

export interface RestoreToolFilesResult {
  toolId: ToolId;
  nothingToRestore: boolean;
  restored: string[];
  kept: string[];
  unrestorable: string[];
}

export class RestoreToolFilesUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter & FileMerger,
    private readonly hasher: Hasher,
    private readonly logger: Logger,
    private readonly platform: Platform,
    private readonly prompter: Prompter,
    private readonly assetProvider?: AssetProvider
  ) {}

  async execute(options: RestoreToolFilesOptions): Promise<RestoreToolFilesResult> {
    this.logger.info(`Checking ${options.toolId} for files to restore...`);
    const distMap = await this.buildDistributionMap(options);
    const section = await this.restoreSection(options, distMap);
    const mergeSection = await this.restoreMergeSection(options, distMap);
    if (section === null && mergeSection === null) {
      return {
        toolId: options.toolId,
        nothingToRestore: true,
        restored: [],
        kept: [],
        unrestorable: [],
      };
    }
    return this.commitToolRestore(options, section, mergeSection);
  }

  private async buildDistributionMap(
    options: RestoreToolFilesOptions
  ): Promise<Map<string, InstallationFile>> {
    const { toolId, descriptor, contentFiles, docsDir, projectRoot } = options;
    const config = getToolConfig(toolId);
    const distribution = await new GenerateToolDistributionUseCase(
      this.fs,
      this.hasher,
      this.platform,
      this.assetProvider
    ).execute({ config, descriptor, contentFiles, docsDir, projectRoot });
    return new Map(distribution.map((f) => [f.relativePath, f]));
  }

  private async restoreSection(
    options: RestoreToolFilesOptions,
    distMap: Map<string, InstallationFile>
  ): Promise<SectionRestoreResult | null> {
    return new RestoreRegularFilesUseCase(this.fs, this.prompter).execute({
      manifestFiles: options.manifest.getToolFiles(options.toolId),
      distMap,
      projectRoot: options.projectRoot,
      force: options.force,
      interactive: options.interactive,
      fileFilter: options.fileFilter,
    });
  }

  private async restoreMergeSection(
    options: RestoreToolFilesOptions,
    distMap: Map<string, InstallationFile>
  ): Promise<MergeSectionRestoreResult | null> {
    return new RestoreMergeFilesUseCase(this.fs, this.hasher, this.prompter).execute({
      mergeFiles: options.manifest.getMergeFiles(options.toolId),
      distMap,
      projectRoot: options.projectRoot,
      force: options.force,
      interactive: options.interactive,
      fileFilter: options.fileFilter,
    });
  }

  private commitToolRestore(
    options: RestoreToolFilesOptions,
    section: SectionRestoreResult | null,
    mergeSection: MergeSectionRestoreResult | null
  ): RestoreToolFilesResult {
    const { toolId, manifest, version } = options;
    const files =
      section?.updatedFiles ?? this.existingFilesAsGenerated(manifest.getToolFiles(toolId));
    const mergeFiles = mergeSection?.updatedMergeFiles ?? [...manifest.getMergeFiles(toolId)];
    manifest.addTool(toolId, manifest.getToolVersion(toolId) ?? version, files, mergeFiles);
    const restored = [...(section?.restored ?? []), ...(mergeSection?.restored ?? [])];
    const kept = [...(section?.kept ?? []), ...(mergeSection?.kept ?? [])];
    const unrestorable = [...(section?.unrestorable ?? []), ...(mergeSection?.unrestorable ?? [])];
    return { toolId, nothingToRestore: false, restored, kept, unrestorable };
  }

  private existingFilesAsGenerated(
    files: ReadonlyArray<{ relativePath: string; hash: FileHash }>
  ): InstallationFile[] {
    return files.map(
      (f) => new InstallationFile({ relativePath: f.relativePath, content: "", hash: f.hash })
    );
  }
}
