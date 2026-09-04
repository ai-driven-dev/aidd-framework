import { resolve } from "node:path";
import { NativePluginCliError } from "../../../../kernel/errors.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../../kernel/ports/hasher.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { ToolId } from "../../../../kernel/tool.js";
import type { Marketplace } from "../../../distribution/domain/marketplace.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";
import type { MarketplaceSettings } from "../../../tools/domain/marketplace-settings.js";
import type { NativePluginActivator } from "../../../tools/domain/ports/native-plugin-activator.js";
import { getToolConfig, isAiTool } from "../../../tools/domain/registry.js";
import type { FrameworkBuildTarget } from "../../../translate/domain/build-target.js";
import type { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { EnsureBuiltMarketplace } from "../shared/ensure-built-marketplace-use-case.js";

export interface MarketplaceSyncSettingsOptions {
  projectRoot: string;
}

export interface MarketplaceSyncSettingsResult {
  updatedTools: string[];
}

// Upserts local marketplace entries (absolute path may change); never removes entries; skips non-local if already present.
/** Syncing marketplace settings into the tools that read them, as its callers need it. */
export interface MarketplaceSyncSettings {
  execute(options: MarketplaceSyncSettingsOptions): Promise<MarketplaceSyncSettingsResult>;
}

export class MarketplaceSyncSettingsUseCase implements MarketplaceSyncSettings {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly marketplaceRegistry: MarketplaceRegistry,
    private readonly hasher: Hasher,
    private readonly logger: Logger,
    /** Native plugin CLI activators, keyed by the `binary` each profile declares. */
    private readonly activators: ReadonlyMap<string, NativePluginActivator>,
    private readonly ensureBuilt: EnsureBuiltMarketplace
  ) {}

  async execute(options: MarketplaceSyncSettingsOptions): Promise<MarketplaceSyncSettingsResult> {
    const { projectRoot } = options;
    const [manifest, marketplaces] = await Promise.all([
      this.manifestRepo.load().catch(() => null),
      this.marketplaceRegistry.list(projectRoot),
    ]);
    if (manifest === null || marketplaces.length === 0) return { updatedTools: [] };
    const updatedTools: string[] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      const updated = await this.syncTool(toolId, projectRoot, manifest, marketplaces);
      if (updated) updatedTools.push(toolId);
    }
    if (updatedTools.length > 0) await this.manifestRepo.save(manifest);
    await this.activateNativeTools(projectRoot, manifest, marketplaces);
    return { updatedTools };
  }

  private async activateNativeTools(
    projectRoot: string,
    manifest: Manifest,
    marketplaces: readonly Marketplace[]
  ): Promise<void> {
    for (const toolId of manifest.getInstalledToolIds()) {
      const binary = this.nativeActivationBinary(toolId);
      const activator = binary === undefined ? undefined : this.activators.get(binary);
      if (binary === undefined || activator === undefined) continue;
      await this.activateTool(toolId, binary, activator, projectRoot, manifest, marketplaces);
    }
  }

  private nativeActivationBinary(toolId: ToolId): string | undefined {
    const toolConfig = getToolConfig(toolId);
    if (toolConfig === undefined || !isAiTool(toolConfig)) return undefined;
    const caps = toolConfig.capabilities as {
      plugins?: { nativeActivation?: { binary: string } | null };
    };
    return caps.plugins?.nativeActivation?.binary ?? undefined;
  }

  private async activateTool(
    toolId: ToolId,
    binary: string,
    activator: NativePluginActivator,
    projectRoot: string,
    manifest: Manifest,
    marketplaces: readonly Marketplace[]
  ): Promise<void> {
    const refs = this.pluginRefsToEnable(toolId, manifest, marketplaces);
    // Every known marketplace, never only the ones a plugin points at — declaring a
    // marketplace and installing a plugin from it are two acts, and a person does the first
    // alone all the time. This used to narrow to the plugins' own marketplaces for a tool
    // that enables plugins through its CLI, on the reasoning that enabling teaches it the
    // marketplace; a smoke run against the real `claude` binary measured the consequence —
    // a project with two registered marketplaces and no plugin told it about neither.
    if (marketplaces.length === 0 && refs.length === 0) return;
    if (!activator.isAvailable()) {
      this.logger.warn(`${binary} CLI not found on PATH — skipping native plugin activation.`);
      return;
    }
    // Each step is independently best-effort: one failing plugin or marketplace
    // must warn and let the others through, never abort the whole activation.
    for (const marketplace of marketplaces)
      await this.registerMarketplace(activator, toolId, marketplace, projectRoot);
    if (!activator.enablesPlugins()) return;
    this.bestEffort(() => activator.upgradeMarketplaces(), "upgrade marketplaces");
    for (const ref of refs) {
      this.bestEffort(() => activator.enablePlugin(ref), `enable plugin '${ref}'`);
    }
  }

  private bestEffort(action: () => void, label: string): void {
    try {
      action();
    } catch (error) {
      if (!(error instanceof NativePluginCliError)) throw error;
      this.logger.warn(`Native plugin activation — ${label} skipped: ${error.message}`);
    }
  }

  /** The `<plugin>@<marketplace>` refs this tool's own CLI is asked to enable — every
   * recorded plugin whose marketplace this project still knows, and nothing else. Which
   * marketplaces get registered is a separate question, answered by the registry itself. */
  private pluginRefsToEnable(
    toolId: ToolId,
    manifest: Manifest,
    marketplaces: readonly Marketplace[]
  ): string[] {
    const byName = new Map(marketplaces.map((m) => [m.name, m]));
    const refs: string[] = [];
    for (const plugin of manifest.getPlugins(toolId)) {
      const marketplace = plugin.marketplace == null ? undefined : byName.get(plugin.marketplace);
      if (marketplace === undefined) continue;
      refs.push(`${plugin.name}@${marketplace.name}`);
    }
    return refs;
  }

  // Native tools must read the BUILT (transformed) tree, not the raw Claude-format
  // source.
  private async registerMarketplace(
    activator: NativePluginActivator,
    toolId: ToolId,
    marketplace: Marketplace,
    projectRoot: string
  ): Promise<void> {
    const builtDir = await this.buildForTool(toolId, marketplace, projectRoot);
    if (builtDir === null) return;
    try {
      activator.addMarketplace(builtDir, marketplace.scope);
    } catch (error) {
      if (!(error instanceof NativePluginCliError)) throw error;
      this.reclaimOrReport(activator, marketplace, builtDir, error);
    }
  }

  // `add` refused, which for a global registry means the name is already held. Whose
  // it is decides what may be done: a registration that still resolves belongs to a
  // project that is alive, and taking it would break that project — two projects would
  // otherwise steal the name from each other on every sync, uninstalling each other's
  // plugins. One whose source is gone belongs to nobody, and holding it hostage breaks
  // every project that comes after.
  private reclaimOrReport(
    activator: NativePluginActivator,
    marketplace: Marketplace,
    builtDir: string,
    addError: NativePluginCliError
  ): void {
    const name = marketplace.name;
    if (activator.registrationState(name) !== "dead") {
      this.logger.warn(
        `Native plugin activation — register marketplace '${name}' skipped: ${addError.message}`
      );
      return;
    }
    this.logger.warn(
      `Marketplace '${name}' was registered to a directory that no longer exists; re-registering it for this project. Plugins installed from it are removed and the ones this CLI manages are put back.`
    );
    this.bestEffort(
      () => activator.removeMarketplace(name, marketplace.scope, { force: true }),
      `unregister stale marketplace '${name}'`
    );
    this.bestEffort(
      () => activator.addMarketplace(builtDir, marketplace.scope),
      `register marketplace '${name}'`
    );
  }

  private async buildForTool(
    toolId: ToolId,
    marketplace: Marketplace,
    projectRoot: string
  ): Promise<string | null> {
    try {
      const { builtDir } = await this.ensureBuilt.execute({
        projectRoot,
        marketplace,
        target: toolId as FrameworkBuildTarget,
        mode: "marketplace",
      });
      return builtDir;
    } catch (error) {
      this.logger.warn(
        `Native plugin activation — build '${marketplace.name}' for ${toolId} skipped: ${(error as Error).message}`
      );
      return null;
    }
  }

  // Settings entries must reference the BUILT tree (claude reads plugins from it;
  // copilot surfaces them as recommendations) so settings match the native CLI install.
  /**
   * Builds every known marketplace for this tool. The registration that points at those
   * trees is written by the tool's own CLI, so nothing here needs the built paths back —
   * but the build has to happen either way, including on a machine where that CLI is
   * absent and activation stops short.
   */
  private async buildAllForTool(
    toolId: ToolId,
    marketplaces: readonly Marketplace[],
    projectRoot: string
  ): Promise<void> {
    for (const m of marketplaces) await this.buildForTool(toolId, m, projectRoot);
  }

  private async syncTool(
    toolId: ToolId,
    projectRoot: string,
    manifest: Manifest,
    marketplaces: readonly Marketplace[]
  ): Promise<boolean> {
    const toolConfig = getToolConfig(toolId);
    if (toolConfig === undefined || !isAiTool(toolConfig)) return false;
    const caps = toolConfig.capabilities as {
      plugins?: { marketplaceSettings: MarketplaceSettings | null };
    };
    if (!("plugins" in caps) || caps.plugins?.marketplaceSettings == null) return false;
    return this.syncToolSettings(
      toolId,
      projectRoot,
      manifest,
      marketplaces,
      caps.plugins.marketplaceSettings
    );
  }

  private async syncToolSettings(
    toolId: ToolId,
    projectRoot: string,
    manifest: Manifest,
    marketplaces: readonly Marketplace[],
    settings: MarketplaceSettings
  ): Promise<boolean> {
    const marketplaceChanged = await this.syncMarketplacesFile(
      toolId,
      projectRoot,
      manifest,
      settings,
      marketplaces
    );
    const pluginsChanged =
      settings.enabledPluginsKey != null
        ? await this.syncEnabledPluginsFile(toolId, projectRoot, manifest, marketplaces, settings)
        : false;
    return marketplaceChanged || pluginsChanged;
  }

  // The marketplaces key names built trees by absolute path, so a profile may send it
  // to a file of its own rather than the shared settings file. When it does, that file
  // is written but never hashed: recording an absolute path in the manifest would make
  // every other machine read as drift.
  private async syncMarketplacesFile(
    toolId: ToolId,
    projectRoot: string,
    manifest: Manifest,
    settings: MarketplaceSettings,
    marketplaces: readonly Marketplace[]
  ): Promise<boolean> {
    // Building the tree is this CLI's job whoever registers it: a tool that is not
    // installed today may be tomorrow, and the tree is what any registration points at.
    // So build first, unconditionally, and leave the registration itself to the tool.
    await this.buildAllForTool(toolId, marketplaces, projectRoot);
    return this.evictMarketplacesFromSharedFile(toolId, projectRoot, manifest, settings);
  }

  // An install made before the key moved left it in the shared, committed file, where
  // it keeps an absolute path that is wrong for everyone but its author. Take it out
  // and re-hash, so the move reaches projects that already exist.
  private async evictMarketplacesFromSharedFile(
    toolId: ToolId,
    projectRoot: string,
    manifest: Manifest,
    settings: MarketplaceSettings
  ): Promise<boolean> {
    const sharedPath = resolve(projectRoot, settings.settingsPath);
    const shared = await this.loadSettings(sharedPath);
    if (!(settings.settingsKey in shared)) return false;
    delete shared[settings.settingsKey];
    const content = JSON.stringify(shared, null, 2);
    await this.fs.writeFile(sharedPath, content);
    manifest.updateTrackedFileHash(toolId, settings.settingsPath, this.hasher.hash(content));
    return true;
  }

  private async syncEnabledPluginsFile(
    toolId: ToolId,
    projectRoot: string,
    manifest: Manifest,
    marketplaces: readonly Marketplace[],
    settings: MarketplaceSettings
  ): Promise<boolean> {
    const pluginsPath = resolve(projectRoot, settings.settingsPath);
    const json = await this.loadSettings(pluginsPath);
    if (!this.mergeEnabledPlugins(json, settings, toolId, manifest, marketplaces)) return false;
    const content = JSON.stringify(json, null, 2);
    await this.fs.writeFile(pluginsPath, content);
    manifest.updateTrackedFileHash(toolId, settings.settingsPath, this.hasher.hash(content));
    return true;
  }

  private mergeEnabledPlugins(
    json: Record<string, unknown>,
    settings: MarketplaceSettings,
    toolId: ToolId,
    manifest: Manifest,
    marketplaces: readonly Marketplace[]
  ): boolean {
    const pluginsKey = settings.enabledPluginsKey;
    if (pluginsKey == null) return false;
    const existing = this.existingRecord(json, pluginsKey);
    const toAdd: Record<string, boolean> = {};
    const marketplaceByName = new Map(marketplaces.map((m) => [m.name, m]));
    for (const plugin of manifest.getPlugins(toolId)) {
      if (plugin.marketplace == null) continue;
      const marketplace = marketplaceByName.get(plugin.marketplace);
      if (marketplace == null) continue;
      const entryKey = settings.toEntryKey({
        name: marketplace.name,
        source: marketplace.source,
      });
      if (entryKey == null) continue;
      const key = `${plugin.name}@${entryKey}`;
      if (!(key in existing)) toAdd[key] = true;
    }
    if (Object.keys(toAdd).length === 0) return false;
    json[pluginsKey] = { ...existing, ...toAdd };
    return true;
  }

  private existingRecord(
    json: Record<string, unknown>,
    settingsKey: string
  ): Record<string, unknown> {
    const raw = json[settingsKey];
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  // These files are co-owned: the tool writes them too, and the machine-local one is
  // untracked and gitignored, which is exactly the kind of file people hand-edit. A
  // trailing comma must not take the whole sync down with it — start from empty and
  // let the merge put back what belongs to this CLI.
  private async loadSettings(absPath: string): Promise<Record<string, unknown>> {
    if (!(await this.fs.fileExists(absPath))) return {};
    const content = await this.fs.readFile(absPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      this.logger.warn(`Ignoring malformed JSON in ${absPath}; rewriting the keys this CLI owns.`);
      return {};
    }
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  }
}
