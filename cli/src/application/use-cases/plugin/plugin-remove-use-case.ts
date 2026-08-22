import { homedir as nodeHomedir } from "node:os";
import { dirname, join } from "node:path";
import type { McpCapability } from "../../../domain/capabilities/mcp-capability.js";
import { PluginNotFoundError } from "../../../domain/errors.js";
import {
  cursorProjectHooksScriptDir,
  unmergeCursorProjectHooksJson,
} from "../../../domain/formats/cursor-hooks-project-merge.js";
import { unmergeOpencodeMcp } from "../../../domain/formats/opencode-mcp-merge.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { Plugin } from "../../../domain/models/plugin.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import { getToolConfig, isAiTool } from "../../../domain/tools/registry.js";
import { loadPluginManifest } from "./plugin-file-sync.js";
import {
  isFrameworkPrimeFlatMcp,
  resolvePluginBaseDir,
  resolvePluginToolIds,
} from "./plugin-target-resolution.js";
import { resolvePluginsCapability } from "./translator/project-hooks-materializer.js";

export interface PluginRemoveOptions {
  pluginName: string;
  toolIds: AiToolId[] | "all";
  projectRoot: string;
}

export class PluginRemoveUseCase {
  constructor(
    private readonly fs: FileWriter & FileReader,
    private readonly manifestRepo: ManifestRepository
  ) {}

  async execute(options: PluginRemoveOptions): Promise<void> {
    const { pluginName, toolIds, projectRoot } = options;
    const manifest = await loadPluginManifest(this.manifestRepo);
    const resolvedToolIds = resolvePluginToolIds(toolIds, manifest);
    const removed = await this.removeFromTools(pluginName, resolvedToolIds, projectRoot, manifest);
    if (!removed) throw new PluginNotFoundError(pluginName);
    await this.manifestRepo.save(manifest);
  }

  private async removeFromTools(
    pluginName: string,
    toolIds: AiToolId[],
    projectRoot: string,
    manifest: Manifest
  ): Promise<boolean> {
    let removed = false;
    for (const toolId of toolIds) {
      const plugins = manifest.getPlugins(toolId);
      const plugin = plugins.find((p) => p.name === pluginName);
      if (plugin === undefined) continue;
      const baseDir = resolvePluginBaseDir(toolId, projectRoot, nodeHomedir);
      await this.deletePluginFiles(plugin.files, baseDir);
      await this.removeMcpEntries(plugin, toolId, projectRoot);
      await this.removeProjectHooks(pluginName, toolId, projectRoot);
      manifest.removePlugin(toolId, pluginName);
      removed = true;
    }
    return removed;
  }

  // The install-time counterpart of ProjectHooksMaterializer: a plugin whose hooks
  // were merged into the project's own .cursor/hooks.json (never tracked in
  // Plugin.files — see mode-b-flat-materialization-translator.ts) needs its own
  // unmerge, not a baseDir-relative file delete. Both destinations are recomputed
  // from pluginName alone, exactly as install computed them — no extra state to keep
  // in sync.
  private async removeProjectHooks(
    pluginName: string,
    toolId: AiToolId,
    projectRoot: string
  ): Promise<void> {
    if (resolvePluginsCapability(toolId)?.hooksDestination !== "project") return;
    const hooksPath = join(projectRoot, ".cursor", "hooks.json");
    const existing = await this.readExistingJson(hooksPath);
    if (existing !== null) {
      await this.fs.writeFile(hooksPath, unmergeCursorProjectHooksJson(existing, pluginName));
    }
    await this.fs.deleteDirectory(join(projectRoot, cursorProjectHooksScriptDir(pluginName)));
  }

  private async removeMcpEntries(
    plugin: Plugin,
    toolId: AiToolId,
    projectRoot: string
  ): Promise<void> {
    if (plugin.mcpEntries.size === 0) return;
    const toolConfig = getToolConfig(toolId);
    if (!isAiTool(toolConfig)) return;
    const caps = toolConfig.capabilities as Record<string, unknown>;
    if (!isFrameworkPrimeFlatMcp(caps)) return;
    const mcpCap = caps.mcp as McpCapability;
    const outputRelPath = await mcpCap.resolveOutput(projectRoot, this.fs);
    const outputPath = join(projectRoot, outputRelPath);
    const existing = await this.readExistingJson(outputPath);
    if (existing === null) return;
    const updated = unmergeOpencodeMcp(existing, plugin.mcpEntries);
    await this.fs.writeFile(outputPath, updated);
  }

  private async readExistingJson(path: string): Promise<string | null> {
    try {
      return await this.fs.readFile(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async deletePluginFiles(
    files: ReadonlyMap<string, string>,
    baseDir: string
  ): Promise<void> {
    for (const relativePath of files.keys()) {
      const fullPath = join(baseDir, relativePath);
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
    }
  }
}
