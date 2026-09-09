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

/** One plugin `doctor` expects a native-activation tool's own registry to carry, and the ref to
 * look it up by — `ref` absent exactly when nothing here can build one, which is the unanswerable
 * case a missing marketplace produces. */
interface ExpectedNativeRegistration {
  readonly plugin: string;
  readonly ref?: string;
}

/**
 * Checks the registrations the CLI writes but does not track.
 *
 * Two unrelated facets share this class because they share a shape: both look past a tracked
 * file's own hash, at state a tool's own CLI wrote and this CLI only observes. A tool's
 * machine-local settings file is deliberately untracked (absolute paths), so nothing else would
 * notice it emptied, edited or deleted; a native-activation tool's own plugin registry answers
 * `registered`, `not-registered`, `registered-disabled` or `unanswerable`, and only the first two
 * are errors — `unanswerable` is the normal state on a machine that has never run that binary.
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
    /** Host marketplace registry readers keyed by `AiToolId`. Only a tool whose profile declares
     * `NativeActivation.marketplaceRegistry` is ever looked up here. */
    private readonly hostMarketplaceRegistries: ReadonlyMap<
      AiToolId,
      HostMarketplaceRegistryReader
    > = new Map(),
    /** Root of a user-scope marketplace's built tree, mirroring `EnsureBuiltMarketplaceUseCase`'s
     * own `userCacheRoot` — needed to recompute the same path that use case would build, without
     * running a build. No default: a caller with nothing real to pass would silently recompute a
     * path this run never built. */
    private readonly userCacheRoot: () => string,
    /** This run's own CLI version: the shared source is one directory per version, so recomputing
     * the expected path needs the same version a build would use. No default — an empty version
     * collapses `join(…, "", …)` to the pre-version path shape, a different, wrong path silently
     * recomputed rather than a failure. */
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
   * Whether a host's own marketplace registry already holds this project's marketplace name
   * pointed at a source other than the one this project would register — the doctor-side half of
   * the sync-time guard, so a conflict is visible between two `sync` runs, not only when one fails.
   *
   * The expected source is **recomputed**, never stored: `builtMarketplaceDir` /
   * `userBuiltMarketplaceDir` are the same pure functions `EnsureBuiltMarketplaceUseCase` calls to
   * decide where it builds, so nothing here triggers a build. Silent on an unreadable registry and
   * on a source that has never been built — reporting a conflict against a path nothing has ever
   * pointed at would invent the exact false positive this guard exists to prevent.
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
        // Keyed by the catalog's own declared name, never `marketplace.name` (aidd's local
        // alias): a host's registry only ever holds an entry under the name its own catalog
        // declares. `resolvedBuiltDir` just above stays keyed by alias, since that path is aidd's
        // own build location, not a host-facing lookup.
        //
        // The drift context is handed to every `aidd-framework` entry regardless of its own
        // recorded `scope`: an unmigrated project-scope registration is exactly the "still points
        // at this project's own pre-migration cache" case this decides.
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

  /** Both `warning`, never `error`: neither drift is a fault this project caused, and neither
   * blocks anything the way a genuine different-catalog conflict does. */
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
   * `undefined` when nothing resolves at the computed path, which means either it was never built
   * or it no longer exists — neither a fact this check may turn into a conflict.
   *
   * The reserved framework name always resolves to the shared, machine-scope path, even where the
   * registry still records `scope: "project"`: honouring that record would compute the
   * pre-migration path as "expected", which the host's own registration already matches, and
   * doctor would report nothing wrong in the one state it most needs to name. Every other
   * marketplace still resolves by its own recorded `scope`.
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
      // A tool that writes its own registration cannot have written one while its binary was out
      // of reach: reporting the absence would report that an uninstalled tool is unconfigured.
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

  /** `nativeRegistrations` when the manifest carries one, falling back to the plugins it tracks —
   * the state a `sync`-unaware installer produced. `pluginRefs` are already `<plugin>@<marketplace>`
   * strings; the fallback assembles the same shape, `ref` absent exactly when no marketplace was
   * recorded for a plugin, the one case nothing here can look up at all. */
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
    if (!isAiTool(config)) return undefined;
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

  /** The one preamble all three passes open with, so `--tool <id>` narrows every one of them the
   * same way. */
  private *retainedToolIds(manifest: Manifest, allowedIds: Set<string> | null): Generator<ToolId> {
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
      yield toolId;
    }
  }

  /** `retainedToolIds` paired with the registered marketplaces, since both callers need one tool
   * at a time *and* the full marketplace list. Yields nothing when no marketplace is registered,
   * which is the "no issues" answer both passes already gave that case. */
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
