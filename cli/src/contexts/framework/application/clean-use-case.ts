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
import type { MarketplaceScope } from "../../../kernel/scope.js";
import type { AiToolId, ToolId } from "../../../kernel/tool.js";
import { isAiToolId } from "../../../kernel/tool.js";
import type { MarketplaceRegistry } from "../../distribution/domain/ports/marketplace-registry.js";
import type { HostMarketplaceRegistryReader } from "../../tools/domain/ports/host-marketplace-registry-reader.js";
import type { HostPluginRegistryReader } from "../../tools/domain/ports/host-plugin-registry-reader.js";
import type { NativePluginActivator } from "../../tools/domain/ports/native-plugin-activator.js";
import {
  machineLocalFilesOf,
  nativeActivationOf,
  projectHooksFileOf,
} from "../../tools/domain/registry.js";
import type { NativeRegistrations } from "../domain/manifest/native-registrations.js";
import type { Manifest } from "../domain/manifest.js";
import { aiddGitignoreEntries } from "../domain/manifest-gitignore-entries.js";
import type { InstalledPlugin } from "../domain/plugins/installed-plugin.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import type { UserSourceReferences } from "../domain/ports/user-source-references.js";
import type { GitignoreUseCase } from "./gitignore-use-case.js";
import { deletePluginFilesForTool } from "./plugin/plugin-helpers.js";
import { bestEffortNativeCall } from "./shared/best-effort-native-call.js";
import {
  purgeAllNativeCaches,
  type UndoneToolRegistrations,
} from "./shared/purge-native-marketplace-cache.js";
import { removeProjectHooks } from "./shared/remove-project-hooks.js";
import { resolveUninstallScopeOrder } from "./shared/resolve-uninstall-scope.js";
import {
  frameworkSourceIsShared,
  resolveProjectRootForReferences,
  toleratingUnreadableSourceReferences,
} from "./shared/shared-source-reference-support.js";
import { userScopeFilesSafeToDelete } from "./shared/user-scope-plugin-files.js";

/** What dropping this project's own reference to the shared source found — `undefined`
 * when there was nothing to drop (the port is absent, or this project's own registry
 * never held the shared entry). Threaded through the whole native-undo pass so every
 * tool's own "left registered" warning can report the same, already-computed count
 * rather than each recomputing (and each decrementing) it on its own. */
interface SharedSourceReferenceOutcome {
  readonly remainingCount: number;
}

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
  /** How many projects on this machine — this one included, nothing decremented yet —
   * currently reference the shared source, read the same way `--force` will right
   * before it drops this project's own claim. `undefined` when this project's own
   * registry never held the shared entry, or the port was never wired in. */
  sharedSourceReferenceCount?: number;
}

interface CleanResult {
  dryRun: boolean;
  manifestFound: boolean;
  preview: CleanPreview;
  fileCount: number;
}

/** What `undoNativeRegistrations` learned about one tool's registrations — the same
 * shape `purgeAllNativeCaches` (shared with `CleanUserScopeUseCase`) reads. */
