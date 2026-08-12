import { join } from "node:path";
import type { DoctorIssue } from "../../../domain/models/doctor.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import { extractMergeEntries, type MergeFileEntry } from "../../../domain/models/merge.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { Hasher } from "../../../domain/ports/hasher.js";

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
    // A merge file co-owned by two tools is still one file: report its absence once. Its keys
    // stay per-owner, because each tool tracks only the entries it wrote.
    const reportedMissing = new Set<string>();
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
      for (const mergeFile of manifest.getMergeFiles(toolId)) {
        issues.push(...(await this.checkOneMergeFile(mergeFile, projectRoot, reportedMissing)));
      }
    }
    return issues;
  }

  private async checkOneMergeFile(
    mergeFile: MergeFileEntry,
    projectRoot: string,
    reportedMissing: Set<string>
  ): Promise<DoctorIssue[]> {
    const fullPath = join(projectRoot, mergeFile.relativePath);
    if (!(await this.fs.fileExists(fullPath))) {
      if (reportedMissing.has(mergeFile.relativePath)) return [];
      reportedMissing.add(mergeFile.relativePath);
      return [
        {
          severity: "error",
          message: `Missing merge file: ${mergeFile.relativePath}`,
          fix: `Run \`aidd restore --force\` to reinstall tracked files.`,
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
          fix: `Run \`aidd restore --force\` to restore managed keys.`,
        });
      } else if (!diskHash.equals(manifestHash)) {
        issues.push({
          severity: "warning",
          message: `Modified key in ${mergeFile.relativePath} > ${key}`,
          fix: `Run \`aidd restore --force\` to restore the original value.`,
        });
      }
    }
    return issues;
  }
}
