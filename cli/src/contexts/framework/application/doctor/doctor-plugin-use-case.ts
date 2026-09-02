import type { PluginIssueEntry } from "../../domain/doctor.js";
import type { Manifest } from "../../domain/manifest.js";
import type { DetectPluginDriftUseCase } from "../shared/detect-plugin-drift-use-case.js";

export interface DoctorPluginOptions {
  manifest: Manifest;
  projectRoot: string;
  allowedIds: Set<string> | null;
  pluginName?: string;
}

export class DoctorPluginUseCase {
  constructor(private readonly detectPluginDrift: DetectPluginDriftUseCase) {}

  async execute(options: DoctorPluginOptions): Promise<PluginIssueEntry[]> {
    const { manifest, projectRoot, allowedIds, pluginName } = options;
    const toolIds = manifest
      .getInstalledToolIds()
      .filter((toolId) => allowedIds === null || allowedIds.has(toolId));
    const drifts = await this.detectPluginDrift.execute({
      manifest,
      projectRoot,
      toolIds,
      pluginName,
    });
    return drifts.flatMap((drift) =>
      drift.files.map((file) => ({
        toolId: drift.toolId,
        pluginName: drift.pluginName,
        issue: file.kind,
        filePath: file.relativePath,
      }))
    );
  }
}
