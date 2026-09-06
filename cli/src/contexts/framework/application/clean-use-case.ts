import { homedir as nodeHomedir } from "node:os";
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
import type { AiToolId, ToolId } from "../../../kernel/tool.js";
import { isAiToolId } from "../../../kernel/tool.js";
import type { MarketplaceRegistry } from "../../distribution/domain/ports/marketplace-registry.js";
import type { NativePluginActivator } from "../../tools/domain/ports/native-plugin-activator.js";
import {
  machineLocalFilesOf,
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
  }>;
}

interface CleanResult {
  dryRun: boolean;
  manifestFound: boolean;
  preview: CleanPreview;
  fileCount: number;
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
    private readonly prompter?: Prompter
  ) {}

  async execute(options: CleanOptions): Promise<CleanResult> {
    const manifest = await this.manifestRepo.load();
    if (manifest === null) {
      const emptyPreview: CleanPreview = { tools: [], totalFileCount: 0, nativeRegistrations: [] };
      return { dryRun: false, manifestFound: false, preview: emptyPreview, fileCount: 0 };
    }
    const preview = this.buildPreview(manifest);
    const dryRunResult = await this.confirmOrDryRun(options, preview);
    if (dryRunResult !== null) return dryRunResult;
    // Undoing a host's own registration must happen before any of the rest: the tool's
    // CLI resolves the marketplace name against the built tree this project recorded,
    // and that tree lives under .aidd/cache/ — which removeAiddState deletes next.
    // Deleting it first leaves the host's own registry pointing at a source that no
    // longer exists, which the host may then refuse to unregister at all.
    await this.undoNativeRegistrations(manifest, options.projectRoot);
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
   * remove` does. */
  private async undoNativeRegistrations(manifest: Manifest, projectRoot: string): Promise<void> {
    for (const toolId of manifest.getInstalledToolIds()) {
      const registrations = manifest.getNativeRegistrations(toolId);
      if (registrations === undefined) continue;
      await this.undoToolNativeRegistrations(registrations, projectRoot);
    }
  }

  private async undoToolNativeRegistrations(
    registrations: NativeRegistrations,
    projectRoot: string
  ): Promise<void> {
    const { binary } = registrations;
    const activator = this.activators.get(binary);
    if (activator === undefined || !activator.isAvailable()) {
      this.logger.warn(
        `${binary}: registration left in place, the ${binary} CLI is not on the PATH.`
      );
      return;
    }
    // Every plugin ref uninstalled before any marketplace is removed: only Copilot
    // declares `forceRemoveArgs`, so Claude and Codex can refuse to remove a
    // marketplace that still has plugins installed from it.
    for (const ref of registrations.pluginRefs) {
      this.bestEffort(() => activator.uninstallPlugin(ref), `${binary} plugin uninstall '${ref}'`);
    }
    for (const name of registrations.marketplaces) {
      await this.undoMarketplaceRegistration(activator, binary, name, projectRoot);
    }
  }

  private async undoMarketplaceRegistration(
    activator: NativePluginActivator,
    binary: string,
    name: string,
    projectRoot: string
  ): Promise<void> {
    const marketplaces = (await this.marketplaceRegistry?.list(projectRoot)) ?? [];
    const marketplace = marketplaces.find((m) => m.name === name);
    if (marketplace === undefined) {
      this.logger.warn(
        `${binary}: '${name}' is no longer a registered marketplace here, so its scope cannot be resolved — its ${binary} registration was left in place.`
      );
      return;
    }
    this.bestEffort(
      () => activator.removeMarketplace(name, marketplace.scope),
      `${binary} marketplace remove '${name}'`
    );
  }

  private bestEffort(action: () => void, label: string): void {
    try {
      action();
    } catch (error) {
      if (!(error instanceof NativePluginCliError)) throw error;
      this.logger.warn(`${label} failed: ${error.message}`);
    }
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

  private buildPreview(manifest: Manifest): CleanPreview {
    const tools = manifest.getInstalledToolIds().map((toolId) => ({
      toolId,
      fileCount: manifest.getToolFiles(toolId).length + manifest.getMergeFiles(toolId).length,
    }));
    const totalFileCount = tools.reduce((s, t) => s + t.fileCount, 0);
    const nativeRegistrations = this.previewNativeRegistrations(manifest);
    return { tools, totalFileCount, nativeRegistrations };
  }

  private previewNativeRegistrations(manifest: Manifest): CleanPreview["nativeRegistrations"] {
    const preview: CleanPreview["nativeRegistrations"] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      const registrations = manifest.getNativeRegistrations(toolId);
      if (registrations === undefined) continue;
      preview.push({
        toolId,
        binary: registrations.binary,
        marketplaceCount: registrations.marketplaces.length,
        pluginRefCount: registrations.pluginRefs.length,
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
    const boundary = resolvePluginsCapability(toolId)?.userPluginsBaseDir(nodeHomedir());
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
