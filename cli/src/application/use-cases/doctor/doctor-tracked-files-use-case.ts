import { join } from "node:path";
import type { DoctorIssue } from "../../../domain/models/doctor.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { ToolId } from "../../../kernel/tool.js";

export interface DoctorTrackedFilesOptions {
  manifest: Manifest;
  projectRoot: string;
  allowedIds: Set<string> | null;
}

export class DoctorTrackedFilesUseCase {
  constructor(private readonly fs: FileReader) {}

  async execute(options: DoctorTrackedFilesOptions): Promise<DoctorIssue[]> {
    const { manifest, projectRoot, allowedIds } = options;
    const trackedFiles = this.collectTrackedFiles(manifest, allowedIds);
    const missingIssues = await this.checkMissingFiles(trackedFiles, projectRoot);
    const modifiedIssues = await this.checkModifiedFiles(manifest, projectRoot, allowedIds);
    return [...missingIssues, ...modifiedIssues];
  }

  collectTrackedFiles(
    manifest: Manifest,
    allowedIds: Set<string> | null
  ): { relativePath: string; toolId: ToolId | null }[] {
    const result: { relativePath: string; toolId: ToolId | null }[] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
      const files = manifest.getToolFiles(toolId);
      result.push(...files.map((f) => ({ ...f, toolId })));
    }
    return result;
  }

  private async checkMissingFiles(
    files: ReadonlyArray<{ relativePath: string; toolId: ToolId | null }>,
    projectRoot: string
  ): Promise<DoctorIssue[]> {
    const issues: DoctorIssue[] = [];
    for (const file of files) {
      const fullPath = join(projectRoot, file.relativePath);
      if (!(await this.fs.fileExists(fullPath))) {
        issues.push({
          severity: "error",
          message: `Missing tracked file: ${file.relativePath}`,
          fix: `Restore the file or run \`aidd restore\` to reinstall tracked files.`,
        });
      }
    }
    return issues;
  }

  private async checkModifiedFiles(
    manifest: Manifest,
    projectRoot: string,
    allowedIds: Set<string> | null
  ): Promise<DoctorIssue[]> {
    const issues: DoctorIssue[] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
      for (const file of manifest.getToolFiles(toolId)) {
        const fullPath = join(projectRoot, file.relativePath);
        if (!(await this.fs.fileExists(fullPath))) continue;
        const diskHash = await this.fs.readFileHash(fullPath);
        if (!diskHash.equals(file.hash)) {
          issues.push({
            severity: "warning",
            message: `Modified tracked file: ${file.relativePath}`,
            fix: `Run \`aidd restore --force\` to revert to the framework version.`,
          });
        }
      }
    }
    return issues;
  }
}
