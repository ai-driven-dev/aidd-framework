import type { PluginSource } from "../../../../../kernel/source.js";
import type { AiToolId } from "../../../../../kernel/tool.js";
import type { PluginDistribution } from "../../../../translate/domain/plugin-distribution.js";
import type { ReadonlySkipList } from "../../../../translate/domain/plugin-translation-skip.js";
import type { Manifest } from "../../../domain/manifest.js";
import { InstalledPlugin } from "../../../domain/plugins/installed-plugin.js";
import { resolveScopeForInstall } from "../../plugin/plugin-target-resolution.js";
import type { PluginTranslator } from "./plugin-translator.js";

/**
 * Mode A — Marketplace + plugins.
 *
 * This class is a translator adapter (not a hexagonal port adapter).
 * Used by tools with native marketplace support: Claude, Copilot VSCode, Codex, Cursor.
 *
 * InstalledPlugin files are NOT materialized on disk. Instead, a plugin reference is added to
 * the manifest with an empty files set. MarketplaceSyncSettingsUseCase does the rest: it drives
 * the tool's own CLI to register the marketplace and enable the plugin where `nativeActivation`
 * is declared, writes `MarketplaceSettings.enabledPluginsKey` directly where it isn't, and
 * evicts `extraKnownMarketplaces` from the shared committed file either way once the tool's own
 * CLI owns that registration.
 */
export class ModeAMarketplaceTranslator implements PluginTranslator {
  readonly mode = "marketplace" as const;

  async addPlugin(
    dist: PluginDistribution,
    toolId: AiToolId,
    source: PluginSource,
    _projectRoot: string,
    manifest: Manifest,
    marketplace: string | undefined
  ): Promise<{ skipped: ReadonlySkipList }> {
    manifest.addPlugin(
      toolId,
      InstalledPlugin.fromDistribution(
        dist,
        source,
        [],
        resolveScopeForInstall(toolId),
        new Map(),
        marketplace
      )
    );
    return { skipped: [] };
  }
}
