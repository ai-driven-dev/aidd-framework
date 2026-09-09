import type { PluginSource } from "../../../../../kernel/source.js";
import type { AiToolId } from "../../../../../kernel/tool.js";
import type { PluginDistribution } from "../../../../translate/domain/plugin-distribution.js";
import type { ReadonlySkipList } from "../../../../translate/domain/plugin-translation-skip.js";
import type { Manifest } from "../../../domain/manifest.js";
import { InstalledPlugin } from "../../../domain/plugins/installed-plugin.js";
import { resolveScopeForInstall } from "../../plugin/plugin-target-resolution.js";
import type { PluginTranslator } from "./plugin-translator.js";

/**
 * Mode A — a marketplace registration, for a tool with native marketplace support.
 *
 * Files are NOT materialized on disk: a plugin reference is added to the manifest with an empty
 * files set, and `MarketplaceSyncSettingsUseCase` does the rest — driving the tool's own CLI where
 * `nativeActivation` is declared, writing the enabled-plugins key directly where it is not.
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
