import { join, resolve } from "node:path";
import { builtMarketplaceDir, userBuiltMarketplaceDir } from "../../../../kernel/paths.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { VersionReader } from "../../../../kernel/ports/version-reader.js";
import { type AiToolId, isAiToolId, type ToolId } from "../../../../kernel/tool.js";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  type Marketplace,
} from "../../../distribution/domain/marketplace.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";
import { answeredRegistry } from "../../../tools/domain/host-plugin-registration.js";
import type { MarketplaceSettings } from "../../../tools/domain/marketplace-settings.js";
import {
  describePluginDiff,
  pluginSetDifference,
} from "../../../tools/domain/marketplace-source-conflict.js";
import type { HostMarketplaceRegistryReader } from "../../../tools/domain/ports/host-marketplace-registry-reader.js";
import type {
  HostPluginRegistryReader,
  HostPluginRegistryReading,
} from "../../../tools/domain/ports/host-plugin-registry-reader.js";
import type { NativePluginActivator } from "../../../tools/domain/ports/native-plugin-activator.js";
import { getToolConfig, isAiTool, nativeActivationOf } from "../../../tools/domain/registry.js";
import type { DoctorIssue } from "../../domain/doctor.js";
import type { Manifest } from "../../domain/manifest.js";
import {
  type HostMarketplaceSourceCheck,
  hostMarketplaceSourceConflict,
  isDriftFound,
  type MarketplaceSourceDriftFound,
} from "../shared/host-marketplace-source-conflict.js";
import { readMarketplaceCatalogIdentity } from "../shared/read-marketplace-catalog-identity.js";

export interface DoctorRegistrationOptions {
  manifest: Manifest;
  projectRoot: string;
  allowedIds: Set<string> | null;
}

/** One plugin `doctor` expects a native-activation tool's own registry to carry, and the
 * ref to look it up by — absent exactly when nothing here can build one, which is the
 * unanswerable case a missing marketplace produces. */
interface ExpectedNativeRegistration {
  readonly plugin: string;
  readonly ref?: string;
}

/**
 * Checks the registrations the CLI writes but does not track.
 *
 * Two unrelated facets share this class because they share a shape: both look past a
 * tracked file's own hash, at state a tool's own CLI wrote and this CLI only observes.
 *
 * The first checks a tool's *machine-local settings file* against the marketplaces this
 * project's own registry expects — a tracked file announces its own damage by its hash
 * changing, and this file is deliberately untracked (absolute paths), so nothing else
 * would notice it being emptied, edited, or deleted.
 *
 * The second checks a *native-activation tool's own plugin registry* (Claude, Codex,
 * Copilot) against `nativeRegistrations`, the manifest's record of what that registry
 * should carry: `registered`, `not-registered`, `registered-disabled`, or `unanswerable`
 * when the registry cannot be read at all (absent binary, unreadable file). Only the
 * first two are errors — an `unanswerable` reading is a normal state on any machine that
 * has never run the tool's own binary, never a fault to fix.
 */
export class DoctorRegistrationUseCase {
  constructor(
    private readonly fs: FileReader,
    private readonly registry: MarketplaceRegistry,
    /** Native plugin CLI activators keyed by `NativeActivation.binary`. */
    private readonly activators: ReadonlyMap<string, NativePluginActivator> = new Map(),
    /** Host plugin registry readers keyed by `AiToolId`, one per tool whose own CLI
     * activates plugins. */
    private readonly hostRegistries: ReadonlyMap<AiToolId, HostPluginRegistryReader> = new Map(),
    /** Host marketplace registry readers keyed by `AiToolId` — see `checkMarketplaceSources`,
     * the pass that reads them. Only a tool whose profile declares
     * `NativeActivation.marketplaceRegistry` is ever looked up here, the same gate the
     * sync-time guard in `MarketplaceSyncSettingsUseCase` uses. */
    private readonly hostMarketplaceRegistries: ReadonlyMap<
      AiToolId,
      HostMarketplaceRegistryReader
    > = new Map(),
    /** Root of a user-scope marketplace's built tree, mirroring
     * `EnsureBuiltMarketplaceUseCase`'s own `userCacheRoot` — needed here to recompute
     * the same path that use case would build, without running a build. No default: a
     * caller with nothing real to pass here would silently recompute a path this run
     * never built (see `currentVersion`'s own note). */
    private readonly userCacheRoot: () => string,
    /** This run's own CLI version, mirroring `EnsureBuiltMarketplaceUseCase`'s own
     * `version` — the shared source is one directory per version, so recomputing the
     * expected path needs the same version that use case would build with. No
     * default: an empty version used to collapse `join(…, "", …)` to the pre-version
     * path shape, which is a different, wrong path silently recomputed rather than a
     * failure — every real caller already wires a real reader. */
    private readonly currentVersion: VersionReader
  ) {}

