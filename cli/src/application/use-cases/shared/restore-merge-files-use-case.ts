import { join } from "node:path";
import type { InstallationFile } from "../../../domain/models/file.js";
import {
  extractMergeEntries,
  type MergeFileEntry,
  type MergeStrategy,
} from "../../../domain/models/merge.js";
import type { FileMerger } from "../../../domain/ports/file-merger.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { Prompter } from "../../../domain/ports/prompter.js";
import { RestoreDriftEntriesUseCase } from "./restore-drift-entries-use-case.js";

interface MergeDriftEntry {
  relativePath: string;
  content: string;
  reason: "deleted" | "modified";
  mergeStrategy: MergeStrategy;
  sectionKey: string | null;
}

interface MergeFilesRestoreOptions {
  mergeFiles: readonly MergeFileEntry[];
  distMap: Map<string, InstallationFile>;
  projectRoot: string;
  force: boolean;
  interactive: boolean;
  fileFilter: ((p: string) => boolean) | null;
}

export interface MergeFilesRestoreResult {
  restored: string[];
  kept: string[];
  updatedMergeFiles: MergeFileEntry[];
}

export class RestoreMergeFilesUseCase {
  private readonly restoreDriftEntries: RestoreDriftEntriesUseCase;

  constructor(
    private readonly fs: FileReader & FileMerger,
    private readonly hasher: Hasher,
    prompter: Prompter
  ) {
    this.restoreDriftEntries = new RestoreDriftEntriesUseCase(prompter);
  }

  async execute(options: MergeFilesRestoreOptions): Promise<MergeFilesRestoreResult | null> {
    const mergeMap = new Map(options.mergeFiles.map((m) => [m.relativePath, m]));

    return this.restoreDriftEntries.execute(
      {
        collectDrift: () =>
          this.collectMergeDrift(
            options.mergeFiles,
            options.distMap,
            options.projectRoot,
            options.fileFilter
          ),
        restore: (entry) => this.applyOneMergeRestore(entry, options.projectRoot, mergeMap),
        buildResult: (restored, kept) => ({
          restored,
          kept,
          updatedMergeFiles: [...mergeMap.values()],
        }),
      },
      options.force,
      options.interactive
    );
  }

  private async collectMergeDrift(
    mergeFiles: readonly MergeFileEntry[],
    distMap: Map<string, InstallationFile>,
    projectRoot: string,
    fileFilter: ((p: string) => boolean) | null
  ): Promise<MergeDriftEntry[]> {
    const drift: MergeDriftEntry[] = [];
    for (const entry of mergeFiles) {
      if (fileFilter && !fileFilter(entry.relativePath)) continue;
      const distFile = distMap.get(entry.relativePath);
      if (!distFile || distFile.mergeStrategy === "none") continue;
      const driftEntry = await this.checkOneMergeFileDrift(entry, distFile, projectRoot);
      if (driftEntry) drift.push(driftEntry);
    }
    return drift;
  }

  private async checkOneMergeFileDrift(
    entry: MergeFileEntry,
    distFile: InstallationFile,
    projectRoot: string
  ): Promise<MergeDriftEntry | null> {
    const diskPath = join(projectRoot, entry.relativePath);
    if (!(await this.fs.fileExists(diskPath))) {
      return this.buildDriftEntry(entry, distFile, "deleted");
    }
    return this.checkModifiedDrift(diskPath, entry, distFile);
  }

  private async checkModifiedDrift(
    diskPath: string,
    entry: MergeFileEntry,
    distFile: InstallationFile
  ): Promise<MergeDriftEntry | null> {
    const diskContent = await this.fs.readFile(diskPath);
    const diskEntries = extractMergeEntries(diskContent, entry.sectionKey, this.hasher);
    const hasDrift = Object.keys(entry.entries).some(
      (key) => diskEntries[key]?.value !== entry.entries[key].value
    );
    if (!hasDrift) return null;
    return this.buildDriftEntry(entry, distFile, "modified");
  }

  private buildDriftEntry(
    entry: MergeFileEntry,
    distFile: InstallationFile,
    reason: MergeDriftEntry["reason"]
  ): MergeDriftEntry {
    return {
      relativePath: entry.relativePath,
      content: distFile.content,
      reason,
      mergeStrategy: distFile.mergeStrategy,
      sectionKey: entry.sectionKey,
    };
  }

  private async applyOneMergeRestore(
    entry: MergeDriftEntry,
    projectRoot: string,
    mergeMap: Map<string, MergeFileEntry>
  ): Promise<void> {
    const fullPath = join(projectRoot, entry.relativePath);
    await this.fs.mergeJsonFile(fullPath, entry.content, entry.mergeStrategy);
    const mergedContent = await this.fs.readFile(fullPath);
    const newEntries = extractMergeEntries(mergedContent, entry.sectionKey, this.hasher);
    mergeMap.set(entry.relativePath, {
      relativePath: entry.relativePath,
      sectionKey: entry.sectionKey,
      entries: newEntries,
    });
  }
}