type UndoneRegistration = UndoneToolRegistrations;

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
    private readonly homeDir: () => string = resolveHomeDir,
    /** The registry of projects referencing the shared machine-scope source. Absent for
     * every caller that predates this, which skips the decrement entirely. */
    private readonly userSourceReferences?: UserSourceReferences,
    /** Host plugin registry readers keyed by `AiToolId`, the same map
     * `DoctorRegistrationUseCase` reads — consulted before uninstalling a ref so the
     * scope asked for is the one the host actually registered it at, never a guess.
     * Absent for every caller that predates this, which falls back to the manifest's
     * own recorded scope (see `resolveUninstallScopeOrder`). */
    private readonly hostPluginRegistries: ReadonlyMap<
      AiToolId,
      HostPluginRegistryReader
    > = new Map()
  ) {}

  async execute(options: CleanOptions): Promise<CleanResult> {
    const manifest = await this.manifestRepo.load();
    if (manifest === null) {
      const emptyPreview: CleanPreview = { tools: [], totalFileCount: 0, nativeRegistrations: [] };
      return { dryRun: false, manifestFound: false, preview: emptyPreview, fileCount: 0 };
    }
    const home = this.homeDir();
    const preview = await this.buildPreview(manifest, home, options.projectRoot);
    const dryRunResult = await this.confirmOrDryRun(options, preview);
    if (dryRunResult !== null) return dryRunResult;
    // Decremented exactly once per run, before the per-tool loop below: the shared
    // source's reference count is a project-level fact, not a per-tool one, and claude,
    // codex and copilot can each carry their own `aidd-framework` ref — decrementing
    // inside that loop would drop this project's own claim once per tool instead of once.
    const sharedSourceOutcome = await this.dropSharedSourceReference(options.projectRoot);
    // Undoing a host's own registration must happen before any of the rest: the tool's
    // CLI resolves the marketplace name against the built tree this project recorded,
    // and that tree lives under .aidd/cache/ — which removeAiddState deletes next.
    // Deleting it first leaves the host's own registry pointing at a source that no
    // longer exists, which the host may then refuse to unregister at all.
    const undone = await this.undoNativeRegistrations(
      manifest,
      options.projectRoot,
      home,
      sharedSourceOutcome
    );
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
    home: string,
    sharedSourceOutcome: SharedSourceReferenceOutcome | undefined
  ): Promise<ReadonlyMap<ToolId, UndoneRegistration>> {
    const undone = new Map<ToolId, UndoneRegistration>();
    for (const toolId of manifest.getInstalledToolIds()) {
      const registrations = manifest.getNativeRegistrations(toolId);
      if (registrations === undefined) continue;
      const removedHostNames = await this.undoToolNativeRegistrations(
        manifest,
        toolId,
        registrations,
        projectRoot,
        home,
        sharedSourceOutcome
      );
      if (removedHostNames !== undefined) undone.set(toolId, { registrations, removedHostNames });
    }
    return undone;
  }

  private async undoToolNativeRegistrations(
    manifest: Manifest,
    toolId: ToolId,
    registrations: NativeRegistrations,
    projectRoot: string,
    home: string,
    sharedSourceOutcome: SharedSourceReferenceOutcome | undefined
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
      await this.uninstallPluginRef(
        activator,
        binary,
        toolId,
        ref,
        projectRoot,
        manifest,
        registrations
      );
    }
    const removedHostNames = new Set<string>();
    for (const { alias, hostName } of registrations.marketplaces) {
      const removed = await this.undoMarketplaceRegistration(
        activator,
        binary,
        alias,
        hostName,
        projectRoot,
        toolId,
        home,
        sharedSourceOutcome
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
    projectRoot: string,
    toolId: ToolId,
    home: string,
    sharedSourceOutcome: SharedSourceReferenceOutcome | undefined
  ): Promise<boolean> {
    const marketplaces = (await this.marketplaceRegistry?.list(projectRoot)) ?? [];
    const marketplace = marketplaces.find((m) => m.name === alias);
    if (marketplace === undefined) {
      this.logger.warn(
        `${binary}: '${alias}' is no longer a registered marketplace here, so its scope cannot be resolved — its ${binary} registration was left in place.`
      );
      return false;
    }
    if (marketplace.scope === "user") {
      // Machine-scope: every project on this machine shares this one registration, so
      // a single project's `clean` must never unregister it — doing so would silently
      // break every other project too. This project's own claim on it is dropped
      // separately, once per run (`dropSharedSourceReference`, its own plugin refs
      // already uninstalled just before this call) — the host's own registration is
      // left in place regardless of what that drop found.
      //
      // Three things survive this, not one: the host's own registration (named
      // above), the `userConfigDir()/marketplaces.json` entry
      // `MarketplaceRegisterFrameworkUseCase` wrote (this project's own registry
      // never held it to begin with, once machine-scope migration has run — nothing
      // here to delete), and this tool's own plugin cache — named by its absolute
      // path when this tool's profile declares one, the same fact
      // `describeSurvivingCachePaths` announces for a binary that is off `PATH`.
      this.logger.warn(
        `${binary}: '${hostName}' is shared by every project on this machine — left registered. ` +
          this.describeSharedSourceSurvival(toolId, hostName, home, sharedSourceOutcome)
      );
      return false;
    }
    return bestEffortNativeCall(
      this.logger,
      () => activator.removeMarketplace(hostName, marketplace.scope),
      `${binary} marketplace remove '${hostName}'`
    );
  }

  /** Decrements this project's own claim on the shared source exactly once per `clean`
   * run — independent of how many tools' own registrations name it, since the count in
   * `references.json` is per project, never per tool. Never reads a "current" CLI
   * version to decide which key to touch: `removeReference` finds the project wherever
   * it is recorded, so a self-update between the `sync` that wrote the reference and
   * this `clean` cannot strand it under a version key nobody ever asks about again.
   * `undefined` when the port was never wired in, or this project's own registry never
   * held the shared entry to begin with. */
  private async dropSharedSourceReference(
    projectRoot: string
  ): Promise<SharedSourceReferenceOutcome | undefined> {
    if (this.userSourceReferences === undefined) return undefined;
    const marketplaces = (await this.marketplaceRegistry?.list(projectRoot)) ?? [];
    const shared = marketplaces.find((m) => frameworkSourceIsShared(m.name, m.scope));
    if (shared === undefined) return undefined;
    const userSourceReferences = this.userSourceReferences;
    return toleratingUnreadableSourceReferences(this.logger, undefined, async () => {
      const resolvedRoot = await resolveProjectRootForReferences(this.fs, projectRoot);
      return userSourceReferences.removeReference(resolvedRoot);
    });
  }

  /** What survives a shared registration this run left in place, plus — once this
   * project's own reference has actually been dropped — either how many other projects
   * still claim it, or, once none do, that nothing removes it yet: purging the source
   * itself is a machine-scope decision, not this project's own `clean` to make. */
  private describeSharedSourceSurvival(
    toolId: ToolId,
    hostName: string,
    home: string,
    outcome: SharedSourceReferenceOutcome | undefined
  ): string {
    const base = `Its entry survives at userConfigDir()/marketplaces.json${this.describeSurvivingCachePath(toolId, hostName, home)}.`;
    if (outcome === undefined) return base;
    if (outcome.remainingCount > 0) {
      const plural = outcome.remainingCount === 1 ? "project" : "projects";
      return `${base} Still referenced by ${outcome.remainingCount} other ${plural} on this machine.`;
    }
    return `${base} No project on this machine still references it — nothing removes it yet, that is what a machine-scope \`aidd clean\` will do once it lands.`;
  }

  /** One marketplace's own surviving cache path, the single-`hostName` counterpart to
   * `describeSurvivingCachePaths` — empty for a tool whose profile declares no
   * `NativeActivation.pluginCacheDir` (copilot). */
  private describeSurvivingCachePath(toolId: ToolId, hostName: string, home: string): string {
    if (!isAiToolId(toolId)) return "";
    const cacheRoot = nativeActivationOf(toolId)?.pluginCacheDir?.(home);
    if (cacheRoot === undefined) return "";
    return `, and its cache at: ${join(cacheRoot, hostName)}`;
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

  /**
   * Uninstalls one plugin ref at the scope it was actually registered at — never a
   * default, and never the manifest's own recorded scope alone: `resolveUninstallScopeOrder`
   * asks the host's own registry first, and only falls back to the manifest's scope,
   * then the other one, when that registry has nothing to say. A real `claude` binary
   * refuses a mismatched-scope uninstall outright, so the fallback list is tried in
   * order until one succeeds; best-effort throughout, same as every other native undo
   * here — a plugin this run cannot get the host to forget is named, not thrown.
   */
  private async uninstallPluginRef(
    activator: NativePluginActivator,
    binary: string,
    toolId: ToolId,
    ref: string,
    projectRoot: string,
    manifest: Manifest,
    registrations: NativeRegistrations
  ): Promise<void> {
    const reader = isAiToolId(toolId) ? this.hostPluginRegistries.get(toolId) : undefined;
    const manifestScope = this.manifestScopeForRef(manifest, toolId, registrations, ref);
    const order = await resolveUninstallScopeOrder(reader, ref, projectRoot, manifestScope);
    let lastMessage = "";
    for (const scope of order) {
      try {
        activator.uninstallPlugin(ref, scope);
        return;
      } catch (error) {
        if (!(error instanceof NativePluginCliError)) throw error;
        lastMessage = error.message;
      }
    }
    this.logger.warn(`${binary} plugin uninstall '${ref}' failed: ${lastMessage}`);
  }

  /** The scope this project's own manifest recorded for the plugin behind `ref` —
   * `"project"` when nothing in the manifest names it, the same default `uninstallPlugin`
   * itself falls back to. `ref` is `<plugin>@<hostName>`, so matching it back to a
   * manifest entry (keyed by `plugin.marketplace`, this project's own alias) goes
   * through `registrations.marketplaces`, the one place both names are recorded
   * together (see `pluginRefsToEnable`'s own doc in `marketplace-sync-settings-use-case.ts`). */
  private manifestScopeForRef(
    manifest: Manifest,
    toolId: ToolId,
    registrations: NativeRegistrations,
    ref: string
  ): MarketplaceScope {
    for (const plugin of manifest.getPlugins(toolId)) {
      if (plugin.marketplace == null) continue;
      const hostName = registrations.marketplaces.find(
        (m) => m.alias === plugin.marketplace
      )?.hostName;
      if (hostName === undefined) continue;
      if (`${plugin.name}@${hostName}` === ref) return plugin.scope;
    }
    return "project";
  }

  // ── A host's own plugin cache, purged only under a declared, proven-safe path ──

  /** For every tool `undoNativeRegistrations` actually drove — never one whose binary
   * was absent, that map holds only the tools it ran for — purges the cache its profile
   * declares. Delegates to `purgeAllNativeCaches`, shared with `CleanUserScopeUseCase`. */
  private async purgeNativeCaches(
    home: string,
    undone: ReadonlyMap<ToolId, UndoneRegistration>
  ): Promise<void> {
    await purgeAllNativeCaches(this.fs, this.logger, home, this.hostMarketplaceRegistries, undone);
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

  private async buildPreview(
    manifest: Manifest,
    home: string,
    projectRoot: string
  ): Promise<CleanPreview> {
    const tools = manifest.getInstalledToolIds().map((toolId) => ({
      toolId,
      fileCount: manifest.getToolFiles(toolId).length + manifest.getMergeFiles(toolId).length,
    }));
    const totalFileCount = tools.reduce((s, t) => s + t.fileCount, 0);
    const nativeRegistrations = this.previewNativeRegistrations(manifest, home);
    const sharedSourceReferenceCount = await this.previewSharedSourceReferenceCount(projectRoot);
    return { tools, totalFileCount, nativeRegistrations, sharedSourceReferenceCount };
  }

  /** Read-only counterpart to `dropSharedSourceReference`: names the same count a
   * `--force` run is about to act on, without decrementing anything — a dry-run must
   * never write, and this project's own reference is still counted here since nothing
   * has dropped it yet. */
  private async previewSharedSourceReferenceCount(
    projectRoot: string
  ): Promise<number | undefined> {
    if (this.userSourceReferences === undefined) return undefined;
    const marketplaces = (await this.marketplaceRegistry?.list(projectRoot)) ?? [];
    const shared = marketplaces.find((m) => frameworkSourceIsShared(m.name, m.scope));
    if (shared === undefined) return undefined;
    const userSourceReferences = this.userSourceReferences;
    return toleratingUnreadableSourceReferences(this.logger, undefined, async () => {
      const resolvedRoot = await resolveProjectRootForReferences(this.fs, projectRoot);
      return userSourceReferences.countReferencesForProject(resolvedRoot);
    });
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

  /** For a project-scope plugin, every tracked file is safe: it lives under
   * `projectRoot`, which `clean` is already trusted with. A user-scope plugin's own
   * files are checked by `userScopeFilesSafeToDelete`, shared with
   * `CleanUserScopeUseCase` — see its own doc comment for why a raw path comparison
   * would miss both a `..` segment and a symlink escape. */
  private async filesSafeToDelete(
    plugin: InstalledPlugin,
    toolId: AiToolId
  ): Promise<ReadonlyMap<string, string>> {
    if (plugin.scope !== "user") return plugin.files;
    return userScopeFilesSafeToDelete(this.fs, this.logger, plugin, toolId, this.homeDir());
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
