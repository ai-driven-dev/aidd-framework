import { join } from "node:path";
import type { MarketplaceSettings } from "../../../domain/capabilities/marketplace-settings.js";
import type { DoctorIssue } from "../../../domain/models/doctor.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { ToolId } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { MarketplaceRegistry } from "../../../domain/ports/marketplace-registry.js";
import { getToolConfig, isAiTool } from "../../../domain/tools/registry.js";

export interface DoctorRegistrationOptions {
  manifest: Manifest;
  projectRoot: string;
  allowedIds: Set<string> | null;
}

/**
 * Checks the registrations the CLI writes but does not track.
 *
 * A tracked file announces its own damage: its hash stops matching. The file holding
 * a tool's marketplace registrations carries absolute paths, so it is deliberately
 * left untracked — which means nothing else would notice it being emptied, edited, or
 * deleted. This is what notices.
 */
export class DoctorRegistrationUseCase {
  constructor(
    private readonly fs: FileReader,
    private readonly registry: MarketplaceRegistry
  ) {}

  async execute(options: DoctorRegistrationOptions): Promise<DoctorIssue[]> {
    const { manifest, projectRoot, allowedIds } = options;
    const expected = await this.registry.list(projectRoot);
    if (expected.length === 0) return [];

    const issues: DoctorIssue[] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      if (allowedIds && !allowedIds.has(toolId)) continue;
      const settings = this.untrackedSettingsOf(toolId);
      if (settings === undefined) continue;
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

  private untrackedSettingsOf(
    toolId: ToolId
  ): (MarketplaceSettings & { marketplacesSettingsPath: string }) | undefined {
    const config = getToolConfig(toolId);
    if (config === undefined || !isAiTool(config)) return undefined;
    const caps = config.capabilities as {
      plugins?: { marketplaceSettings?: MarketplaceSettings | null };
    };
    const settings = caps.plugins?.marketplaceSettings;
    // `undefined` keeps the registrations in the tracked file, which reports its own
    // damage; `null` means the tool writes none at all. Neither leaves anything here
    // to check — only a declared path does.
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
}
