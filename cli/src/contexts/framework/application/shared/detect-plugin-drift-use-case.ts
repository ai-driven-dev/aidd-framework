import { homedir } from "node:os";
import { join } from "node:path";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { AiToolId, ToolId } from "../../../../kernel/tool.js";
import type { Manifest } from "../../domain/manifest.js";
import { resolveBaseDirFromRecord } from "../plugin/plugin-target-resolution.js";

export type PluginFileDriftKind = "missing" | "hash-mismatch";

export interface PluginFileDrift {
  relativePath: string;
  kind: PluginFileDriftKind;
}

export interface PluginDrift {
  toolId: AiToolId;
  pluginName: string;
  files: PluginFileDrift[];
  /**
   * True when every one of this plugin's tracked files is missing and the tool installs to a
   * user-scope directory rather than the project: a committed manifest describes that directory as
   * it stood on the machine that wrote it, and on any other it is unpopulated until `aidd sync`
   * runs — not the same fact as a project-scope file someone deleted. `files` stays empty, since
   * there is nothing to enumerate file by file.
   */
  notInstalledOnMachine: boolean;
}

export interface DetectPluginDriftOptions {
  manifest: Manifest;
  projectRoot: string;
  toolIds: Iterable<ToolId>;
  pluginName?: string;
}

/**
 * Single source of truth for "which of a plugin's installed files no longer match the manifest".
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
      for (const plugin of targets) {
        const baseDir = resolveBaseDirFromRecord(plugin.scope, toolId, projectRoot, homedir);
        const files = await this.driftedFiles(plugin.files, baseDir);
        if (files.length === 0) continue;
        const allMissing =
          files.length === plugin.files.size && files.every((f) => f.kind === "missing");
        if (allMissing && plugin.scope === "user") {
          drifts.push({ toolId, pluginName: plugin.name, files: [], notInstalledOnMachine: true });
        } else {
          drifts.push({ toolId, pluginName: plugin.name, files, notInstalledOnMachine: false });
        }
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
