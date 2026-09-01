import type { DoctorIssue } from "../../../domain/models/doctor.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { TokenProvider } from "../../../domain/ports/token-provider.js";
import { getAllRegisteredTools, hasToolSignals } from "../../../domain/tools/registry.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";

export interface DoctorLayoutOptions {
  manifest: Manifest;
  projectRoot: string;
}

export class DoctorLayoutUseCase {
  constructor(
    private readonly fs: FileReader,
    private readonly authReader?: TokenProvider
  ) {}

  async execute(options: DoctorLayoutOptions): Promise<DoctorIssue[]> {
    const { manifest, projectRoot } = options;
    const orphanIssues = await this.checkOrphanedDirectories(manifest, projectRoot);
    const authIssues = await this.checkAuth();
    return [...orphanIssues, ...authIssues];
  }

  private async checkOrphanedDirectories(
    manifest: Manifest,
    projectRoot: string
  ): Promise<DoctorIssue[]> {
    const issues: DoctorIssue[] = [];
    const installedToolDirs = manifest.getInstalledDirectories();
    for (const tool of getAllRegisteredTools().values()) {
      if ((await hasToolSignals(this.fs, tool, projectRoot)).length > 0) {
        if (!installedToolDirs.has(tool.directory)) {
          issues.push({
            severity: "warning",
            message: `Orphaned directory: ${tool.directory} (not tracked in manifest)`,
            fix: "Remove the directory manually, or run `aidd install <tool>` to track it.",
          });
        }
      }
    }
    return issues;
  }

  private async checkAuth(): Promise<DoctorIssue[]> {
    if (!this.authReader) return [];
    const token = await this.authReader.resolve();
    if (token === null) {
      return [
        {
          severity: "info",
          message: "Not authenticated",
          fix: "Run aidd auth login",
        },
      ];
    }
    return [];
  }
}
