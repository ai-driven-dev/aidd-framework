import { join } from "node:path";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import { type AiToolId, isAiToolId, type ToolId } from "../../../../kernel/tool.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";
import { answeredRegistry } from "../../../tools/domain/host-plugin-registration.js";
import type { MarketplaceSettings } from "../../../tools/domain/marketplace-settings.js";
import type {
  HostPluginRegistryReader,
  HostPluginRegistryReading,
} from "../../../tools/domain/ports/host-plugin-registry-reader.js";
import type { NativePluginActivator } from "../../../tools/domain/ports/native-plugin-activator.js";
import { getToolConfig, isAiTool, nativeActivationOf } from "../../../tools/domain/registry.js";
import type { DoctorIssue } from "../../domain/doctor.js";
import type { Manifest } from "../../domain/manifest.js";

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
    private readonly hostRegistries: ReadonlyMap<AiToolId, HostPluginRegistryReader> = new Map()
  ) {}

  async execute(options: DoctorRegistrationOptions): Promise<DoctorIssue[]> {
    return [
      ...(await this.checkDeclaredMarketplaces(options)),
      ...(await this.checkNativeRegistrations(options)),
    ];
  }

  private async checkDeclaredMarketplaces(
    options: DoctorRegistrationOptions
  ): Promise<DoctorIssue[]> {
    const { manifest, projectRoot, allowedIds } = options;
    const expected = await this.registry.list(projectRoot);
    if (expected.length === 0) return [];

    const issues: DoctorIssue[] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
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
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
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
      const enabled = answered.refs.get(item.ref);
      if (enabled === undefined) {
        issues.push({
          severity: "error",
          message: `${toolId}'s registry (${answered.location}) does not carry ${item.ref}`,
          fix: "Run `aidd sync` to re-register it.",
        });
      } else if (!enabled) {
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
}
