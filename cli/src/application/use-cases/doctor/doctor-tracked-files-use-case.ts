import { join } from "node:path";
import type { DoctorIssue } from "../../../domain/models/doctor.js";
import type { Manifest, PathOwner } from "../../../domain/models/manifest.js";
import type { ToolId } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";

export interface DoctorTrackedFilesOptions {
  manifest: Manifest;
  projectRoot: string;
  allowedIds: Set<string> | null;
}

export class DoctorTrackedFilesUseCase {
  constructor(private readonly fs: FileReader) {}

  async execute(options: DoctorTrackedFilesOptions): Promise<DoctorIssue[]> {
    const { manifest, projectRoot, allowedIds } = options;
    const owned = this.collectOwnedPaths(manifest, allowedIds);
    const missingIssues = await this.checkMissingFiles([...owned.keys()], projectRoot);
    const modifiedIssues = await this.checkModifiedFiles(owned, projectRoot);
    return [...missingIssues, ...modifiedIssues];
  }

  /**
   * One entry per path rather than per tool-and-path pair. A co-owned path is one file on
   * disk, so it deserves one issue, not one per owner.
   */
  private collectOwnedPaths(
    manifest: Manifest,
    allowedIds: Set<string> | null
  ): Map<string, readonly PathOwner[]> {
    const owned = new Map<string, readonly PathOwner[]>();
    for (const [relativePath, owners] of manifest.getPathOwners()) {
      const relevant = owners.filter(
        (owner) => owner.kind === "tool" && (allowedIds === null || allowedIds.has(owner.toolId))
      );
      if (relevant.length > 0) owned.set(relativePath, relevant);
    }
    return owned;
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
    relativePaths: readonly string[],
    projectRoot: string
  ): Promise<DoctorIssue[]> {
    const issues: DoctorIssue[] = [];
    for (const relativePath of relativePaths) {
      const fullPath = join(projectRoot, relativePath);
      if (!(await this.fs.fileExists(fullPath))) {
        issues.push({
          severity: "error",
          message: `Missing tracked file: ${relativePath}`,
          fix: `Restore the file or run \`aidd restore\` to reinstall tracked files.`,
        });
      }
    }
    return issues;
  }

  private async checkModifiedFiles(
    owned: ReadonlyMap<string, readonly PathOwner[]>,
    projectRoot: string
  ): Promise<DoctorIssue[]> {
    const issues: DoctorIssue[] = [];
    for (const [relativePath, owners] of owned) {
      const fullPath = join(projectRoot, relativePath);
      if (!(await this.fs.fileExists(fullPath))) continue;
      const divergence = this.checkDivergence(relativePath, owners);
      if (divergence !== null) issues.push(divergence);
      const diskHash = await this.fs.readFileHash(fullPath);
      if (owners.some((owner) => owner.hash === diskHash.value)) continue;
      issues.push({
        severity: "warning",
        message: `Modified tracked file: ${relativePath}`,
        fix: `Run \`aidd restore --force\` to revert to the framework version.`,
      });
    }
    return issues;
  }

  /**
   * Two owners of one path expecting different bytes. Reported on its own rather than folded
   * into the modified-file issue: the file cannot satisfy both, and restoring it will not fix
   * the disagreement.
   */
  private checkDivergence(relativePath: string, owners: readonly PathOwner[]): DoctorIssue | null {
    const hashes = new Set(owners.map((owner) => owner.hash).filter((hash) => hash !== null));
    if (hashes.size < 2) return null;
    const claimants = owners.map((owner) => owner.toolId).join(", ");
    return {
      severity: "error",
      message: `Owners disagree on ${relativePath}: ${claimants} expect different content`,
      fix: `Reinstall the tools that share this path so they render it identically.`,
    };
  }
}
