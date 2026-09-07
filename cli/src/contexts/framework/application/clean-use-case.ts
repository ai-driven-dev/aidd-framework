import { dirname, join } from "node:path";
import { NativePluginCliError } from "../../../kernel/errors.js";
import {
  isMergeContentEmpty,
  type MergeFileEntry,
  removeEntriesFromJson,
} from "../../../kernel/merge.js";
import {
  AIDD_CONFIG_FILENAME,
  AIDD_DIR,
  AIDD_MARKETPLACES_FILENAME,
  PLUGIN_CACHE_SUBDIR,
} from "../../../kernel/paths.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../kernel/ports/logger.js";
import type { Prompter } from "../../../kernel/ports/prompter.js";
import { resolveHomeDir } from "../../../kernel/reading/home-dir.js";
import type { AiToolId, ToolId } from "../../../kernel/tool.js";
import { isAiToolId } from "../../../kernel/tool.js";
import type { MarketplaceRegistry } from "../../distribution/domain/ports/marketplace-registry.js";
import type { HostMarketplaceRegistryReader } from "../../tools/domain/ports/host-marketplace-registry-reader.js";
import type { NativePluginActivator } from "../../tools/domain/ports/native-plugin-activator.js";
import {
  machineLocalFilesOf,
  nativeActivationOf,
  projectHooksFileOf,
  resolvePluginsCapability,
} from "../../tools/domain/registry.js";
import type { NativeRegistrations } from "../domain/manifest/native-registrations.js";
import type { Manifest } from "../domain/manifest.js";
import { aiddGitignoreEntries } from "../domain/manifest-gitignore-entries.js";
import type { InstalledPlugin } from "../domain/plugins/installed-plugin.js";
import { isStrictlyWithinUserScope } from "../domain/plugins/user-scope-containment.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import type { GitignoreUseCase } from "./gitignore-use-case.js";
import { deletePluginFilesForTool } from "./plugin/plugin-helpers.js";
import {
  purgeCacheIfEmptyAndConfirmed,
  resolveCacheCandidate,
} from "./shared/purge-declared-cache.js";
import { removeProjectHooks } from "./shared/remove-project-hooks.js";

interface CleanOptions {
  projectRoot: string;
  force: boolean;
  interactive?: boolean;
}

interface CleanPreview {
  tools: Array<{ toolId: ToolId; fileCount: number }>;
  totalFileCount: number;
  /** What a `--force` run will ask each tool's own CLI to undo — named ahead of time
   * because that step drives an external binary, the one part of `clean` this preview
   * cannot reduce to a file count. */
  nativeRegistrations: Array<{
    toolId: ToolId;
    binary: string;
    marketplaceCount: number;
    pluginRefCount: number;
    /** Absolute cache paths a `--force` run will attempt to purge, once undoing this
     * registration actually frees each name — empty for a tool whose profile declares
     * no `NativeActivation.pluginCacheDir`. A dry-run announcement, not a guarantee:
     * whether a path is still there to purge, and whether it turns out safe to, is
     * only known once the host's own CLI has actually run. */
    cachePaths: readonly string[];
  }>;
}

interface CleanResult {
  dryRun: boolean;
  manifestFound: boolean;
  preview: CleanPreview;
  fileCount: number;
}

/** What `undoNativeRegistrations` learned about one tool's registrations: the full
 * record the manifest carried, and which `hostName`s `removeMarketplace` itself
 * confirmed the host forgot — a strict subset of `registrations.marketplaces` whenever
 * the host refused one. See `purgeNativeCaches`. */
interface UndoneRegistration {
  registrations: NativeRegistrations;
  removedHostNames: ReadonlySet<string>;
}

