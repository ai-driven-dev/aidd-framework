import { dirname, join, normalize } from "node:path";
import {
  extractAtReferences,
  extractMarkdownLinkTargets,
  isFileReference,
} from "../../../../domain/formats/markdown-references.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { AiToolId, ToolId } from "../../../../kernel/tool.js";
import type { DoctorIssue } from "../../domain/doctor.js";
import type { Manifest } from "../../domain/manifest.js";

export interface DoctorReferencesOptions {
  manifest: Manifest;
  projectRoot: string;
  allowedIds: Set<string> | null;
  trackedFiles: { relativePath: string; toolId: ToolId | null }[];
}

export class DoctorReferencesUseCase {
  constructor(private readonly fs: FileReader) {}

  async execute(options: DoctorReferencesOptions): Promise<DoctorIssue[]> {
    const { manifest, projectRoot, allowedIds, trackedFiles } = options;
    const scanFiles = this.gatherAllMarkdownFiles(manifest, trackedFiles, allowedIds);
    return this.checkBrokenReferences(scanFiles, projectRoot);
  }

  gatherAllMarkdownFiles(
    manifest: Manifest,
    trackedFiles: { relativePath: string; toolId: ToolId | null }[],
    allowedIds: Set<string> | null
  ): { relativePath: string; toolId: ToolId | null }[] {
    const result = [...trackedFiles];
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
      for (const plugin of manifest.getPlugins(toolId as AiToolId)) {
        for (const relativePath of plugin.files.keys()) {
          result.push({ relativePath, toolId });
        }
      }
    }
    return result;
  }

  private async checkBrokenReferences(
    files: ReadonlyArray<{ relativePath: string; toolId: ToolId | null }>,
    projectRoot: string
  ): Promise<DoctorIssue[]> {
    const issues: DoctorIssue[] = [];
    for (const file of files) {
      if (!file.relativePath.match(/\.(md|mdc)$/)) continue;
      if (file.relativePath.includes("/tasks/")) continue;
      const fileIssues = await this.checkFileReferences(file.relativePath, projectRoot);
      issues.push(...fileIssues);
    }
    return issues;
  }

  private async checkFileReferences(
    relativePath: string,
    projectRoot: string
  ): Promise<DoctorIssue[]> {
    const fullPath = join(projectRoot, relativePath);
    if (!(await this.fs.fileExists(fullPath))) return [];
    const content = await this.fs.readFile(fullPath);
    const refs = this.extractAllRefs(content, relativePath, projectRoot);
    const issues: DoctorIssue[] = [];
    for (const { ref, resolvedPath } of refs) {
      if (!this.isWithinProjectRoot(resolvedPath, projectRoot)) continue;
      if (!(await this.fs.fileExists(resolvedPath))) {
        issues.push({
          severity: "warning",
          message: `Broken reference in ${relativePath}: "${ref}" not found on disk`,
          fix: `Restore the missing file or remove the reference in ${relativePath}`,
        });
      }
    }
    return issues;
  }

  private extractAllRefs(
    content: string,
    relativePath: string,
    projectRoot: string
  ): { ref: string; resolvedPath: string }[] {
    const atRefs = extractAtReferences(content)
      .filter(isFileReference)
      .map((ref) => ({ ref, resolvedPath: join(projectRoot, ref) }));
    const linkRefs = extractMarkdownLinkTargets(content)
      .filter(isFileReference)
      .map((ref) => ({
        ref,
        resolvedPath: normalize(join(projectRoot, dirname(relativePath), ref)),
      }));
    return [...atRefs, ...linkRefs];
  }

  private isWithinProjectRoot(resolvedPath: string, projectRoot: string): boolean {
    return normalize(resolvedPath).startsWith(normalize(projectRoot));
  }
}
