import { resolve } from "node:path";
import {
  MarketplaceSourceConflictError,
  NativePluginCliError,
  UnreadableBuiltCatalogError,
} from "../../../../kernel/errors.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../../kernel/ports/hasher.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { VersionReader } from "../../../../kernel/ports/version-reader.js";
import { type AiToolId, isAiToolId, type ToolId } from "../../../../kernel/tool.js";
import type { MarketplaceRegisterFramework } from "../../../distribution/application/marketplace-register-framework-use-case.js";
import type { Marketplace } from "../../../distribution/domain/marketplace.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";
import type { MarketplaceSettings } from "../../../tools/domain/marketplace-settings.js";
import {
  describePluginDiff,
  type MarketplaceCatalogIdentity,
  pluginSetDifference,
} from "../../../tools/domain/marketplace-source-conflict.js";
import type { HostMarketplaceRegistryReader } from "../../../tools/domain/ports/host-marketplace-registry-reader.js";
import type { NativePluginActivator } from "../../../tools/domain/ports/native-plugin-activator.js";
import { nativeActivationOf, resolvePluginsCapability } from "../../../tools/domain/registry.js";
import type { FrameworkBuildTarget } from "../../../translate/domain/build-target.js";
import type {
  NativeMarketplaceRegistration,
  NativeRegistrations,
} from "../../domain/manifest/native-registrations.js";
import type { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { UserSourceReferences } from "../../domain/ports/user-source-references.js";
import type { EnsureBuiltMarketplace } from "../shared/ensure-built-marketplace-use-case.js";
import {
  hostMarketplaceSourceConflict,
  isDriftFound,
  type MarketplaceSourceDriftFound,
} from "../shared/host-marketplace-source-conflict.js";
import {
  marketplaceCatalogProbePath,
  readMarketplaceCatalogIdentity,
} from "../shared/read-marketplace-catalog-identity.js";
import {
  frameworkSourceIsShared,
  resolveProjectRootForReferences,
  toleratingUnreadableSourceReferences,
} from "../shared/shared-source-reference-support.js";

export interface MarketplaceSyncSettingsOptions {
  projectRoot: string;
  /** Limits both the settings sync and the native activation to these tools — what
   * `sync --tool <id>` needs so fixing one tool's registration does not silently
   * re-drive every other installed tool's CLI too. Every installed tool when absent. */
  toolIds?: readonly ToolId[];
  /** Re-registers the framework marketplace when this run finds none at all — `sync.ts`
   * alone sets this, never `plugin install | remove | update` or `marketplace add |
   * remove | refresh`, which drive this same `execute` through `syncNativeActivation`
   * without it. This flag's own placement must fall strictly between the two checks
   * around it: `execute` already returned above for no manifest at all, before this is
   * even read, and below this an empty registry is read exactly as found, never
   * silently repopulated. `sync` is the one command whose job is repairing a project's
   * state, not merely reading it back — the rest read a person's own registry as it
   * is. Absent (the default) keeps that read-only behaviour for everyone but `sync`. */
  recreateFrameworkIfMissing?: boolean;
}

/** What one tool's own CLI actually registered, once its `activateTool` run finished —
 * the state `nativeRegistrations` records, and `doctor` later compares to the host's
 * real registry. */
interface ActivationOutcome {
  marketplaces: readonly NativeMarketplaceRegistration[];
  pluginRefs: readonly string[];
}

/** What activation did, per tool — the fact `execute` used to throw away by returning
 * `void`, which is the one reason `sync` never called it at all. */
export interface MarketplaceSyncSettingsResult {
  /** Tools whose own CLI actually ran, whether or not every step inside it succeeded. */
  activated: readonly ToolId[];
  /** Tools with a native activation whose binary was not on PATH — nothing of theirs
   * ran, so the settings this pass wrote will not load until it has. */
  binaryMissing: readonly { toolId: ToolId; binary: string }[];
  /** What a recoverable, best-effort step logged — the same text `logger.warn` already
   * received, returned so a caller can act on it without capturing output. */
  warnings: readonly string[];
  /** A hard failure a tool's activation raised that is not the recoverable
   * `NativePluginCliError` family. Two shapes reach here: a bug in the activator itself
   * (every failure a real adapter throws is a `NativePluginCliError`, so anything else
   * it raises is that), and a deliberate refusal from the source-conflict guard in
   * `registerMarketplace` — a `MarketplaceSourceConflictError` is not a bug either side
   * produced, it is the guard doing exactly what it exists to do. Returned rather than
   * thrown: whether that makes the whole command fail is `sync.ts`'s decision, the same
   * split `restoreAllUseCase` already holds for a restore failure. */
  errors: readonly { scope: string; message: string }[];
}

const EMPTY_RESULT: MarketplaceSyncSettingsResult = {
  activated: [],
  binaryMissing: [],
  warnings: [],
  errors: [],
};

/** Syncing marketplace settings into the tools that read them, as its callers need it. */
export interface MarketplaceSyncSettings {
  execute(options: MarketplaceSyncSettingsOptions): Promise<MarketplaceSyncSettingsResult>;
}

/** What one execute() run's native activation did, across every tool it touched. */
interface ActivationRun {
  outcomes: ReadonlyMap<ToolId, ActivationOutcome>;
  binaryMissing: readonly { toolId: ToolId; binary: string }[];
  warnings: readonly string[];
  errors: readonly { scope: string; message: string }[];
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
    private readonly ensureBuilt: EnsureBuiltMarketplace,
    /** Readers of a host's own marketplace registry, keyed by `AiToolId` — only a tool
     * whose profile declares `NativeActivation.marketplaceRegistry` is ever looked up
     * here (see `guardAgainstConflict`), so a tool absent from this map still syncs
     * exactly as before. Defaults to empty for every existing caller that predates
     * this guard. */
    private readonly hostMarketplaceRegistries: ReadonlyMap<
      AiToolId,
      HostMarketplaceRegistryReader
    > = new Map(),
    /** Root of a user-scope marketplace's built tree, mirroring
     * `EnsureBuiltMarketplaceUseCase`'s own `userCacheRoot` — `guardAgainstConflict`
     * needs it to decide a version/migration drift the same way `doctor`'s own
     * `checkMarketplaceSources` does. No separate CLI-version reader is needed here,
     * unlike `DoctorRegistrationUseCase`: the version a drift is decided against comes
     * from `builtDir` itself, already built by `ensureBuilt` before this ever runs,
     * rather than a path recomputed without one. */
    private readonly userCacheRoot: () => string = () => "",
    /** Re-registers the shared machine-scope source when this run finds no marketplace
     * at all — the fix for a clone whose committed manifest predates this machine's own
     * copy of the registry (`userConfigDir()`, never inside the project). Absent for
     * every caller that predates this, which keeps the old silent no-op instead of
     * guessing what to register. */
    private readonly marketplaceRegisterFrameworkUseCase?: MarketplaceRegisterFramework,
    private readonly userSourceReferences?: UserSourceReferences,
    private readonly currentVersionProvider?: VersionReader
  ) {}

  async execute(options: MarketplaceSyncSettingsOptions): Promise<MarketplaceSyncSettingsResult> {
    const { projectRoot } = options;
    const [manifest, initialMarketplaces] = await Promise.all([
      this.manifestRepo.load().catch(() => null),
      this.marketplaceRegistry.list(projectRoot),
    ]);
    if (manifest === null) return EMPTY_RESULT;
    const marketplaces = options.recreateFrameworkIfMissing
      ? await this.ensureFrameworkRegistered(projectRoot, initialMarketplaces)
      : initialMarketplaces;
    if (marketplaces.length === 0) return EMPTY_RESULT;
    await this.recordSharedSourceReference(projectRoot, marketplaces);
    const toolIds = this.selectToolIds(manifest, options.toolIds);
    let anyToolUpdated = false;
    for (const toolId of toolIds) {
      if (await this.syncTool(toolId, projectRoot, manifest, marketplaces)) anyToolUpdated = true;
    }
    if (anyToolUpdated) await this.manifestRepo.save(manifest);
    const activation = await this.activateNativeTools(projectRoot, manifest, marketplaces, toolIds);
    const wroteHashes = await this.recordWhatActivationWrote(projectRoot, manifest, [
      ...activation.outcomes.keys(),
    ]);
    const wroteRegistrations = this.recordNativeRegistrations(manifest, activation.outcomes);
    if (wroteHashes || wroteRegistrations) await this.manifestRepo.save(manifest);
    return {
      activated: [...activation.outcomes.keys()],
      binaryMissing: activation.binaryMissing,
      warnings: activation.warnings,
      errors: activation.errors,
    };
  }

  /**
   * A clone whose committed manifest predates this machine's own copy of the shared
   * registry finds `marketplaces` empty on its very first `sync`: the registry lives
   * under `userConfigDir()`, never inside the project, so nothing about a fresh clone
   * carries it. Silently doing nothing here used to be indistinguishable from "nothing
   * to sync". Recreating the one entry almost every project relies on, the framework's
   * own marketplace, is exactly what `setup`'s own auto-register already does by
   * default — a bare `sync` now matches it instead of leaving the project inert until
   * someone remembers to run `setup` again.
   *
   * Only ever called when `options.recreateFrameworkIfMissing` is set — every other
   * caller of `execute` reaching an empty registry (`marketplace add | remove |
   * refresh`, `plugin install | remove | update`) is reading a person's own deliberate
   * choice to have no marketplace at all, not a fresh clone's missing copy, and must
   * see that choice reflected back, not silently overwritten.
   */
  private async ensureFrameworkRegistered(
    projectRoot: string,
    marketplaces: readonly Marketplace[]
  ): Promise<readonly Marketplace[]> {
    if (marketplaces.length > 0) return marketplaces;
    if (this.marketplaceRegisterFrameworkUseCase === undefined) return marketplaces;
    await this.marketplaceRegisterFrameworkUseCase.execute({ projectRoot });
    return this.marketplaceRegistry.list(projectRoot);
  }

  /**
   * Refreshed on every run that finds the shared source registered, never only the run
   * that had to recreate it above — another project on this machine having already
   * registered it is the ordinary case, not the exception, and this project's own
   * reference is still missing the first time its own `sync` (or `setup`) runs here.
   * What a `clean --scope user` (not yet built) will read before it purges anything the
   * machine-scope entry owns.
   */
  private async recordSharedSourceReference(
    projectRoot: string,
    marketplaces: readonly Marketplace[]
  ): Promise<void> {
    if (this.userSourceReferences === undefined || this.currentVersionProvider === undefined) {
      return;
    }
    const framework = marketplaces.find((m) => frameworkSourceIsShared(m.name, m.scope));
    if (framework === undefined) return;
    const userSourceReferences = this.userSourceReferences;
    const currentVersionProvider = this.currentVersionProvider;
    await toleratingUnreadableSourceReferences(this.logger, undefined, async () => {
      const resolvedRoot = await resolveProjectRootForReferences(this.fs, projectRoot);
      await userSourceReferences.addReference(currentVersionProvider.get(), resolvedRoot);
    });
  }

  /** Every installed tool, narrowed to `toolIds` when the caller named one — what
   * `sync --tool <id>` needs so it touches only that tool's settings and activation. */
  private selectToolIds(
    manifest: Manifest,
    toolIds: readonly ToolId[] | undefined
  ): readonly ToolId[] {
    const installed = manifest.getInstalledToolIds();
    if (toolIds === undefined) return installed;
    const requested = new Set(toolIds);
    return installed.filter((toolId) => requested.has(toolId));
  }

  /** Runs each tool's own CLI, keyed to what it was asked to register — never a tool
   * with no native activation at all, and never one whose binary is absent: neither
   * wrote anything, so a settings file that differs for it differs because a person
   * changed it. Blessing that as ours is the one thing this must not do. */
  private async activateNativeTools(
    projectRoot: string,
    manifest: Manifest,
    marketplaces: readonly Marketplace[],
    toolIds: readonly ToolId[]
  ): Promise<ActivationRun> {
    const outcomes = new Map<ToolId, ActivationOutcome>();
    const binaryMissing: { toolId: ToolId; binary: string }[] = [];
    const warnings: string[] = [];
    const errors: { scope: string; message: string }[] = [];
    for (const toolId of toolIds) {
      const binary = this.nativeActivationBinary(toolId);
      const activator = binary === undefined ? undefined : this.activators.get(binary);
      if (binary === undefined || activator === undefined) continue;
      if (!activator.isAvailable()) {
        this.logger.warn(`${binary} CLI not found on PATH — skipping native plugin activation.`);
        binaryMissing.push({ toolId, binary });
        continue;
      }
      try {
        const outcome = await this.activateTool(
          toolId,
          activator,
          projectRoot,
          manifest,
          marketplaces,
          warnings
        );
        outcomes.set(toolId, outcome);
      } catch (error) {
        errors.push({ scope: toolId, message: (error as Error).message });
      }
    }
    return { outcomes, binaryMissing, warnings, errors };
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

  /** Runs this tool's own CLI, returning what it was asked to register. The caller has
   * already checked `isAvailable()`, so every failure reaching here is either a
   * recoverable `NativePluginCliError` — collected into `warnings`, never thrown — or a
   * genuine bug in the activator, which propagates. */
  private async activateTool(
    toolId: ToolId,
    activator: NativePluginActivator,
    projectRoot: string,
    manifest: Manifest,
    marketplaces: readonly Marketplace[],
    warnings: string[]
  ): Promise<ActivationOutcome> {
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
    const registeredMarketplaces: NativeMarketplaceRegistration[] = [];
    for (const marketplace of marketplaces) {
      const hostName = await this.registerMarketplace(
        activator,
        toolId,
        marketplace,
        projectRoot,
        warnings
      );
      registeredMarketplaces.push({ alias: marketplace.name, hostName });
    }
    if (!activator.enablesPlugins())
      return { marketplaces: registeredMarketplaces, pluginRefs: [] };
    this.bestEffort(() => activator.upgradeMarketplaces(), "upgrade marketplaces", warnings);
    const hostNameByAlias = new Map(registeredMarketplaces.map((m) => [m.alias, m.hostName]));
    const refs = this.pluginRefsToEnable(toolId, manifest, marketplaces, hostNameByAlias);
    for (const ref of refs) {
      this.bestEffort(() => activator.enablePlugin(ref), `enable plugin '${ref}'`, warnings);
    }
    return { marketplaces: registeredMarketplaces, pluginRefs: refs };
  }

  private bestEffort(action: () => void, label: string, warnings: string[]): void {
    try {
      action();
    } catch (error) {
      if (!(error instanceof NativePluginCliError)) throw error;
      const message = `Native plugin activation — ${label} skipped: ${error.message}`;
      this.logger.warn(message);
      warnings.push(message);
    }
  }

  /** The `<plugin>@<hostName>` refs this tool's own CLI is asked to enable — every
   * recorded plugin whose marketplace this project still knows, and nothing else. Which
   * marketplaces get registered is a separate question, answered by the registry itself.
   *
   * Keyed by `hostName`, not `plugin.marketplace` (aidd's own alias): this ref is a
   * host-facing call (`claude plugin install <ref>`), and the host resolves the
   * marketplace half of it against its own registry, which knows this catalog only by
   * the name it declares itself — never by whatever local alias this project chose.
   * `hostNameByAlias` carries one entry per marketplace `activateTool` iterated,
   * `registerMarketplace`'s own alias fallback included, so the lookup below is
   * defensive rather than a real gap — nothing in `marketplaces` is ever missing from
   * it. */
  private pluginRefsToEnable(
    toolId: ToolId,
    manifest: Manifest,
    marketplaces: readonly Marketplace[],
    hostNameByAlias: ReadonlyMap<string, string>
  ): string[] {
    const byName = new Map(marketplaces.map((m) => [m.name, m]));
    const refs: string[] = [];
    for (const plugin of manifest.getPlugins(toolId)) {
      const marketplace = plugin.marketplace == null ? undefined : byName.get(plugin.marketplace);
      if (marketplace === undefined) continue;
      const hostName = hostNameByAlias.get(marketplace.name);
      if (hostName === undefined) continue;
      refs.push(`${plugin.name}@${hostName}`);
    }
    return refs;
  }

  // Native tools must read the BUILT (transformed) tree, not the raw Claude-format
  // source. Returns the name this project's own registration is actually known by once
  // this call returns — always the host's own catalog name, never this project's local
  // alias: a catalog this project just built and cannot read back is not registered at
  // all (see the throw below), so by the time this returns, `hostName` is always a fact
  // read from the catalog itself.
  private async registerMarketplace(
    activator: NativePluginActivator,
    toolId: ToolId,
    marketplace: Marketplace,
    projectRoot: string,
    warnings: string[]
  ): Promise<string> {
    const builtDir = await this.buildForTool(toolId, marketplace, projectRoot);
    if (builtDir === null) return marketplace.name;
    const requestedIdentity = await readMarketplaceCatalogIdentity(this.fs, toolId, builtDir);
    if (requestedIdentity === undefined) {
      throw new UnreadableBuiltCatalogError(
        marketplaceCatalogProbePath(toolId, builtDir) ?? builtDir
      );
    }
    const hostName = requestedIdentity.name;
    const decision = await this.guardAgainstConflict(
      toolId,
      builtDir,
      requestedIdentity,
      marketplace,
      projectRoot,
      warnings
    );
    if (decision === "skip") return hostName;
    try {
      activator.addMarketplace(builtDir, marketplace.scope);
    } catch (error) {
      if (!(error instanceof NativePluginCliError)) throw error;
      this.reclaimOrReport(activator, marketplace, hostName, builtDir, error, warnings);
    }
    return hostName;
  }

  /**
   * Refuses to drive `addMarketplace` where doing so would silently replace a
   * *different catalog* a host's own registry already holds under this name —
   * measured against the real `claude` binary: `plugin marketplace add` derives the
   * registered name from the source's own catalog, never from an argument, and
   * re-adding the same name from a different tree replaces `installLocation` with no
   * prompt and no error.
   *
   * This project's own local alias for a marketplace is deliberately not compared
   * against the catalog's own declared name here: a project choosing a local alias its
   * catalog does not declare itself under is a supported capability (`smoke-tools.sh`'s
   * own `local`/`scoped`/`userscoped` fixtures exercise exactly that), never a fault —
   * the host registers, and this guard reads the host's registry, by the *catalog's*
   * name throughout, never aidd's alias. See `native-registrations.ts` for where that
   * distinction is carried forward into what this run records.
   *
   * Gated on `NativeActivation.marketplaceRegistry` being declared at all, which
   * today only claude's profile does — codex refuses that re-add itself, copilot
   * refuses every re-add — so this never reads a registry for either of them, and
   * carries no `if (toolId === "claude")` anywhere to say so.
   *
   * Thrown rather than collected as a best-effort warning: a conflict is not a
   * recoverable `NativePluginCliError`, and letting `addMarketplace` run anyway is
   * exactly the silent overwrite this guard exists to stop.
   *
   * The registry lookup itself is `hostMarketplaceSourceConflict`, shared with
   * `DoctorRegistrationUseCase`'s own `checkMarketplaceSources` pass — both key it by
   * `requestedIdentity.name` alone, in the one place that keying happens, so the two
   * cannot drift onto different keys.
   *
   * The host's registry already holding this name pointed at the *same* catalog
   * reached through a different, resolved path (two projects, one shared build) is
   * not a conflict either: only a genuinely different catalog under the same name
   * refuses.
   *
   * A version/migration drift is decided first, from the path alone, the same
   * context `doctor`'s own `checkMarketplaceSources` builds — computed for every
   * `aidd-framework` entry regardless of its own recorded `scope`, since it is the
   * rollback refusal itself that must hold on that state:
   *
   * - the host already follows a *newer* build of aidd's own shared source
   *   (`version-behind`) — this run must never repoint it backward, so it writes
   *   nothing and returns `"skip"`, warning rather than throwing: this is not this
   *   project's fault, and every other tool this run touches must still proceed.
   * - the host still points at this project's own pre-migration cache
   *   (`unmigrated-project-source`) — this run's own build is the newer, shared
   *   source, so it proceeds exactly as an unguarded call would: `addMarketplace`
   *   moves the host onto it, which is the migration itself completing.
   * - no drift at all — a genuine different-catalog conflict throws, as before.
   */
  private async guardAgainstConflict(
    toolId: ToolId,
    builtDir: string,
    requestedIdentity: MarketplaceCatalogIdentity,
    marketplace: Marketplace,
    projectRoot: string,
    warnings: string[]
  ): Promise<"proceed" | "skip"> {
    if (!isAiToolId(toolId)) return "proceed";
    if (nativeActivationOf(toolId)?.marketplaceRegistry === undefined) return "proceed";
    const reader = this.hostMarketplaceRegistries.get(toolId);
    if (reader === undefined) return "proceed";
    const requestedSource = await this.fs.realpath(builtDir).catch(() => builtDir);
    const check = await hostMarketplaceSourceConflict(
      this.fs,
      toolId,
      reader,
      requestedSource,
      requestedIdentity,
      {
        userCacheRoot: this.userCacheRoot(),
        projectRoot,
        marketplaceName: marketplace.name,
        target: toolId,
      }
    );
    if (check === undefined) return "proceed";
    if (isDriftFound(check)) return this.decideOnDrift(toolId, check, warnings);
    const diff = pluginSetDifference(check.registeredIdentity, check.requestedIdentity);
    throw new MarketplaceSourceConflictError(
      `Marketplace '${check.name}' is already registered from a different catalog: ` +
        `${check.registeredSource} differs from the one requested, ${check.requestedSource} ` +
        `— plugins ${describePluginDiff(diff)}, per ${check.location}. ` +
        `Run \`claude plugin marketplace remove ${check.name}\`, then \`aidd sync\` again ` +
        `to re-register it for this project.`
    );
  }

  /** The rollback refusal itself: a host already following a newer build never gets
   * written backward. Warned, not thrown — this is not a bug in this project's own
   * request, and a caller iterating several tools must still proceed to the rest. */
  private decideOnDrift(
    toolId: ToolId,
    found: MarketplaceSourceDriftFound,
    warnings: string[]
  ): "proceed" | "skip" {
    if (found.drift.kind !== "version-behind") return "proceed";
    const { registeredVersion, requestedVersion } = found.drift;
    const message =
      `${toolId}'s marketplace registry (${found.location}) already carries a newer ` +
      `aidd-framework build, ${registeredVersion}, than this run's own ${requestedVersion} — ` +
      "not registering this run's build over it. Run `aidd update` to bring this project's " +
      "CLI to at least the version the host already follows.";
    this.logger.warn(message);
    warnings.push(message);
    return "skip";
  }

  // `add` refused, which for a global registry means the name is already held. Whose
  // it is decides what may be done: a registration that still resolves belongs to a
  // project that is alive, and taking it would break that project — two projects would
  // otherwise steal the name from each other on every sync, uninstalling each other's
  // plugins. One whose source is gone belongs to nobody, and holding it hostage breaks
  // every project that comes after.
  //
  // `hostName`, never `marketplace.name`, drives every one of the host-facing calls
  // below: `registrationState`/`removeMarketplace` ask and act on the name the host's
  // own CLI actually knows a registration by, which is the catalog's own declared name,
  // not this project's local alias for it. Asking about the alias instead would answer
  // "dead" for a perfectly live registration whenever the two differ, and then force-
  // remove a name the host never held — exactly the bug this project's own
  // `local`/`scoped`/`userscoped` smoke fixtures would have hit.
  private reclaimOrReport(
    activator: NativePluginActivator,
    marketplace: Marketplace,
    hostName: string,
    builtDir: string,
    addError: NativePluginCliError,
    warnings: string[]
  ): void {
    if (activator.registrationState(hostName) !== "dead") {
      const message = `Native plugin activation — register marketplace '${hostName}' skipped: ${addError.message}`;
      this.logger.warn(message);
      warnings.push(message);
      return;
    }
    const reclaimMessage = `Marketplace '${hostName}' was registered to a directory that no longer exists; re-registering it for this project. Plugins installed from it are removed and the ones this CLI manages are put back.`;
    this.logger.warn(reclaimMessage);
    warnings.push(reclaimMessage);
    this.bestEffort(
      () => activator.removeMarketplace(hostName, marketplace.scope, { force: true }),
      `unregister stale marketplace '${hostName}'`,
      warnings
    );
    this.bestEffort(
      () => activator.addMarketplace(builtDir, marketplace.scope),
      `register marketplace '${hostName}'`,
      warnings
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
    marketplaceRegistrationsEqual(a.marketplaces, b.marketplaces) &&
    arraysEqual(a.pluginRefs, b.pluginRefs)
  );
}

function marketplaceRegistrationsEqual(
  a: readonly NativeMarketplaceRegistration[],
  b: readonly NativeMarketplaceRegistration[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (value, index) => value.alias === b[index]?.alias && value.hostName === b[index]?.hostName
    )
  );
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
