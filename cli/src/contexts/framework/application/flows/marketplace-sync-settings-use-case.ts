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
import { nativeActivationOf, resolvePluginsCapability } from "../../../tools/domain/registry.js";
import type { FrameworkBuildTarget } from "../../../translate/domain/build-target.js";
import type { NativeRegistrations } from "../../domain/manifest/native-registrations.js";
import type { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { EnsureBuiltMarketplace } from "../shared/ensure-built-marketplace-use-case.js";

export interface MarketplaceSyncSettingsOptions {
  projectRoot: string;
}

/** What one tool's own CLI actually registered, once its `activateTool` run finished —
 * the state `nativeRegistrations` records, and `doctor` later compares to the host's
 * real registry. */
interface ActivationOutcome {
  marketplaces: readonly string[];
  pluginRefs: readonly string[];
}

/** Syncing marketplace settings into the tools that read them, as its callers need it. */
export interface MarketplaceSyncSettings {
  execute(options: MarketplaceSyncSettingsOptions): Promise<void>;
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

  async execute(options: MarketplaceSyncSettingsOptions): Promise<void> {
    const { projectRoot } = options;
    const [manifest, marketplaces] = await Promise.all([
      this.manifestRepo.load().catch(() => null),
      this.marketplaceRegistry.list(projectRoot),
    ]);
    if (manifest === null || marketplaces.length === 0) return;
    let anyToolUpdated = false;
    for (const toolId of manifest.getInstalledToolIds()) {
      if (await this.syncTool(toolId, projectRoot, manifest, marketplaces)) anyToolUpdated = true;
    }
    if (anyToolUpdated) await this.manifestRepo.save(manifest);
    const activated = await this.activateNativeTools(projectRoot, manifest, marketplaces);
    const wroteHashes = await this.recordWhatActivationWrote(projectRoot, manifest, [
      ...activated.keys(),
    ]);
    const wroteRegistrations = this.recordNativeRegistrations(manifest, activated);
    if (wroteHashes || wroteRegistrations) await this.manifestRepo.save(manifest);
  }

  /** Answers the tools whose own CLI actually ran, keyed to what it was asked to
   * register — never every installed tool. A tool whose binary is absent, or that has
   * no native activation at all, wrote nothing, so a settings file that differs for it
   * differs because a person changed it. Blessing that as ours is the one thing this
   * must not do. */
  private async activateNativeTools(
    projectRoot: string,
    manifest: Manifest,
    marketplaces: readonly Marketplace[]
  ): Promise<ReadonlyMap<ToolId, ActivationOutcome>> {
    const activated = new Map<ToolId, ActivationOutcome>();
    for (const toolId of manifest.getInstalledToolIds()) {
      const binary = this.nativeActivationBinary(toolId);
      const activator = binary === undefined ? undefined : this.activators.get(binary);
      if (binary === undefined || activator === undefined) continue;
      const outcome = await this.activateTool(
        toolId,
        binary,
        activator,
        projectRoot,
        manifest,
        marketplaces
      );
      if (outcome !== null) activated.set(toolId, outcome);
    }
    return activated;
  }

  /** Writes the manifest's own record of what each tool's CLI was asked to register —
   * the state `doctor` later compares against the host's real registry, and `clean`
   * undoes through the same binary. Only for a tool this run actually activated: a
   * tool whose CLI never ran gets no `nativeRegistrations` write, the same rule
   * `recordWhatActivationWrote` already holds for the settings-file hash. */
  private recordNativeRegistrations(
    manifest: Manifest,
    activated: ReadonlyMap<ToolId, ActivationOutcome>
  ): boolean {
    let changed = false;
    for (const [toolId, outcome] of activated) {
      const binary = this.nativeActivationBinary(toolId);
      if (binary === undefined) continue;
      const registrations: NativeRegistrations = {
        binary,
        marketplaces: outcome.marketplaces,
        pluginRefs: outcome.pluginRefs,
      };
      const existing = manifest.getNativeRegistrations(toolId);
      if (nativeRegistrationsEqual(existing, registrations)) continue;
      manifest.setNativeRegistrations(toolId, registrations);
      changed = true;
    }
    return changed;
  }

  /**
   * The host's own CLI writes its registration into the very file `syncTool` had just
   * hashed — Claude Code declares one `settingsPath` for both marketplaces and enabled
   * plugins, so both halves land in `.claude/settings.json`. The tracked hash then described
   * content that no longer existed, and nothing re-read it: `status` and `doctor` reported
   * a file the person never touched as drifted for as long as the manifest stood, and
   * `restore` would have undone the host's own registration to reach a state AIDD held for
   * the length of one function.
   *
   * Re-read rather than re-derive, and only for a tool whose CLI actually ran: what is
   * stored is what is on disk after the write, which is the observation, not a guess at
   * what the host would have written.
   */
  private async recordWhatActivationWrote(
    projectRoot: string,
    manifest: Manifest,
    activated: readonly ToolId[]
  ): Promise<boolean> {
    let changed = false;
    for (const toolId of activated) {
      const settingsPath = this.marketplaceSettingsOf(toolId)?.settingsPath;
      if (settingsPath === undefined) continue;
      const tracked = manifest
        .getToolFiles(toolId)
        .find((file) => file.relativePath === settingsPath);
      if (tracked === undefined) continue;
      const content = await this.fs.readFile(resolve(projectRoot, settingsPath)).catch(() => null);
      if (content === null) continue;
      const hash = this.hasher.hash(content);
      if (hash.value === tracked.hash.value) continue;
      manifest.updateTrackedFileHash(toolId, settingsPath, hash);
      changed = true;
    }
    return changed;
  }

  private marketplaceSettingsOf(toolId: ToolId): MarketplaceSettings | undefined {
    return resolvePluginsCapability(toolId)?.marketplaceSettings ?? undefined;
  }

  private nativeActivationBinary(toolId: ToolId): string | undefined {
    return nativeActivationOf(toolId)?.binary;
  }

  /** Runs this tool's own CLI, returning what it was asked to register, or `null` when
   * the binary is not on PATH — the only case in which the settings file may have been
   * written by anything but this code, and in which nothing was actually registered. */
  private async activateTool(
    toolId: ToolId,
    binary: string,
    activator: NativePluginActivator,
    projectRoot: string,
    manifest: Manifest,
    marketplaces: readonly Marketplace[]
  ): Promise<ActivationOutcome | null> {
    if (!activator.isAvailable()) {
      this.logger.warn(`${binary} CLI not found on PATH — skipping native plugin activation.`);
      return null;
    }
    // Every known marketplace, never only the ones a plugin points at — declaring a
    // marketplace and installing a plugin from it are two acts, and a person does the first
    // alone all the time. This used to narrow to the plugins' own marketplaces for a tool
    // that enables plugins through its CLI, on the reasoning that enabling teaches it the
    // marketplace; a smoke run against the real `claude` binary measured the consequence —
    // a project with two registered marketplaces and no plugin told it about neither.
    // `execute` already returned early when `marketplaces` is empty (see above), so there
    // is nothing left to guard here.
    //
    // Each step is independently best-effort: one failing plugin or marketplace
    // must warn and let the others through, never abort the whole activation.
    for (const marketplace of marketplaces)
      await this.registerMarketplace(activator, toolId, marketplace, projectRoot);
    const registeredMarketplaces = marketplaces.map((m) => m.name);
    if (!activator.enablesPlugins())
      return { marketplaces: registeredMarketplaces, pluginRefs: [] };
    this.bestEffort(() => activator.upgradeMarketplaces(), "upgrade marketplaces");
    const refs = this.pluginRefsToEnable(toolId, manifest, marketplaces);
    for (const ref of refs) {
      this.bestEffort(() => activator.enablePlugin(ref), `enable plugin '${ref}'`);
    }
    return { marketplaces: registeredMarketplaces, pluginRefs: refs };
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
    const marketplaceSettings = resolvePluginsCapability(toolId)?.marketplaceSettings;
    if (marketplaceSettings == null) return false;
    return this.syncToolSettings(toolId, projectRoot, manifest, marketplaces, marketplaceSettings);
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

/** Whether two recorded registrations are the same fact, order included — both sides
 * are built from the same marketplace/plugin iteration order each run, so a real
 * difference is the only reason this returns false. Keeps a no-op sync from rewriting
 * the manifest on every run. */
function nativeRegistrationsEqual(
  a: NativeRegistrations | undefined,
  b: NativeRegistrations
): boolean {
  if (a === undefined) return false;
  return (
    a.binary === b.binary &&
    arraysEqual(a.marketplaces, b.marketplaces) &&
    arraysEqual(a.pluginRefs, b.pluginRefs)
  );
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