  async execute(options: DoctorRegistrationOptions): Promise<DoctorIssue[]> {
    return [
      ...(await this.checkDeclaredMarketplaces(options)),
      ...(await this.checkNativeRegistrations(options)),
      ...(await this.checkMarketplaceSources(options)),
    ];
  }

  /**
   * Whether a host's own marketplace registry already holds this project's marketplace
   * name pointed at a source other than the one this project would register — the
   * doctor-side half of the sync-time guard in `MarketplaceSyncSettingsUseCase`, so a
   * conflict is visible even between two `sync` runs, not only at the moment one fails.
   *
   * The expected source is **recomputed**, never stored: `builtMarketplaceDir` /
   * `userBuiltMarketplaceDir` are the same pure functions `EnsureBuiltMarketplaceUseCase`
   * calls to decide where it builds, so re-evaluating them here with the same inputs is
   * not a guess at that path, it is the same path. Nothing here triggers a build.
   *
   * Gated on `NativeActivation.marketplaceRegistry` being declared, same as the sync-time
   * guard — claude only, today — and silent on an unreadable registry, same as the pure
   * `marketplaceSourceConflict` it calls: unanswerable is not a fault to report, unlike
   * `checkNativeRegistrations`'s own `unanswerable` branch, which is `info`. A source that
   * has never been built (nothing resolves at the computed path) is silent for the same
   * reason — reporting a conflict against a path nothing has ever pointed at would invent
   * the exact false positive this whole guard exists to prevent.
   */
  private async checkMarketplaceSources(
    options: DoctorRegistrationOptions
  ): Promise<DoctorIssue[]> {
    const { projectRoot } = options;
    const issues: DoctorIssue[] = [];
    for await (const { toolId, expected } of this.retainedToolsWithExpectedMarketplaces(options)) {
      if (!isAiToolId(toolId)) continue;
      if (nativeActivationOf(toolId)?.marketplaceRegistry === undefined) continue;
      const reader = this.hostMarketplaceRegistries.get(toolId);
      if (reader === undefined) continue;
      for (const marketplace of expected) {
        const requestedSource = await this.resolvedBuiltDir(projectRoot, marketplace, toolId);
        if (requestedSource === undefined) continue;
        const requestedIdentity = await readMarketplaceCatalogIdentity(
          this.fs,
          toolId,
          requestedSource
        );
        if (requestedIdentity === undefined) continue;
        // Keyed by the catalog's own declared name, never `marketplace.name` (aidd's
        // local alias): the host's registry only ever holds an entry under the name its
        // own catalog declares, whatever alias this project chose for it — the same
        // fact `resolvedBuiltDir` just above stays keyed by alias for, since that path
        // is aidd's own build location, not a host-facing lookup. `hostMarketplaceSourceConflict`
        // is the one place that keying happens, shared with the sync-time guard, so this
        // pass cannot key its lookup by anything else.
        //
        // The drift context is handed to every `aidd-framework` entry regardless of
        // its own recorded `scope`: an unmigrated project-scope registration is
        // exactly the "still points at this project's own pre-migration cache" case
        // this decides, and it can only ever be reached from that real state.
        const check: HostMarketplaceSourceCheck = await hostMarketplaceSourceConflict(
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
        if (check === undefined) continue;
        if (isDriftFound(check)) {
          issues.push(this.driftIssue(toolId, check));
          continue;
        }
        const diff = pluginSetDifference(check.registeredIdentity, check.requestedIdentity);
        issues.push({
          severity: "error",
          message: `${toolId}'s marketplace registry (${check.location}) carries '${check.name}' from a different catalog (${check.registeredSource}) than this project's own (${check.requestedSource}) — plugins ${describePluginDiff(diff)}`,
          fix: `Run \`claude plugin marketplace remove ${check.name}\`, then \`aidd sync\` to re-register it for this project — or rename this project's marketplace if it is meant to point elsewhere.`,
        });
      }
    }
    return issues;
  }

  /** Renders the two drift cases `marketplaceSourceDrift` can decide from the path
   * alone — both `warning`, never `error`: neither is a fault this project caused,
   * and neither blocks anything the way a genuine different-catalog conflict does. */
  private driftIssue(toolId: AiToolId, found: MarketplaceSourceDriftFound): DoctorIssue {
    const { drift } = found;
    if (drift.kind === "version-behind") {
      return {
        severity: "warning",
        message: `${toolId}'s marketplace registry (${found.location}) already carries a newer aidd-framework build, ${drift.registeredVersion}, than this run's own ${drift.requestedVersion}`,
        fix: "Run `aidd update` to bring this project's CLI to at least the version the host already follows.",
      };
    }
    if (drift.kind === "unmigrated-foreign-project-source") {
      return {
        severity: "warning",
        message: `${toolId}'s marketplace registry (${found.location}) still carries '${found.name}' from another project's pre-migration cache (${found.registeredSource})`,
        fix: "Run `aidd sync` to move it to the shared, machine-scope source.",
      };
    }
    return {
      severity: "warning",
      message: `${toolId}'s marketplace registry (${found.location}) still carries '${found.name}' from this project's own pre-migration cache (${found.registeredSource})`,
      fix: "Run `aidd sync` to move it to the shared, machine-scope source.",
    };
  }

  /**
   * Where this project's build of `marketplace` for `toolId` would land, resolved —
   * `undefined` when nothing resolves there, which means either it was never built or
   * it no longer exists, neither of which is a fact this check may turn into a conflict.
   *
   * The reserved framework name always resolves to the shared, machine-scope path,
   * never the project-scope one — even when the registry itself still records
   * `scope: "project"`, the exact pre-migration state `aidd sync` has not yet fixed.
   * A project-scope record for this one name is not a fact to honour here: honouring
   * it would compute the project path as "expected", which the host's own registration
   * already matches for a project that has never run `setup`/`sync` since the shared
   * source existed — and doctor would report nothing wrong at all, in the one state it
   * most needs to name. Every other marketplace still resolves by its own recorded
   * `scope`, unaffected.
   */
  private async resolvedBuiltDir(
    projectRoot: string,
    marketplace: Marketplace,
    toolId: AiToolId
  ): Promise<string | undefined> {
    const raw =
      marketplace.scope === "user" || marketplace.name === FRAMEWORK_MARKETPLACE_NAME
        ? userBuiltMarketplaceDir(
            this.userCacheRoot(),
            this.currentVersion.get(),
            marketplace.name,
            toolId
          )
        : builtMarketplaceDir(projectRoot, marketplace.name, toolId);
    try {
      return await this.fs.realpath(resolve(raw));
    } catch {
      return undefined;
    }
  }

  private async checkDeclaredMarketplaces(
    options: DoctorRegistrationOptions
  ): Promise<DoctorIssue[]> {
    const { projectRoot } = options;
    const issues: DoctorIssue[] = [];
    for await (const { toolId, expected } of this.retainedToolsWithExpectedMarketplaces(options)) {
      const settings = this.untrackedSettingsOf(toolId);
      if (settings === undefined) continue;
      // A tool that writes its own registration cannot have written one while its
      // binary was out of reach. Reporting the absence then would be reporting that
      // an uninstalled tool is unconfigured, which is not a fault to fix.
      if (!this.canRegisterItself(toolId)) continue;
      const registered = await this.registeredNames(projectRoot, settings);
      for (const marketplace of expected) {
        if (registered.has(marketplace.name)) continue;
        issues.push({
          severity: "warning",
          message: `${toolId} no longer declares marketplace '${marketplace.name}'`,
          fix: `Run \`aidd marketplace refresh\` to write it back to ${settings.marketplacesSettingsPath}.`,
        });
      }
    }
    return issues;
  }

  private async checkNativeRegistrations(
    options: DoctorRegistrationOptions
  ): Promise<DoctorIssue[]> {
    const { manifest, projectRoot, allowedIds } = options;
    const issues: DoctorIssue[] = [];
    for (const toolId of this.retainedToolIds(manifest, allowedIds)) {
      if (!isAiToolId(toolId)) continue;
      if (nativeActivationOf(toolId) === undefined) continue;
      const expected = this.expectedNativeRegistrations(manifest, toolId);
      if (expected.length === 0) continue;
      const reading = await this.hostRegistries.get(toolId)?.read(projectRoot);
      issues.push(...this.compareNativeRegistrations(toolId, expected, reading));
    }
    return issues;
  }

  /** What `doctor` expects a tool's own registry to carry: `nativeRegistrations`, the
   * manifest's own record of what the last activation wrote, when it has one — falling
   * back to the plugins the manifest tracks when it does not, which is the state of a
   * manifest a `sync`-unaware installer produced. `pluginRefs` are already
   * `<plugin>@<marketplace>` strings; the fallback assembles the same shape from a
   * plugin's own name and marketplace, absent exactly when no marketplace was recorded
   * for it — the one case nothing here can look up at all. */
  private expectedNativeRegistrations(
    manifest: Manifest,
    toolId: AiToolId
  ): readonly ExpectedNativeRegistration[] {
    const recorded = manifest.getNativeRegistrations(toolId);
    if (recorded !== undefined) {
      return recorded.pluginRefs.map((ref) => ({ plugin: ref, ref }));
    }
    return manifest.getPlugins(toolId).map((plugin) => ({
      plugin: plugin.name,
      ref: plugin.marketplace === undefined ? undefined : `${plugin.name}@${plugin.marketplace}`,
    }));
  }

  private compareNativeRegistrations(
    toolId: AiToolId,
    expected: readonly ExpectedNativeRegistration[],
    reading: HostPluginRegistryReading | undefined
  ): DoctorIssue[] {
    const answered = answeredRegistry(toolId, reading, true);
    if ("detail" in answered) {
      return [
        {
          severity: "info",
          message: answered.detail,
          fix: `The plugin does not load until ${toolId}'s own CLI has run and answered this.`,
        },
      ];
    }
    const issues: DoctorIssue[] = [];
    for (const item of expected) {
      if (item.ref === undefined) {
        issues.push({
          severity: "info",
          message: `AIDD records no marketplace for ${item.plugin} (${toolId}), so its registry cannot be asked`,
          fix: `${toolId} will not load it until a marketplace is recorded for it.`,
        });
        continue;
      }
      const entry = answered.refs.get(item.ref);
      if (entry === undefined) {
        issues.push({
          severity: "error",
          message: `${toolId}'s registry (${answered.location}) does not carry ${item.ref}`,
          fix: "Run `aidd sync` to re-register it.",
        });
      } else if (!entry.enabled) {
        issues.push({
          severity: "error",
          message: `${toolId}'s registry (${answered.location}) carries ${item.ref} and records it disabled`,
          fix: `Run \`aidd framework install --tool ${toolId}\`.`,
        });
      }
    }
    return issues;
  }

  private untrackedSettingsOf(
    toolId: ToolId
  ): (MarketplaceSettings & { marketplacesSettingsPath: string }) | undefined {
    const config = getToolConfig(toolId);
    if (config === undefined || !isAiTool(config)) return undefined;
    const caps = config.capabilities as {
      plugins?: { marketplaceSettings?: MarketplaceSettings | null };
    };
    const settings = caps.plugins?.marketplaceSettings;
    // `null` means the tool writes no machine-local registration at all, so there is
    // nothing here to check — only a declared path leaves a file worth looking at.
    if (typeof settings?.marketplacesSettingsPath !== "string") return undefined;
    return settings as MarketplaceSettings & { marketplacesSettingsPath: string };
  }

  private async registeredNames(
    projectRoot: string,
    settings: MarketplaceSettings & { marketplacesSettingsPath: string }
  ): Promise<Set<string>> {
    const path = join(projectRoot, settings.marketplacesSettingsPath);
    if (!(await this.fs.fileExists(path))) return new Set();
    let parsed: unknown;
    try {
      parsed = JSON.parse(await this.fs.readFile(path));
    } catch {
      return new Set();
    }
    if (parsed === null || typeof parsed !== "object") return new Set();
    const value = (parsed as Record<string, unknown>)[settings.settingsKey];
    if (Array.isArray(value)) return new Set(value.map(String));
    if (value !== null && typeof value === "object") return new Set(Object.keys(value));
    return new Set();
  }

  private canRegisterItself(toolId: ToolId): boolean {
    const activation = nativeActivationOf(toolId);
    if (activation === undefined) return true;
    return this.activators.get(activation.binary)?.isAvailable() ?? false;
  }

  /** The manifest's own installed tools, narrowed to `allowedIds` when a caller named
   * one — the one preamble all three passes open with, so `--tool <id>` narrows every
   * one of them the same way instead of three copies free to drift apart. */
  private *retainedToolIds(manifest: Manifest, allowedIds: Set<string> | null): Generator<ToolId> {
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
      yield toolId;
    }
  }

  /** `retainedToolIds`, paired with the registered marketplaces — the preamble
   * `checkMarketplaceSources` and `checkDeclaredMarketplaces` both open with, since
   * both need one tool at a time *and* the full marketplace list on every iteration.
   * Yields nothing at all when no marketplace is registered, which is the "no
   * issues" answer both passes already gave that case on their own. */
  private async *retainedToolsWithExpectedMarketplaces(
    options: DoctorRegistrationOptions
  ): AsyncGenerator<{ toolId: ToolId; expected: readonly Marketplace[] }> {
    const { manifest, projectRoot, allowedIds } = options;
    const expected = await this.registry.list(projectRoot);
    if (expected.length === 0) return;
    for (const toolId of this.retainedToolIds(manifest, allowedIds)) {
      yield { toolId, expected };
    }
  }
}
