import { homedir as nodeHomedir } from "node:os";
import { dirname, join } from "node:path";
import { NativePluginCliError, PluginNotFoundError } from "../../../../kernel/errors.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import { resolveHomeDir } from "../../../../kernel/reading/home-dir.js";
import type { MarketplaceScope } from "../../../../kernel/scope.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import type { McpCapability } from "../../../tools/domain/capabilities/mcp-capability.js";
import { unmergeOpencodeMcp } from "../../../tools/domain/formats/opencode-mcp-merge.js";
import type { HostPluginRegistryReader } from "../../../tools/domain/ports/host-plugin-registry-reader.js";
import type { NativePluginActivator } from "../../../tools/domain/ports/native-plugin-activator.js";
import {
  getToolConfig,
  isAiTool,
  nativeActivationOf,
  resolvePluginsCapability,
} from "../../../tools/domain/registry.js";
import type { Manifest } from "../../domain/manifest.js";
import type { InstalledPlugin } from "../../domain/plugins/installed-plugin.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import { resolveCacheCandidate } from "../shared/purge-declared-cache.js";
import { removeProjectHooks } from "../shared/remove-project-hooks.js";
import { resolveUninstallScopeOrder } from "../shared/resolve-uninstall-scope.js";
import { loadPluginManifest } from "./plugin-helpers.js";
import {
  isFrameworkPrimeFlatMcp,
  resolveBaseDirFromRecord,
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
     * `MarketplaceSyncSettingsUseCase` installs through (see runtime/wiring/framework.ts). */
    private readonly activators: ReadonlyMap<string, NativePluginActivator>,
    /** Host plugin registry readers keyed by `AiToolId`, the same map `CleanUseCase`
     * consults before uninstalling a ref — the scope asked for is the one the host
     * actually registered it at, never a guess. Absent for every caller that predates
     * this, which falls back to the manifest's own recorded scope. */
    private readonly hostPluginRegistries: ReadonlyMap<
      AiToolId,
      HostPluginRegistryReader
    > = new Map()
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
      const baseDir = resolveBaseDirFromRecord(plugin.scope, toolId, projectRoot, nodeHomedir);
      const confirmed = await this.removeNativeActivation(plugin, toolId, projectRoot);
      if (confirmed !== undefined)
        await this.purgeCachedPlugin(manifest, toolId, plugin, confirmed);
      await this.deletePluginFiles(plugin.files, baseDir);
      await this.removeMcpEntries(plugin, toolId, projectRoot);
      await removeProjectHooks(this.fs, pluginName, toolId, projectRoot);
      manifest.removePlugin(toolId, pluginName);
      removed = true;
    }
    return removed;
  }

  // The removal counterpart of MarketplaceSyncSettingsUseCase.activateTool: a tool declared
  // `nativeActivation` (Claude, Codex, Copilot) only loads a plugin once its own CLI registers
  // it in a user-global registry that install never wrote to directly — so removal must drive
  // the same CLI, not edit that registry file itself (see runtime/wiring/framework.ts and
  // contexts/tools/infrastructure/native-plugin-cli-adapter.ts). A plugin without a recorded
  // marketplace was never activated this way at install time either (mirrors
  // MarketplaceSyncSettingsUseCase.pluginRefsToEnable's `marketplace == null` skip), so there
  // is nothing to undo. Best-effort: a host that can't be reached must warn by name with what
  // is left behind, never fail the whole removal silently.
  //
  // Returns `undefined` when there was nothing to undo at all (no native activation, or
  // never activated this way) — `purgeCachedPlugin` then has nothing to gate on either,
  // since a plugin this CLI never asked a host to enable left no cache to purge. `true`
  // or `false` otherwise: whether the host's own CLI confirmed the uninstall.
  private async removeNativeActivation(
    plugin: InstalledPlugin,
    toolId: AiToolId,
    projectRoot: string
  ): Promise<boolean | undefined> {
    const nativeActivation = resolvePluginsCapability(toolId)?.nativeActivation;
    if (nativeActivation == null || plugin.marketplace === undefined) return undefined;
    const activator = this.activators.get(nativeActivation.binary);
    if (activator === undefined) return undefined;
    const ref = `${plugin.name}@${plugin.marketplace}`;
    return this.uninstallViaActivator(
      activator,
      nativeActivation.binary,
      ref,
      toolId,
      plugin.scope,
      projectRoot
    );
  }

  /**
   * Tries every scope `resolveUninstallScopeOrder` names, in order, stopping at the
   * first the host's own CLI accepts — a real `claude` binary refuses a
   * mismatched-scope uninstall outright, so a manifest whose recorded scope disagrees
   * with what was actually registered (the state a plugin enabled before scope
   * threading existed is still in) gets a second, corrective attempt rather than
   * silently leaving the entry behind.
   */
  private async uninstallViaActivator(
    activator: NativePluginActivator,
    binary: string,
    ref: string,
    toolId: AiToolId,
    manifestScope: MarketplaceScope,
    projectRoot: string
  ): Promise<boolean> {
    if (!activator.isAvailable()) {
      this.logger.warn(
        `${binary} CLI not found on PATH — '${ref}' was not uninstalled from ${binary}'s own plugin registry and may still be enabled there.`
      );
      return false;
    }
    const reader = this.hostPluginRegistries.get(toolId);
    const order = await resolveUninstallScopeOrder(reader, ref, projectRoot, manifestScope);
    let lastMessage = "";
    for (const scope of order) {
      try {
        activator.uninstallPlugin(ref, scope);
        return true;
      } catch (error) {
        if (!(error instanceof NativePluginCliError)) throw error;
        lastMessage = error.message;
      }
    }
    this.logger.warn(
      `${binary} plugin uninstall '${ref}' failed: ${lastMessage} — an entry for it may remain in ${binary}'s own plugin registry.`
    );
    return false;
  }

  /**
   * `cache/<hostName>/<plugin>/` under the same declared-root-plus-`realpath`-
   * containment whitelist `clean`'s own marketplace-level purge shares
   * (`cli/src/contexts/framework/application/shared/purge-declared-cache.ts`) — but never gated on emptiness the way that one is:
   * this directory holds exactly the content this removal is asking the host to
   * forget, not a leftover shell another project's install could still hold, so once
   * `confirmed` says the host's own CLI actually uninstalled the ref, the whole
   * subtree goes. `hostName` comes from this tool's own `NativeRegistrations`, keyed
   * by `plugin.marketplace` (this project's own alias) — never the alias itself,
   * which a host never learns (see `CleanUseCase.undoMarketplaceRegistration`).
   */
  private async purgeCachedPlugin(
    manifest: Manifest,
    toolId: AiToolId,
    plugin: InstalledPlugin,
    confirmed: boolean
  ): Promise<void> {
    if (plugin.marketplace === undefined) return;
    const cacheRoot = nativeActivationOf(toolId)?.pluginCacheDir?.(resolveHomeDir());
    if (cacheRoot === undefined) return;
    const hostName = manifest
      .getNativeRegistrations(toolId)
      ?.marketplaces.find((m) => m.alias === plugin.marketplace)?.hostName;
    if (hostName === undefined) return;
    const label = `${toolId}: cache for '${plugin.name}'`;
    const candidate = await resolveCacheCandidate(
      this.fs,
      this.logger,
      cacheRoot,
      join(hostName, plugin.name),
      label
    );
    if (candidate === null) return;
    if (!confirmed) {
      this.logger.warn(`${label} left in place, its own removal was not confirmed: ${candidate}`);
      return;
    }
    await this.fs.deleteDirectory(candidate);
    this.logger.info(`${label} purged: ${candidate}`);
  }

  private async removeMcpEntries(
    plugin: InstalledPlugin,
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