export class CleanUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly logger: Logger,
    private readonly gitignoreUseCase: GitignoreUseCase,
    /** Native plugin CLI activators keyed by `NativeActivation.binary`, the same map
     * `MarketplaceSyncSettingsUseCase` and `PluginRemoveUseCase` install through (see
     * runtime/wiring/framework.ts). */
    private readonly activators: ReadonlyMap<string, NativePluginActivator> = new Map(),
    /** Resolves a registered marketplace's own scope, needed to undo a native
     * registration at the same scope it was added at (see `undoNativeRegistrations`). */
    private readonly marketplaceRegistry?: MarketplaceRegistry,
    private readonly prompter?: Prompter,
    /** Readers of a host's own marketplace registry, keyed by `AiToolId` — the same map
     * `MarketplaceSyncSettingsUseCase` reads, reused here as `purgeNativeCaches`'s own
     * post-condition. Absent for a tool whose profile declares no `marketplaceRegistry`
     * (codex): `purgeOneMarketplaceCache` then proves its leftover safe to remove by its
     * own emptiness instead of a registry read. Defaults to empty for every existing
     * caller that predates this guard. */
    private readonly hostMarketplaceRegistries: ReadonlyMap<
      AiToolId,
      HostMarketplaceRegistryReader
    > = new Map(),
    /** The one resolver for the OS home directory this use case ever calls —
     * `resolveHomeDir()` by default, never `os.homedir()` directly. `purgeNativeCaches`
     * composes its cache root from this, and `filesSafeToDelete` its user-scope
     * containment boundary: both must read the same `HOME` the caller's own
     * `hostMarketplaceRegistries` readers were built from (see
     * `host-marketplace-registry-reader-adapter.ts`), or a `HOME` override reaches one
     * half of a post-condition and not the other. */
    private readonly homeDir: () => string = resolveHomeDir
  ) {}

  async execute(options: CleanOptions): Promise<CleanResult> {
    const manifest = await this.manifestRepo.load();
    if (manifest === null) {
      const emptyPreview: CleanPreview = { tools: [], totalFileCount: 0, nativeRegistrations: [] };
      return { dryRun: false, manifestFound: false, preview: emptyPreview, fileCount: 0 };
    }
    const home = this.homeDir();
    const preview = this.buildPreview(manifest, home);
    const dryRunResult = await this.confirmOrDryRun(options, preview);
    if (dryRunResult !== null) return dryRunResult;
    // Undoing a host's own registration must happen before any of the rest: the tool's
    // CLI resolves the marketplace name against the built tree this project recorded,
    // and that tree lives under .aidd/cache/ — which removeAiddState deletes next.
    // Deleting it first leaves the host's own registry pointing at a source that no
    // longer exists, which the host may then refuse to unregister at all.
    const undone = await this.undoNativeRegistrations(manifest, options.projectRoot, home);
    // Purging a host's own plugin cache is the next step, never before this: it is only
    // ever safe once undoNativeRegistrations has actually asked that host to forget the
    // name (see purgeNativeCaches's own post-conditions).
    await this.purgeNativeCaches(home, undone);
    let deleted = await this.deleteAllToolFiles(manifest, options.projectRoot);
    deleted += await this.deleteMachineLocalFiles(manifest, options.projectRoot);
    await this.removeAiddState(options.projectRoot);
    // The same entries the pipeline added on install — clean must remove exactly what
    // was added, never a subset of it.
    await this.gitignoreUseCase.remove(options.projectRoot, aiddGitignoreEntries(manifest));
    return { dryRun: false, manifestFound: true, preview, fileCount: deleted };
  }

  // config.json is the committed telemetry switch: a file clean did not write,
  // so clean never removes it. Everything AIDD did write must go before the
  // emptiness check, or its own presence blocks a removal that should happen —
  // the registry `marketplace add` writes included, which is a file and was
  // missed while only the directories were listed.
  private async removeAiddState(projectRoot: string): Promise<void> {
    const aiddDir = join(projectRoot, AIDD_DIR);
    const configKept = await this.fs.fileExists(join(aiddDir, AIDD_CONFIG_FILENAME));

    await this.fs.deleteDirectory(join(aiddDir, "cache"));
    await this.fs.deleteDirectory(join(projectRoot, PLUGIN_CACHE_SUBDIR));
    await this.fs.deleteFile(join(aiddDir, AIDD_MARKETPLACES_FILENAME));
    await this.manifestRepo.delete();

    if (!(await this.fs.fileExists(aiddDir))) return;
    const remaining = await this.fs.listDirectory(aiddDir);
    if (remaining.length === 0) {
      await this.fs.deleteDirectory(aiddDir);
      return;
    }
    if (configKept) this.logger.info(`Kept ${AIDD_DIR}/${AIDD_CONFIG_FILENAME}`);
  }

  // ── Undoing a host's own registration ───────────────────────────────────────

  /** For every tool whose own CLI was asked to register something (`nativeRegistrations`
   * — absent for a tool with no `nativeActivation`, or one whose CLI never ran), drives
   * that same CLI to undo it. Never a direct edit of the host's own registry file: that
   * file is the host's to write, and `clean` has no more title to it than `plugin
   * remove` does.
   *
   * Returns, per tool the activator actually ran for — never one whose binary was
   * absent — both its full registrations and the `hostName`s `removeMarketplace`
   * itself confirmed removed. The two are not the same set: a marketplace ref the host
   * refused to drop is still in `registrations.marketplaces`, but absent from
   * `removedHostNames`, which is what `purgeNativeCaches`'s codex branch gates its own
   * purge on (see `purgeOneMarketplaceCache`). */
  private async undoNativeRegistrations(
    manifest: Manifest,
    projectRoot: string,
    home: string
  ): Promise<ReadonlyMap<ToolId, UndoneRegistration>> {
    const undone = new Map<ToolId, UndoneRegistration>();
    for (const toolId of manifest.getInstalledToolIds()) {
      const registrations = manifest.getNativeRegistrations(toolId);
      if (registrations === undefined) continue;
      const removedHostNames = await this.undoToolNativeRegistrations(
        toolId,
        registrations,
        projectRoot,
        home
      );
      if (removedHostNames !== undefined) undone.set(toolId, { registrations, removedHostNames });
    }
    return undone;
  }

  private async undoToolNativeRegistrations(
    toolId: ToolId,
    registrations: NativeRegistrations,
    projectRoot: string,
    home: string
  ): Promise<ReadonlySet<string> | undefined> {
    const { binary } = registrations;
    const activator = this.activators.get(binary);
    if (activator === undefined || !activator.isAvailable()) {
      this.logger.warn(
        `${binary}: registration left in place, the ${binary} CLI is not on the PATH.` +
          this.describeSurvivingCachePaths(toolId, registrations, home)
      );
      return undefined;
    }
    // Every plugin ref uninstalled before any marketplace is removed: only Copilot
    // declares `forceRemoveArgs`, so Claude and Codex can refuse to remove a
    // marketplace that still has plugins installed from it.
    for (const ref of registrations.pluginRefs) {
      this.bestEffort(() => activator.uninstallPlugin(ref), `${binary} plugin uninstall '${ref}'`);
    }
    const removedHostNames = new Set<string>();
    for (const { alias, hostName } of registrations.marketplaces) {
      const removed = await this.undoMarketplaceRegistration(
        activator,
        binary,
        alias,
        hostName,
        projectRoot
      );
      if (removed) removedHostNames.add(hostName);
    }
    return removedHostNames;
  }

  // `alias` resolves this project's own registry entry, the only place its `scope` is
  // recorded; `hostName` is what actually reaches the host's own CLI
  // (`claude plugin marketplace remove <hostName>`), since a host only ever knows a
  // registration by its catalog's own declared name, never by whatever local alias this
  // project chose for it. The two differ whenever a project registers a marketplace
  // under an alias its catalog does not declare itself under, a supported capability —
  // passing `alias` to the host-facing call here would ask it to remove a name it never
  // held.
  private async undoMarketplaceRegistration(
    activator: NativePluginActivator,
    binary: string,
    alias: string,
    hostName: string,
    projectRoot: string
  ): Promise<boolean> {
    const marketplaces = (await this.marketplaceRegistry?.list(projectRoot)) ?? [];
    const marketplace = marketplaces.find((m) => m.name === alias);
    if (marketplace === undefined) {
      this.logger.warn(
        `${binary}: '${alias}' is no longer a registered marketplace here, so its scope cannot be resolved — its ${binary} registration was left in place.`
      );
      return false;
    }
    return this.bestEffort(
      () => activator.removeMarketplace(hostName, marketplace.scope),
      `${binary} marketplace remove '${hostName}'`
    );
  }

  /** Named for the "not on the PATH" warning: `clean` never even reaches
   * `purgeNativeCaches` for a tool whose binary is absent, so the cache it would have
   * purged survives silently unless this names it too — the same absolute paths the
   * dry-run preview already announces (`previewNativeRegistrations`). Empty for a tool
   * whose profile declares no `NativeActivation.pluginCacheDir`. */
  private describeSurvivingCachePaths(
    toolId: ToolId,
    registrations: NativeRegistrations,
    home: string
  ): string {
    if (!isAiToolId(toolId)) return "";
    const cacheRoot = nativeActivationOf(toolId)?.pluginCacheDir?.(home);
    if (cacheRoot === undefined) return "";
    const paths = registrations.marketplaces.map((m) => join(cacheRoot, m.hostName));
    if (paths.length === 0) return "";
    return ` Its cache survives at: ${paths.join(", ")}.`;
  }

  /** Returns whether `action` actually ran to completion — `undoMarketplaceRegistration`
   * needs that answer, not just the swallowed exception, to know which `hostName`s a
   * cache purge may later trust as confirmed gone from the host. */
  private bestEffort(action: () => void, label: string): boolean {
    try {
      action();
      return true;
    } catch (error) {
      if (!(error instanceof NativePluginCliError)) throw error;
      this.logger.warn(`${label} failed: ${error.message}`);
      return false;
    }
  }

  // ── A host's own plugin cache, purged only under a declared, proven-safe path ──

  /** For every tool `undoNativeRegistrations` actually drove — never one whose binary
   * was absent, that map holds only the tools it ran for — purges the cache its profile
   * declares, one marketplace at a time. A tool whose profile declares no
   * `NativeActivation.pluginCacheDir` is not looked at: `clean` invents no cache path
   * for a tool that never named one. */
  private async purgeNativeCaches(
    home: string,
    undone: ReadonlyMap<ToolId, UndoneRegistration>
  ): Promise<void> {
    for (const [toolId, { registrations, removedHostNames }] of undone) {
      if (!isAiToolId(toolId)) continue;
      const cacheRoot = nativeActivationOf(toolId)?.pluginCacheDir?.(home);
      if (cacheRoot === undefined) continue;
      for (const { hostName } of registrations.marketplaces) {
        await this.purgeOneMarketplaceCache(
          toolId,
          registrations.binary,
          cacheRoot,
          hostName,
          removedHostNames.has(hostName)
        );
      }
    }
  }

  /**
   * `~/.claude/plugins/cache/<hostName>/` and its like are indexed by a name that is
   * global to the machine, not to this project — a name `clean` just watched its own
   * `undoMarketplaceRegistration` ask the host to forget, but that another project's
   * install of the same catalog could still hold. Containment alone
   * (`isStrictlyWithinUserScope`, both sides through `realpath`) proves the path cannot
   * escape the declared cache root; it does not prove this project still owns what sits
   * inside it. Two ways to prove that, one per declaration:
   *
   * - a profile declaring `marketplaceRegistry` (claude) is reread after the undo above:
   *   the name gone from that registry is the host's own admission nothing there
   *   resolves any more, and only then is the tree removed, in full;
   * - a profile declaring `pluginCacheDir` alone, no `marketplaceRegistry` (codex),
   *   drives a host that already deletes a marketplace's cached content on its own
   *   `plugin remove` — measured, it leaves only the now-empty directory shell behind.
   *   Its own emptiness is *one* of the two proofs there, cheaper than a registry this
   *   host offers no way to reread — but emptiness alone proves no data would be lost,
   *   never that this project is the one who emptied it. The other proof is
   *   `removed`: whether `removeMarketplace` itself confirmed the host actually forgot
   *   this `hostName` (see `undoToolNativeRegistrations`). Both are required.
   *
   * Either way, a path that fails containment, a registry that still names the tenant,
   * or a removal this run never confirmed is left in place and named — never removed
   * on the manifest's word alone.
   */
  private async purgeOneMarketplaceCache(
    toolId: AiToolId,
    binary: string,
    cacheRoot: string,
    hostName: string,
    removed: boolean
  ): Promise<void> {
    const candidate = await resolveCacheCandidate(
      this.fs,
      this.logger,
      cacheRoot,
      hostName,
      `${binary}: cache path for '${hostName}'`
    );
    if (candidate === null) return;
    const reader = this.hostMarketplaceRegistries.get(toolId);
    if (reader === undefined) {
      await purgeCacheIfEmptyAndConfirmed(
        this.fs,
        this.logger,
        candidate,
        removed,
        `${binary}: cache for '${hostName}'`
      );
      return;
    }
    await this.purgeOnceRegistryClears(reader, candidate, binary, hostName);
  }

  /**
   * Fail-closed: a purge happens on exactly two answers — the registry never existed
   * (`absent`, nothing was ever named there) or it exists and no longer names this
   * `hostName`. Anything else — still naming it, or the registry itself could not be
   * read or parsed (`unreadable`) — keeps the cache and names why, never guessing a
   * purge is safe from a reading this reader will not vouch for.
   */
  private async purgeOnceRegistryClears(
    reader: HostMarketplaceRegistryReader,
    candidate: string,
    binary: string,
    hostName: string
  ): Promise<void> {
    const reading = await reader.read();
    if (reading.absent === true) {
      await this.purgeCache(candidate, binary, hostName);
      return;
    }
    if (reading.entries !== undefined) {
      if (reading.entries.has(hostName)) {
        this.logger.warn(
          `${binary}: cache for '${hostName}' left in place, ${reading.location} still names it: ${candidate}`
        );
        return;
      }
      await this.purgeCache(candidate, binary, hostName);
      return;
    }
    this.logger.warn(
      `${binary}: plugin cache left in place, its registry could not be read: ${reading.location}`
    );
  }

  /** The one place `clean` actually deletes a cache directory, so the `--force` line
   * announcing it — the post-condition the dry-run's own "cache to purge once
   * unregistered" preview only forecasts — is printed from exactly one call site. */
  private async purgeCache(candidate: string, binary: string, hostName: string): Promise<void> {
    await this.fs.deleteDirectory(candidate);
    this.logger.info(`${binary}: cache for '${hostName}' purged: ${candidate}`);
  }

  // ── Machine-local files a tool's own materialization writes, outside the manifest ──

  /** The files a tool writes that `plugins[].files` never tracks: a machine-local
   * settings file (`.claude/settings.local.json`) and, for a tool merging a plugin's
   * hooks into its own project file (`.cursor/hooks.json`), the same unmerge `plugin
   * remove` already drives for one plugin at a time — extracted to
   * `cli/src/contexts/framework/application/shared/remove-project-hooks.ts` so both call
   * the one place that knows how. */
  private async deleteMachineLocalFiles(manifest: Manifest, projectRoot: string): Promise<number> {
    let count = 0;
    for (const toolId of manifest.getInstalledToolIds()) {
      count += await this.deleteMachineLocalSettingsFiles(toolId, projectRoot);
      count += await this.removeProjectHooksForTool(manifest, toolId, projectRoot);
    }
    return count;
  }

  private async deleteMachineLocalSettingsFiles(
    toolId: ToolId,
    projectRoot: string
  ): Promise<number> {
    let count = 0;
    for (const relativePath of machineLocalFilesOf(toolId)) {
      const fullPath = join(projectRoot, relativePath);
      if (!(await this.fs.fileExists(fullPath))) continue;
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
      count++;
    }
    return count;
  }

  private async removeProjectHooksForTool(
    manifest: Manifest,
    toolId: ToolId,
    projectRoot: string
  ): Promise<number> {
    if (projectHooksFileOf(toolId) === undefined || !isAiToolId(toolId)) return 0;
    let count = 0;
    for (const plugin of manifest.getPlugins(toolId)) {
      if (await removeProjectHooks(this.fs, plugin.name, toolId, projectRoot)) count++;
    }
    return count;
  }

  private buildPreview(manifest: Manifest, home: string): CleanPreview {
    const tools = manifest.getInstalledToolIds().map((toolId) => ({
      toolId,
      fileCount: manifest.getToolFiles(toolId).length + manifest.getMergeFiles(toolId).length,
    }));
    const totalFileCount = tools.reduce((s, t) => s + t.fileCount, 0);
    const nativeRegistrations = this.previewNativeRegistrations(manifest, home);
    return { tools, totalFileCount, nativeRegistrations };
  }

  private previewNativeRegistrations(
    manifest: Manifest,
    home: string
  ): CleanPreview["nativeRegistrations"] {
    const preview: CleanPreview["nativeRegistrations"] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      const registrations = manifest.getNativeRegistrations(toolId);
      if (registrations === undefined) continue;
      const cacheRoot = isAiToolId(toolId)
        ? nativeActivationOf(toolId)?.pluginCacheDir?.(home)
        : undefined;
      preview.push({
        toolId,
        binary: registrations.binary,
        marketplaceCount: registrations.marketplaces.length,
        pluginRefCount: registrations.pluginRefs.length,
        cachePaths:
          cacheRoot === undefined
            ? []
            : registrations.marketplaces.map((m) => join(cacheRoot, m.hostName)),
      });
    }
    return preview;
  }

  private async confirmOrDryRun(
    options: CleanOptions,
    preview: CleanPreview
  ): Promise<CleanResult | null> {
    if (options.force) return null;
    if (options.interactive && this.prompter) {
      const confirmed = await this.prompter.confirm("Remove all AIDD files?");
      if (!confirmed) return { dryRun: true, manifestFound: true, preview, fileCount: 0 };
      return null;
    }
    return { dryRun: true, manifestFound: true, preview, fileCount: 0 };
  }

  private async deleteAllToolFiles(manifest: Manifest, projectRoot: string): Promise<number> {
    let deleted = 0;
    for (const toolId of manifest.getInstalledToolIds()) {
      this.logger.info(`Removing ${toolId} files...`);
      deleted += await this.deleteFiles(manifest.getToolFiles(toolId), projectRoot);
      deleted += await this.cleanMergeFileKeys(manifest.getMergeFiles(toolId), projectRoot);
      if (isAiToolId(toolId)) {
        deleted += await this.deleteToolPluginFiles(manifest, toolId, projectRoot);
      }
    }
    return deleted;
  }

  private async deleteToolPluginFiles(
    manifest: Manifest,
    toolId: AiToolId,
    projectRoot: string
  ): Promise<number> {
    let count = 0;
    for (const plugin of manifest.getPlugins(toolId)) {
      const files = await this.filesSafeToDelete(plugin, toolId);
      const deleted = await deletePluginFilesForTool(
        files,
        plugin.scope,
        toolId,
        projectRoot,
        this.fs
      );
      count += deleted.length;
    }
    return count;
  }

  /**
   * For a project-scope plugin, every tracked file is safe: it lives under
   * `projectRoot`, which `clean` is already trusted with. For a user-scope plugin
   * (Cursor's `~/.cursor/plugins/local/<plugin>`), a file is safe only once its real,
   * resolved location — after every symlink and `..` segment is followed — still sits
   * strictly inside the tool's own declared user-scope directory. A `..` segment a
   * corrupted manifest entry carries, or a plugin directory that became a symlink after
   * install, both fail this and are left in place with a name and a reason rather than
   * silently deleted or silently kept.
   */
  private async filesSafeToDelete(
    plugin: InstalledPlugin,
    toolId: AiToolId
  ): Promise<ReadonlyMap<string, string>> {
    if (plugin.scope !== "user") return plugin.files;
    const boundary = resolvePluginsCapability(toolId)?.userPluginsBaseDir(this.homeDir());
    if (boundary === null || boundary === undefined) return new Map();
    const resolvedBoundary = await this.tryRealpath(boundary);
    if (resolvedBoundary === null) return new Map();
    const allowed = new Map<string, string>();
    for (const [relativePath, hash] of plugin.files) {
      const resolvedCandidate = await this.tryRealpath(join(boundary, relativePath));
      if (
        resolvedCandidate !== null &&
        isStrictlyWithinUserScope(resolvedCandidate, resolvedBoundary)
      ) {
        allowed.set(relativePath, hash);
        continue;
      }
      this.logger.warn(
        `${toolId}: '${plugin.name}' file '${relativePath}' does not resolve inside ${boundary}; left in place.`
      );
    }
    return allowed;
  }

  private async tryRealpath(path: string): Promise<string | null> {
    try {
      return await this.fs.realpath(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async cleanMergeFileKeys(
    mergeFiles: readonly MergeFileEntry[],
    projectRoot: string
  ): Promise<number> {
    let count = 0;
    for (const mergeFile of mergeFiles) {
      const fullPath = join(projectRoot, mergeFile.relativePath);
      if (!(await this.fs.fileExists(fullPath))) continue;
      await this.applyMergeFileCleaning(fullPath, mergeFile);
      count++;
    }
    return count;
  }

  private async applyMergeFileCleaning(fullPath: string, mergeFile: MergeFileEntry): Promise<void> {
    const keys = Object.keys(mergeFile.entries);
    if (keys.length === 0) {
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
      return;
    }
    const content = await this.fs.readFile(fullPath);
    const cleaned = removeEntriesFromJson(content, mergeFile.sectionKey, keys);
    if (isMergeContentEmpty(cleaned, mergeFile.sectionKey)) {
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
    } else {
      await this.fs.writeFile(fullPath, cleaned);
    }
  }

  private async deleteFiles(
    files: ReadonlyArray<{ relativePath: string }>,
    projectRoot: string
  ): Promise<number> {
    let count = 0;
    for (const file of files) {
      const fullPath = join(projectRoot, file.relativePath);
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
      count++;
    }
    return count;
  }
}
