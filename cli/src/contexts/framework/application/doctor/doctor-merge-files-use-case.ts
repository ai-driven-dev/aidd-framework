import { join } from "node:path";
import { extractMergeEntries, type MergeFileEntry } from "../../../../kernel/merge.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { Hasher } from "../../../../kernel/ports/hasher.js";
import type { DoctorIssue } from "../../domain/doctor.js";
import type { Manifest } from "../../domain/manifest.js";

export interface DoctorMergeFilesOptions {
  manifest: Manifest;
  projectRoot: string;
  allowedIds: Set<string> | null;
}

export class DoctorMergeFilesUseCase {
  constructor(
    private readonly fs: FileReader,
    private readonly hasher: Hasher
  ) {}

  async execute(options: DoctorMergeFilesOptions): Promise<DoctorIssue[]> {
    const { manifest, projectRoot, allowedIds } = options;
    const issues: DoctorIssue[] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
      for (const mergeFile of manifest.getMergeFiles(toolId)) {
        issues.push(...(await this.checkOneMergeFile(mergeFile, projectRoot)));
      }
    }
    return issues;
  }

  private async checkOneMergeFile(
    mergeFile: MergeFileEntry,
    projectRoot: string
  ): Promise<DoctorIssue[]> {
    const fullPath = join(projectRoot, mergeFile.relativePath);
    if (!(await this.fs.fileExists(fullPath))) {
      return [
        {
          severity: "error",
          message: `Missing merge file: ${mergeFile.relativePath}`,
          fix: `Run \`aidd sync --force\` to reinstall tracked files.`,
        },
      ];
    }
    return this.compareKeys(mergeFile, fullPath);
  }

  private async compareKeys(mergeFile: MergeFileEntry, fullPath: string): Promise<DoctorIssue[]> {
    const content = await this.fs.readFile(fullPath);
    const diskEntries = extractMergeEntries(content, mergeFile.sectionKey, this.hasher);
    const issues: DoctorIssue[] = [];
    for (const [key, manifestHash] of Object.entries(mergeFile.entries)) {
      const diskHash = diskEntries[key];
      if (!diskHash) {
        issues.push({
          severity: "error",
          message: `Missing key in ${mergeFile.relativePath} > ${key}`,
          fix: `Run \`aidd sync --force\` to restore managed keys.`,
        });
      } else if (!diskHash.equals(manifestHash)) {
        issues.push({
          severity: "warning",
          message: `Modified key in ${mergeFile.relativePath} > ${key}`,
          fix: `Run \`aidd sync --force\` to restore the original value.`,
        });
      }
    }
    return issues;
  }
}
