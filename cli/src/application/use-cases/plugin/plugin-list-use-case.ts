import type { Manifest } from "../../../domain/models/manifest.js";
import type { Plugin } from "../../../domain/models/plugin.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import { loadPluginManifest } from "./plugin-file-sync.js";
import { resolvePluginToolIds } from "./plugin-target-resolution.js";

export interface PluginListOptions {
  toolIds: AiToolId[] | "all";
}

export type PluginListResult = Map<AiToolId, readonly Plugin[]>;

export class PluginListUseCase {
  constructor(private readonly manifestRepo: ManifestRepository) {}

  async execute(options: PluginListOptions): Promise<PluginListResult> {
    const manifest = await loadPluginManifest(this.manifestRepo);
    const resolvedToolIds = resolvePluginToolIds(options.toolIds, manifest);
    return this.buildResult(resolvedToolIds, manifest);
  }

  private buildResult(toolIds: AiToolId[], manifest: Manifest): PluginListResult {
    const result: PluginListResult = new Map();
    for (const toolId of toolIds) {
      result.set(toolId, manifest.getPlugins(toolId));
    }
    return result;
  }
}
