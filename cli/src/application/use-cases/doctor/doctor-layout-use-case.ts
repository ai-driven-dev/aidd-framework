import { join } from "node:path";
import { AGENTS_SKILLS_PREFIX } from "../../../domain/formats/flat-paths.js";
import type { DoctorIssue } from "../../../domain/models/doctor.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { TokenProvider } from "../../../domain/ports/token-provider.js";
import { getAllRegisteredTools, hasToolSignals } from "../../../domain/tools/registry.js";

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
    const sharedTreeIssues = await this.checkOrphanedSharedTree(manifest, projectRoot);
    const authIssues = await this.checkAuth();
    return [...orphanIssues, ...sharedTreeIssues, ...authIssues];
  }

  /**
   * The shared skills tree belongs to no single tool's directory, so the orphan check above
   * cannot see it: it walks each registered tool's own directory. Left behind by the last
   * owner's removal, it would sit on disk forever, unreported.
   */
  private async checkOrphanedSharedTree(
    manifest: Manifest,
    projectRoot: string
  ): Promise<DoctorIssue[]> {
    if (!(await this.fs.fileExists(join(projectRoot, AGENTS_SKILLS_PREFIX)))) return [];
    const claimed = [...manifest.getPathOwners().keys()].some((path) =>
      path.startsWith(AGENTS_SKILLS_PREFIX)
    );
    if (claimed) return [];
    return [
      {
        severity: "warning",
        message: `Orphaned directory: ${AGENTS_SKILLS_PREFIX} (no installed tool claims it)`,
        fix: "Remove the directory manually, or reinstall a tool that renders skills there.",
      },
    ];
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
