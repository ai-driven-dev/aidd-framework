import { resolve } from "node:path";
import type { MarketplaceSettings } from "../../../domain/capabilities/marketplace-settings.js";
import { NativePluginCliError } from "../../../domain/errors.js";
import type { FrameworkBuildTarget } from "../../../domain/models/framework-build.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { Marketplace } from "../../../domain/models/marketplace.js";
import { marketplaceCacheDir } from "../../../domain/models/paths.js";
import type { PluginSource } from "../../../domain/models/plugin-source.js";
import type { ToolId } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { MarketplaceRegistry } from "../../../domain/ports/marketplace-registry.js";
import type { NativePluginActivator } from "../../../domain/ports/native-plugin-activator.js";
import type { PluginCatalogRepository } from "../../../domain/ports/plugin-catalog-repository.js";
import { getToolConfig, isAiTool } from "../../../domain/tools/registry.js";
import type { EnsureBuiltMarketplaceUseCase } from "../shared/ensure-built-marketplace-use-case.js";

export interface MarketplaceSyncSettingsOptions {
  projectRoot: string;
}

export interface MarketplaceSyncSettingsResult {
  updatedTools: string[];
}

// Upserts local marketplace entries (absolute path may change); never removes entries; skips non-local if already present.
export class MarketplaceSyncSettingsUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly marketplaceRegistry: MarketplaceRegistry,
    private readonly catalogRepo: PluginCatalogRepository,
    private readonly hasher: Hasher,
    private readonly logger: Logger,
    /** Native plugin CLI activators keyed by `NativeActivation.binary` (e.g. "codex", "copilot"). */
    private readonly activators: ReadonlyMap<string, NativePluginActivator>,
    private readonly ensureBuilt: EnsureBuiltMarketplaceUseCase
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
    const { refs, marketplaces: used } = this.pluginActivation(toolId, manifest, marketplaces);
    if (refs.length === 0) return;
    if (!activator.isAvailable()) {
      this.logger.warn(`${binary} CLI not found on PATH — skipping native plugin activation.`);
      return;
    }
    // Each step is independently best-effort: one failing plugin or marketplace
    // must warn and let the others through, never abort the whole activation.
    for (const marketplace of used)
      await this.registerMarketplace(activator, toolId, marketplace, projectRoot);
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

  private pluginActivation(
    toolId: ToolId,
    manifest: Manifest,
    marketplaces: readonly Marketplace[]
  ): { refs: string[]; marketplaces: Marketplace[] } {
    const byName = new Map(marketplaces.map((m) => [m.name, m]));
    const refs: string[] = [];
    const used = new Map<string, Marketplace>();
    for (const plugin of manifest.getPlugins(toolId)) {
      const marketplace = plugin.marketplace == null ? undefined : byName.get(plugin.marketplace);
      if (marketplace === undefined) continue;
      refs.push(`${plugin.name}@${marketplace.name}`);
      used.set(marketplace.name, marketplace);
    }
    return { refs, marketplaces: [...used.values()] };
  }

  // Native tools must read the BUILT (transformed) tree, not the raw Claude-format
  // source. `add` is idempotent for a fresh or same-source registration; the CLI only
  // rejects it when the name is already registered from a DIFFERENT source (e.g. a
  // stale raw-source dir left by an older CLI). So add first, and only on that
  // conflict remove-then-re-add — never a pre-emptive remove that warns on every
  // clean install where there is nothing to unregister.
  private async registerMarketplace(
    activator: NativePluginActivator,
    toolId: ToolId,
    marketplace: Marketplace,
    projectRoot: string
  ): Promise<void> {
    const builtDir = await this.buildForTool(toolId, marketplace, projectRoot);
    if (builtDir === null) return;
    try {
      activator.addMarketplace(builtDir);
    } catch (error) {
      if (!(error instanceof NativePluginCliError)) throw error;
      this.reregisterFromDifferentSource(activator, marketplace.name, builtDir);
    }
  }

  // `add` failed: the name is likely registered from a different source, so swap
  // it in place. The remove is speculative — if `add` failed for another reason the
  // name may be absent, making a failed remove expected — so trace it at debug, not
  // warn. The re-add carries the real signal: it warns with the actual message when
  // this was not a recoverable conflict.
  private reregisterFromDifferentSource(
    activator: NativePluginActivator,
    name: string,
    builtDir: string
  ): void {
    try {
      activator.removeMarketplace(name);
    } catch (error) {
      if (!(error instanceof NativePluginCliError)) throw error;
      this.logger.debug(
        `marketplace '${name}' not unregistered before re-add (likely absent): ${error.message}`
      );
    }
    this.bestEffort(() => activator.addMarketplace(builtDir), `register marketplace '${name}'`);
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
  private async builtSourcesForTool(
    toolId: ToolId,
    marketplaces: readonly Marketplace[],
    projectRoot: string
  ): Promise<ReadonlyMap<string, PluginSource>> {
    const result = new Map<string, PluginSource>();
    for (const m of marketplaces) {
      const builtDir = await this.buildForTool(toolId, m, projectRoot);
      if (builtDir !== null) result.set(m.name, { kind: "local", path: builtDir });
    }
    return result;
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
    const versionByName = await this.loadAllVersions(projectRoot, marketplaces);
    const marketplaceChanged = await this.syncMarketplacesFile(
      toolId,
      projectRoot,
      manifest,
      settings,
      marketplaces,
      versionByName
    );
    const pluginsChanged =
      settings.enabledPluginsKey != null
        ? await this.syncEnabledPluginsFile(
            toolId,
            projectRoot,
            manifest,
            marketplaces,
            settings,
            versionByName
          )
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
    marketplaces: readonly Marketplace[],
    versionByName: Map<string, string | undefined>
  ): Promise<boolean> {
    if (settings.marketplacesSettingsPath === null) {
      // Nowhere to put them, so put them nowhere. The tool learns about its
      // marketplaces through its own CLI instead; see the profile for why.
      return this.evictMarketplacesFromSharedFile(toolId, projectRoot, manifest, settings);
    }
    const relativePath = settings.marketplacesSettingsPath ?? settings.settingsPath;
    const absPath = resolve(projectRoot, relativePath);
    const json = await this.loadSettings(absPath);
    const builtSources = await this.builtSourcesForTool(toolId, marketplaces, projectRoot);
    const merged = this.mergeMarketplaces(
      json,
      settings,
      marketplaces,
      versionByName,
      projectRoot,
      builtSources
    );
    const evicted = await this.evictMarketplacesFromSharedFile(
      toolId,
      projectRoot,
      manifest,
      settings
    );
    if (!merged) return evicted;
    const content = JSON.stringify(json, null, 2);
    await this.fs.writeFile(absPath, content);
    if (settings.marketplacesSettingsPath === undefined) {
      manifest.updateTrackedFileHash(toolId, settings.settingsPath, this.hasher.hash(content));
    }
    return true;
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
    if (settings.marketplacesSettingsPath === undefined) return false;
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
    settings: MarketplaceSettings,
    versionByName: Map<string, string | undefined>
  ): Promise<boolean> {
    const pluginsPath =
      settings.enabledPluginsSettingsPath ?? resolve(projectRoot, settings.settingsPath);
    const json = await this.loadSettings(pluginsPath);
    if (!this.mergeEnabledPlugins(json, settings, toolId, manifest, marketplaces, versionByName))
      return false;
    const content = JSON.stringify(json, null, 2);
    await this.fs.writeFile(pluginsPath, content);
    if (settings.enabledPluginsSettingsPath == null) {
      manifest.updateTrackedFileHash(toolId, settings.settingsPath, this.hasher.hash(content));
    }
    return true;
  }

  private mergeMarketplaces(
    json: Record<string, unknown>,
    settings: MarketplaceSettings,
    marketplaces: readonly Marketplace[],
    versionByName: Map<string, string | undefined>,
    projectRoot: string,
    builtSources: ReadonlyMap<string, PluginSource>
  ): boolean {
    if (settings.valueShape === "array") {
      return this.mergeMarketplacesArray(
        json,
        settings,
        marketplaces,
        versionByName,
        projectRoot,
        builtSources
      );
    }
    return this.mergeMarketplacesMap(
      json,
      settings,
      marketplaces,
      versionByName,
      projectRoot,
      builtSources
    );
  }

  private mergeMarketplacesArray(
    json: Record<string, unknown>,
    settings: MarketplaceSettings,
    marketplaces: readonly Marketplace[],
    versionByName: Map<string, string | undefined>,
    projectRoot: string,
    builtSources: ReadonlyMap<string, PluginSource>
  ): boolean {
    const existing = this.existingArray(json, settings.settingsKey);
    const toAdd: string[] = [];
    for (const m of marketplaces) {
      const source = this.resolveSourceForSettings(
        builtSources.get(m.name) ?? m.source,
        projectRoot
      );
      const entry = settings.toEntry({ name: m.name, source, version: versionByName.get(m.name) });
      if (entry === null || entry.valueShape !== "array") continue;
      if (!existing.includes(entry.value) && !toAdd.includes(entry.value)) {
        toAdd.push(entry.value);
      }
    }
    if (toAdd.length === 0) return false;
    json[settings.settingsKey] = [...existing, ...toAdd];
    return true;
  }

  private mergeMarketplacesMap(
    json: Record<string, unknown>,
    settings: MarketplaceSettings,
    marketplaces: readonly Marketplace[],
    versionByName: Map<string, string | undefined>,
    projectRoot: string,
    builtSources: ReadonlyMap<string, PluginSource>
  ): boolean {
    const existing = this.existingRecord(json, settings.settingsKey);
    const toMerge: Record<string, Record<string, unknown>> = {};
    for (const m of marketplaces) {
      const source = this.resolveSourceForSettings(
        builtSources.get(m.name) ?? m.source,
        projectRoot
      );
      const entry = settings.toEntry({ name: m.name, source, version: versionByName.get(m.name) });
      if (entry === null || entry.valueShape !== "map" || entry.key in toMerge) continue;
      if (
        entry.key in existing &&
        JSON.stringify(existing[entry.key]) === JSON.stringify(entry.value)
      ) {
        continue;
      }
      toMerge[entry.key] = entry.value;
    }
    if (Object.keys(toMerge).length === 0) return false;
    json[settings.settingsKey] = { ...existing, ...toMerge };
    return true;
  }

  private mergeEnabledPlugins(
    json: Record<string, unknown>,
    settings: MarketplaceSettings,
    toolId: ToolId,
    manifest: Manifest,
    marketplaces: readonly Marketplace[],
    versionByName: Map<string, string | undefined>
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
      const entry = settings.toEntry({
        name: marketplace.name,
        source: marketplace.source,
        version: versionByName.get(marketplace.name),
      });
      if (entry == null || entry.valueShape !== "map") continue;
      const key = `${plugin.name}@${entry.key}`;
      if (!(key in existing)) toAdd[key] = true;
    }
    if (Object.keys(toAdd).length === 0) return false;
    json[pluginsKey] = { ...existing, ...toAdd };
    return true;
  }

  private async loadAllVersions(
    projectRoot: string,
    marketplaces: readonly Marketplace[]
  ): Promise<Map<string, string | undefined>> {
    const entries = await Promise.all(
      marketplaces.map(async (m) => {
        const version = await this.loadCatalogVersion(projectRoot, m.name);
        return [m.name, version] as const;
      })
    );
    return new Map(entries);
  }

  private async loadCatalogVersion(
    projectRoot: string,
    marketplaceName: string
  ): Promise<string | undefined> {
    const cacheDir = marketplaceCacheDir(projectRoot, marketplaceName);
    const catalog = await this.catalogRepo.load(cacheDir).catch(() => null);
    return catalog?.version;
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

  private existingArray(json: Record<string, unknown>, settingsKey: string): string[] {
    const raw = json[settingsKey];
    if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
    return [];
  }

  private resolveSourceForSettings(source: PluginSource, projectRoot: string): PluginSource {
    if (source.kind !== "local") return source;
    return { kind: "local", path: resolve(projectRoot, source.path).replace(/\\/g, "/") };
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
