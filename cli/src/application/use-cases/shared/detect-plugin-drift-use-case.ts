// Called from use-cases/doctor and use-cases root (status-use-case.ts).
import { homedir } from "node:os";
import { join } from "node:path";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { AiToolId, ToolId } from "../../../kernel/tool.js";
import { resolvePluginBaseDir } from "../plugin/plugin-helpers.js";

export type PluginFileDriftKind = "missing" | "hash-mismatch";

export interface PluginFileDrift {
  relativePath: string;
  kind: PluginFileDriftKind;
}

export interface PluginDrift {
  toolId: AiToolId;
  pluginName: string;
  files: PluginFileDrift[];
}

export interface DetectPluginDriftOptions {
  manifest: Manifest;
  projectRoot: string;
  toolIds: Iterable<ToolId>;
  pluginName?: string;
}

/**
 * Single source of truth for "which of a plugin's installed files no longer match
 * the manifest". `status` and `doctor` both project this into their own shapes.
 */
export class DetectPluginDriftUseCase {
  constructor(private readonly fs: FileReader) {}

  async execute(options: DetectPluginDriftOptions): Promise<PluginDrift[]> {
    const { manifest, projectRoot, toolIds, pluginName } = options;
    const drifts: PluginDrift[] = [];
    for (const id of toolIds) {
      const toolId = id as AiToolId;
      const plugins = manifest.getPlugins(toolId);
      const targets = pluginName ? plugins.filter((p) => p.name === pluginName) : plugins;
      const baseDir = resolvePluginBaseDir(toolId, projectRoot, homedir);
      for (const plugin of targets) {
        const files = await this.driftedFiles(plugin.files, baseDir);
        if (files.length > 0) drifts.push({ toolId, pluginName: plugin.name, files });
      }
    }
    return drifts;
  }

  private async driftedFiles(
    files: ReadonlyMap<string, string>,
    baseDir: string
  ): Promise<PluginFileDrift[]> {
    const drifted: PluginFileDrift[] = [];
    for (const [relativePath, expectedHash] of files.entries()) {
      const fullPath = join(baseDir, relativePath);
      if (!(await this.fs.fileExists(fullPath))) {
        drifted.push({ relativePath, kind: "missing" });
        continue;
      }
      const diskHash = await this.fs.readFileHash(fullPath);
      if (diskHash.value !== expectedHash) {
        drifted.push({ relativePath, kind: "hash-mismatch" });
      }
    }
    return drifted;
  }
}
