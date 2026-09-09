import { join } from "node:path";
import { USER_SOURCE_REFERENCES_FILENAME, userBuiltCacheRoot } from "../../../../kernel/paths.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { Prompter } from "../../../../kernel/ports/prompter.js";
import { resolveHomeDir } from "../../../../kernel/reading/home-dir.js";
import { type AiToolId, isAiToolId, type ToolId } from "../../../../kernel/tool.js";
import { FRAMEWORK_MARKETPLACE_NAME } from "../../../distribution/domain/marketplace.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";
import type { HostMarketplaceRegistryReader } from "../../../tools/domain/ports/host-marketplace-registry-reader.js";
import type { NativePluginActivator } from "../../../tools/domain/ports/native-plugin-activator.js";
import { nativeActivationOf } from "../../../tools/domain/registry.js";
import type { NativeRegistrations } from "../../domain/manifest/native-registrations.js";
import type { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { UserSourceReferences } from "../../domain/ports/user-source-references.js";
import { deletePluginFilesForTool } from "../plugin/plugin-helpers.js";
import { bestEffortNativeCall } from "../shared/best-effort-native-call.js";
import { resolveCacheCandidate } from "../shared/purge-declared-cache.js";
import {
  purgeAllNativeCaches,
  type UndoneToolRegistrations,
} from "../shared/purge-native-marketplace-cache.js";
import {
  describeFullRemovalInstruction,
  toleratingUnreadableSourceReferences,
} from "../shared/shared-source-reference-support.js";
import { userScopeFilesSafeToDelete } from "../shared/user-scope-plugin-files.js";

export interface CleanUserScopeOptions {
  /** Threaded only to `MarketplaceRegistry.delete`, whose signature takes one for the
   * project-scope caller it usually serves — discarded by the adapter for scope `"user"`, since
   * this operation has no one project of its own. */
  projectRoot: string;
  force: boolean;
  interactive?: boolean;
}

export interface CleanUserScopePreview {
  toolIds: readonly ToolId[];
  /** Every version directory found under `userConfigDir()/cache/built/` — read structurally,
   * never trusted from any one tool's own manifest entry. */
  builtVersions: readonly string[];
  /** Every project on this machine that `references.json` still names, existing paths only. Empty
   * when the port was never wired in, or nothing else references the source. */
  referencingProjects: readonly string[];
}

export interface CleanUserScopeResult {
  dryRun: boolean;
  manifestFound: boolean;
  preview: CleanUserScopePreview;
}

/**
 * `aidd clean --scope user`: undoes the machine-scope registration and purges the shared source
 * itself, which a project-scope `clean` refuses to do for a registration every project shares.
 *
 * A user manifest is optional: an absent one skips the host-registration steps rather than guessing,
 * while the whitelist purge, reading nothing from the manifest, still runs. Order is a hard
 * constraint — every plugin ref uninstalled, then every marketplace unregistered, both through the
 * host's own CLI at scope `"user"`, before any cache is purged — and the whitelist resolves each
 * entry through `realpath` and containment, never `userConfigDir()` itself.
 */
export class CleanUserScopeUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly userManifestRepo: ManifestRepository,
    private readonly logger: Logger,
    private readonly marketplaceRegistry: MarketplaceRegistry,
    private readonly userConfigDir: () => string,
    /** Native plugin CLI activators keyed by `NativeActivation.binary`. */
    private readonly activators: ReadonlyMap<string, NativePluginActivator> = new Map(),
    /** Readers of a host's own marketplace registry, keyed by `AiToolId` —
     * `purgeAllNativeCaches`'s own post-condition. */
    private readonly hostMarketplaceRegistries: ReadonlyMap<
      AiToolId,
      HostMarketplaceRegistryReader
    > = new Map(),
    /** The one resolver for the OS home directory this use case ever calls. */
    private readonly homeDir: () => string = resolveHomeDir,
    /** Absent reports no referencing project at all rather than guessing one. */
    private readonly userSourceReferences?: UserSourceReferences,
    private readonly prompter?: Prompter
  ) {}

  async execute(options: CleanUserScopeOptions): Promise<CleanUserScopeResult> {
    const manifest = await this.userManifestRepo.load();
    const manifestFound = manifest !== null;
    const preview = await this.buildPreview(manifest);
    if (!manifestFound) this.logger.info(this.describeNoUserRegistration(preview));
    const dryRunResult = await this.confirmOrDryRun(options, preview, manifestFound);
    if (dryRunResult !== null) return dryRunResult;

    if (manifest !== null) {
      // Undoing a host's own registration must happen before any purge: a host's own CLI resolves
      // what it is unregistering against the built tree still on disk, and the purge below removes
      // exactly that tree. Absent a manifest there is nothing recorded to undo.
      const undone = await this.undoNativeRegistrations(manifest);
      await purgeAllNativeCaches(
        this.fs,
        this.logger,
        this.homeDir(),
        this.hostMarketplaceRegistries,
        undone
      );
      await this.purgeCursorUserScopeFiles(manifest, options.projectRoot);
    }
    await this.purgeWhitelistedMachineState(options.projectRoot);

    return { dryRun: false, manifestFound, preview };
  }

  private async buildPreview(manifest: Manifest | null): Promise<CleanUserScopePreview> {
    return {
      toolIds: manifest?.getInstalledToolIds() ?? [],
      builtVersions: await this.listBuiltVersions(),
      referencingProjects: await this.listReferencingProjects(),
    };
  }

  /** What a manifest-less run states plainly, in the logged output and in a non-`--force` run's
   * confirmation: no host registration exists to undo, and, when `references.json` still lists
   * other projects, that each must run its own `aidd clean` first — their hosts still resolve the
   * shared source this run is about to purge. */
  private describeNoUserRegistration(preview: CleanUserScopePreview): string {
    const base = "No host registration was undone: nothing was registered at user scope.";
    if (preview.referencingProjects.length === 0) return base;
    const projects = preview.referencingProjects.join(", ");
    return `${base} ${projects} still resolve the shared source through their own host; ${describeFullRemovalInstruction()}`;
  }

  private async listBuiltVersions(): Promise<readonly string[]> {
    const root = userBuiltCacheRoot(this.userConfigDir());
    let entries: string[];
    try {
      entries = await this.fs.listDirectory(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const versions = new Set<string>();
    for (const entry of entries) {
      const version = entry.split("/")[0];
      if (version) versions.add(version);
    }
    return [...versions].sort();
  }

  private async listReferencingProjects(): Promise<readonly string[]> {
    if (this.userSourceReferences === undefined) return [];
    const userSourceReferences = this.userSourceReferences;
    return toleratingUnreadableSourceReferences(this.logger, [], () =>
      userSourceReferences.listAllReferencingProjects()
    );
  }

  private async confirmOrDryRun(
    options: CleanUserScopeOptions,
    preview: CleanUserScopePreview,
    manifestFound: boolean
  ): Promise<CleanUserScopeResult | null> {
    if (options.force) return null;
    if (options.interactive && this.prompter) {
      const confirmed = await this.prompter.confirm(this.confirmationMessage(preview));
      if (!confirmed) return { dryRun: true, manifestFound, preview };
      return null;
    }
    return { dryRun: true, manifestFound, preview };
  }

  private confirmationMessage(preview: CleanUserScopePreview): string {
    const versions =
      preview.builtVersions.length > 0 ? preview.builtVersions.join(", ") : "none built yet";
    const projects =
      preview.referencingProjects.length > 0
        ? preview.referencingProjects.join(", ")
        : "no other project";
    return (
      `Remove the shared '${FRAMEWORK_MARKETPLACE_NAME}' source for this machine ` +
      `(versions: ${versions})? Still referenced by: ${projects}.`
    );
  }

  private async undoNativeRegistrations(
    manifest: Manifest
  ): Promise<ReadonlyMap<ToolId, UndoneToolRegistrations>> {
    const undone = new Map<ToolId, UndoneToolRegistrations>();
    for (const toolId of manifest.getInstalledToolIds()) {
      const registrations = manifest.getNativeRegistrations(toolId);
      if (registrations === undefined) continue;
      const removedHostNames = await this.undoToolNativeRegistrations(toolId, registrations);
      if (removedHostNames !== undefined) undone.set(toolId, { registrations, removedHostNames });
    }
    return undone;
  }

  private async undoToolNativeRegistrations(
    toolId: ToolId,
    registrations: NativeRegistrations
  ): Promise<ReadonlySet<string> | undefined> {
    const { binary } = registrations;
    const activator = this.activators.get(binary);
    if (activator === undefined || !activator.isAvailable()) {
      this.logger.warn(this.describeBinaryAbsent(toolId, registrations));
      return undefined;
    }
    for (const ref of registrations.pluginRefs) {
      bestEffortNativeCall(
        this.logger,
        () => activator.uninstallPlugin(ref, "user"),
        `${binary} plugin uninstall '${ref}'`
      );
    }
    const removedHostNames = new Set<string>();
    for (const { hostName } of registrations.marketplaces) {
      const removed = bestEffortNativeCall(
        this.logger,
        () => activator.removeMarketplace(hostName, "user"),
        `${binary} marketplace remove '${hostName}'`
      );
      if (removed) removedHostNames.add(hostName);
    }
    return removedHostNames;
  }

  /** Named so a binary this run cannot reach still tells a person what it left standing — the
   * marketplace and plugin-ref counts, plus this tool's own cache path when its profile declares
   * one. */
  private describeBinaryAbsent(toolId: ToolId, registrations: NativeRegistrations): string {
    const { binary } = registrations;
    const base =
      `${binary}: registration left in place, the ${binary} CLI is not on the PATH. ` +
      `It would have unregistered ${registrations.marketplaces.length} marketplace(s) ` +
      `and ${registrations.pluginRefs.length} plugin ref(s).`;
    if (!isAiToolId(toolId)) return base;
    const cacheRoot = nativeActivationOf(toolId)?.pluginCacheDir?.(this.homeDir());
    if (cacheRoot === undefined) return base;
    const paths = registrations.marketplaces.map((m) => join(cacheRoot, m.hostName));
    if (paths.length === 0) return base;
    return `${base} Its cache survives at: ${paths.join(", ")}.`;
  }

  /** The one tree this whitelist purges outside `userConfigDir()` itself: a user-scope plugin's
   * own files, listed by the user manifest and never deleted without `userScopeFilesSafeToDelete`'s
   * `realpath` + containment check — a `..` segment a corrupted entry carries, or a plugin
   * directory that became a symlink after install, is left in place and named. */
  private async purgeCursorUserScopeFiles(manifest: Manifest, projectRoot: string): Promise<void> {
    for (const toolId of manifest.getInstalledToolIds()) {
      if (!isAiToolId(toolId)) continue;
      for (const plugin of manifest.getPlugins(toolId)) {
        if (plugin.scope !== "user") continue;
        const files = await userScopeFilesSafeToDelete(
          this.fs,
          this.logger,
          plugin,
          toolId,
          this.homeDir()
        );
        await deletePluginFilesForTool(files, plugin.scope, toolId, projectRoot, this.fs);
      }
    }
  }

  private async purgeWhitelistedMachineState(projectRoot: string): Promise<void> {
    await this.purgeWhitelistedPath("cache/built", "cache/built", (candidate) =>
      this.fs.deleteDirectory(candidate)
    );
    // The self-update check cache, written into the same `cache/` directory by any online
    // command: left behind it keeps the shell below non-empty, the one occupant that made
    // "leaves nothing of aidd's on the machine" false in the ordinary case.
    await this.purgeWhitelistedPath(
      "cache/update-check.json",
      "cache/update-check.json",
      (candidate) => this.fs.deleteFile(candidate)
    );
    await this.purgeEmptyCacheShell();
    // Where the same cache was written before it moved under `cache/`; the reader still falls
    // back to it and an older CLI on this machine may still write it.
    await this.purgeWhitelistedPath("update-check.json", "update-check.json", (candidate) =>
      this.fs.deleteFile(candidate)
    );
    await this.purgeWhitelistedPath(
      USER_SOURCE_REFERENCES_FILENAME,
      USER_SOURCE_REFERENCES_FILENAME,
      (candidate) => this.fs.deleteFile(candidate)
    );
    // The manifest's own repository is the single writer of `manifest.json` — deleting through
    // it, never a second path to the same file, is what keeps that true.
    await this.userManifestRepo.delete();
    await this.marketplaceRegistry.delete(projectRoot, FRAMEWORK_MARKETPLACE_NAME, "user");
  }

  /** `cache/built/` and `cache/update-check.json` are this whitelist's only occupants of
   * `userConfigDir()/cache/`. The shell around them is removed only once proven empty, under the
   * same containment as every other candidate — never assumed from having just purged its only
   * children, since a future writer under `cache/` would make that assumption stale silently. */
  private async purgeEmptyCacheShell(): Promise<void> {
    const candidate = await resolveCacheCandidate(
      this.fs,
      this.logger,
      this.userConfigDir(),
      "cache",
      "user scope: cache"
    );
    if (candidate === null) return;
    let entries: string[];
    try {
      entries = await this.fs.listDirectory(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (entries.length > 0) return;
    await this.fs.deleteDirectory(candidate);
    this.logger.info(`user scope: cache purged: ${candidate}`);
  }

  /** Never `userConfigDir()` itself, and never on a manifest's word: every fixed whitelist entry
   * is still resolved through `resolveCacheCandidate`'s `realpath` + containment check before it
   * is touched — defense in depth against one of those directories having become a symlink since
   * it was last written. */
  private async purgeWhitelistedPath(
    relativeSegments: string,
    label: string,
    remove: (candidate: string) => Promise<void>
  ): Promise<void> {
    const candidate = await resolveCacheCandidate(
      this.fs,
      this.logger,
      this.userConfigDir(),
      relativeSegments,
      `user scope: ${label}`
    );
    if (candidate === null) return;
    await remove(candidate);
    this.logger.info(`user scope: ${label} purged: ${candidate}`);
  }
}
