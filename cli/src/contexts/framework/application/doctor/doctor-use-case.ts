import { ManifestValidationError, NoManifestError } from "../../../../kernel/errors.js";
import type { ToolCategory } from "../../../../kernel/tool.js";
import { toolIdsForCategory } from "../../../tools/domain/registry.js";
import type {
  DoctorIssue,
  DoctorReport,
  PluginIssueEntry,
  ToolHealth,
} from "../../domain/doctor.js";
import type { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { DoctorLayoutUseCase } from "./doctor-layout-use-case.js";
import type { DoctorMergeFilesUseCase } from "./doctor-merge-files-use-case.js";
import type { DoctorPluginUseCase } from "./doctor-plugin-use-case.js";
import type { DoctorReferencesUseCase } from "./doctor-references-use-case.js";
import type { DoctorRegistrationUseCase } from "./doctor-registration-use-case.js";
import type { DoctorTrackedFilesUseCase } from "./doctor-tracked-files-use-case.js";

export interface DoctorOptions {
  projectRoot: string;
  category?: ToolCategory;
  pluginName?: string;
}

export class DoctorUseCase {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly trackedFiles: DoctorTrackedFilesUseCase,
    private readonly mergeFiles: DoctorMergeFilesUseCase,
    private readonly plugin: DoctorPluginUseCase,
    private readonly references: DoctorReferencesUseCase,
    private readonly layout: DoctorLayoutUseCase,
    private readonly registration: DoctorRegistrationUseCase
  ) {}

  async execute(options: DoctorOptions): Promise<DoctorReport> {
    const { projectRoot, category, pluginName } = options;
    const manifest = await this.loadManifest();
    const allowedIds = category ? new Set(toolIdsForCategory(category) as readonly string[]) : null;
    const toolHealth = this.buildToolHealth(manifest, allowedIds);
    const issues = await this.collectIssues(manifest, projectRoot, allowedIds, category);
    const pluginIssues = await this.plugin.execute({
      manifest,
      projectRoot,
      allowedIds,
      pluginName,
    });
    return this.buildReport(toolHealth, issues, pluginIssues);
  }

  private async loadManifest(): Promise<Manifest> {
    let manifest: Manifest | null;
    try {
      manifest = await this.manifestRepo.load();
    } catch {
      throw new ManifestValidationError(
        "Manifest is corrupted (invalid JSON). Run `aidd clean --force` and re-initialize."
      );
    }
    if (manifest === null) throw new NoManifestError();
    return manifest;
  }

  private buildToolHealth(manifest: Manifest, allowedIds: Set<string> | null): ToolHealth[] {
    const toolHealth: ToolHealth[] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
      const files = manifest.getToolFiles(toolId);
      const mergeFiles = manifest.getMergeFiles(toolId);
      toolHealth.push({ toolId, fileCount: files.length, mergeFileCount: mergeFiles.length });
    }
    return toolHealth;
  }

  private async collectIssues(
    manifest: Manifest,
    projectRoot: string,
    allowedIds: Set<string> | null,
    category?: ToolCategory
  ): Promise<DoctorIssue[]> {
    const trackedFileList = this.trackedFiles.collectTrackedFiles(manifest, allowedIds);
    const issues = [
      ...(await this.trackedFiles.execute({ manifest, projectRoot, allowedIds })),
      ...(await this.mergeFiles.execute({ manifest, projectRoot, allowedIds })),
      ...(await this.references.execute({
        manifest,
        projectRoot,
        allowedIds,
        trackedFiles: trackedFileList,
      })),
      ...(await this.registration.execute({ manifest, projectRoot, allowedIds })),
    ];
    if (!category) issues.push(...(await this.layout.execute({ manifest, projectRoot })));
    return issues;
  }

  private buildReport(
    toolHealth: ToolHealth[],
    issues: DoctorIssue[],
    pluginIssues: PluginIssueEntry[]
  ): DoctorReport {
    return {
      healthy:
        issues.filter((i) => i.severity !== "info").length === 0 && pluginIssues.length === 0,
      toolHealth,
      issues,
      pluginIssues,
    };
  }
}
