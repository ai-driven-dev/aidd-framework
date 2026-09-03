import { homedir as nodeHomedir } from "node:os";
import { dirname, join } from "node:path";
import type { McpCapability } from "../../../domain/capabilities/mcp-capability.js";
import { NativePluginCliError, PluginNotFoundError } from "../../../domain/errors.js";
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
import type { Logger } from "../../../domain/ports/logger.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { NativePluginActivator } from "../../../domain/ports/native-plugin-activator.js";
import {
  getToolConfig,
  isAiTool,
  resolvePluginsCapability,
} from "../../../domain/tools/registry.js";
import { loadPluginManifest } from "./plugin-file-sync.js";
import {
  isFrameworkPrimeFlatMcp,
  resolvePluginBaseDir,
  resolvePluginToolIds,
} from "./plugin-target-resolution.js";

export interface PluginRemoveOptions {
  pluginName: string;
  toolIds: AiToolId[] | "all";
  projectRoot: string;
}

export class PluginRemoveUseCase {
  constructor(
    private readonly fs: FileWriter & FileReader,
    private readonly manifestRepo: ManifestRepository,
    private readonly logger: Logger,
    /** Native plugin CLI activators keyed by `NativeActivation.binary`, mirroring the map
     * `MarketplaceSyncSettingsUseCase` installs through (see deps.ts). */
    private readonly activators: ReadonlyMap<string, NativePluginActivator>
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
      this.removeNativeActivation(plugin, toolId);
      await this.deletePluginFiles(plugin.files, baseDir);
      await this.removeMcpEntries(plugin, toolId, projectRoot);
      await this.removeProjectHooks(pluginName, toolId, projectRoot);
      manifest.removePlugin(toolId, pluginName);
      removed = true;
    }
    return removed;
  }

  // The removal counterpart of MarketplaceSyncSettingsUseCase.activateTool: a tool declared
  // `nativeActivation` (Claude, Codex, Copilot) only loads a plugin once its own CLI registers
  // it in a user-global registry that install never wrote to directly — so removal must drive
  // the same CLI, not edit that registry file itself (see deps.ts and the adapters under
  // infrastructure/adapters/*-cli-adapter.ts). A plugin without a recorded marketplace was
  // never activated this way at install time either (mirrors
  // MarketplaceSyncSettingsUseCase.pluginActivation's `marketplace == null` skip), so there is
  // nothing to undo. Best-effort: a host that can't be reached must warn by name with what is
  // left behind, never fail the whole removal silently.
  private removeNativeActivation(plugin: Plugin, toolId: AiToolId): void {
    const nativeActivation = resolvePluginsCapability(toolId)?.nativeActivation;
    if (nativeActivation == null || plugin.marketplace === undefined) return;
    const activator = this.activators.get(nativeActivation.binary);
    if (activator === undefined) return;
    const ref = `${plugin.name}@${plugin.marketplace}`;
    this.uninstallViaActivator(activator, nativeActivation.binary, ref);
  }

  private uninstallViaActivator(
    activator: NativePluginActivator,
    binary: string,
    ref: string
  ): void {
    if (!activator.isAvailable()) {
      this.logger.warn(
        `${binary} CLI not found on PATH — '${ref}' was not uninstalled from ${binary}'s own plugin registry and may still be enabled there.`
      );
      return;
    }
    try {
      activator.uninstallPlugin(ref);
    } catch (error) {
      if (!(error instanceof NativePluginCliError)) throw error;
      this.logger.warn(
        `${binary} plugin uninstall '${ref}' failed: ${error.message} — an entry for it may remain in ${binary}'s own plugin registry.`
      );
    }
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
