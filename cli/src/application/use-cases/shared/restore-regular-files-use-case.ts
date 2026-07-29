import { join } from "node:path";
import { type FileHash, InstallationFile } from "../../../domain/models/file.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Prompter } from "../../../domain/ports/prompter.js";
import { RestoreDriftEntriesUseCase } from "./restore-drift-entries-use-case.js";

interface DriftEntry {
  relativePath: string;
  content: string;
  reason: "deleted" | "modified";
}

interface RegularFilesRestoreOptions {
  manifestFiles: ReadonlyArray<{ relativePath: string; hash: FileHash }>;
  distMap: Map<string, InstallationFile>;
  projectRoot: string;
  force: boolean;
  interactive: boolean;
  fileFilter: ((p: string) => boolean) | null;
}

export interface RegularFilesRestoreResult {
  restored: string[];
  kept: string[];
  updatedFiles: InstallationFile[];
}

export class RestoreRegularFilesUseCase {
  private readonly restoreDriftEntries: RestoreDriftEntriesUseCase;

  constructor(
    private readonly fs: FileReader & FileWriter,
    prompter: Prompter
  ) {
    this.restoreDriftEntries = new RestoreDriftEntriesUseCase(prompter);
  }

  async execute(options: RegularFilesRestoreOptions): Promise<RegularFilesRestoreResult | null> {
    const updatedHashMap = new Map(options.manifestFiles.map((f) => [f.relativePath, f.hash]));

    return this.restoreDriftEntries.execute(
      {
        collectDrift: () =>
          this.collectDrift(
            options.manifestFiles,
            options.distMap,
            options.projectRoot,
            options.fileFilter
          ),
        restore: async (entry) => {
          const diskPath = join(options.projectRoot, entry.relativePath);
          await this.fs.writeFile(diskPath, entry.content);
          updatedHashMap.set(entry.relativePath, await this.fs.readFileHash(diskPath));
        },
        buildResult: (restored, kept) => ({
          restored,
          kept,
          updatedFiles: Array.from(updatedHashMap.entries()).map(
            ([relativePath, hash]) => new InstallationFile({ relativePath, content: "", hash })
          ),
        }),
      },
      options.force,
      options.interactive
    );
  }

  private async collectDrift(
    manifestFiles: ReadonlyArray<{ relativePath: string; hash: { value: string } }>,
    distMap: Map<string, InstallationFile>,
    projectRoot: string,
    fileFilter: ((p: string) => boolean) | null
  ): Promise<DriftEntry[]> {
    const drift: DriftEntry[] = [];

    for (const manifestFile of manifestFiles) {
      if (fileFilter && !fileFilter(manifestFile.relativePath)) continue;

      const diskPath = join(projectRoot, manifestFile.relativePath);
      const diskExists = await this.fs.fileExists(diskPath);

      if (!diskExists) {
        const distFile = distMap.get(manifestFile.relativePath);
        if (distFile)
          drift.push({
            relativePath: manifestFile.relativePath,
            content: distFile.content,
            reason: "deleted",
          });
        continue;
      }

      const diskHash = await this.fs.readFileHash(diskPath);
      if (diskHash.value !== manifestFile.hash.value) {
        const distFile = distMap.get(manifestFile.relativePath);
        if (distFile)
          drift.push({
            relativePath: manifestFile.relativePath,
            content: distFile.content,
            reason: "modified",
          });
      }
    }

    return drift;
  }
}
