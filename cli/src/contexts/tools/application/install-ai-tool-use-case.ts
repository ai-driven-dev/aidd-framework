import type { MarketplaceSyncSettingsUseCase } from "../../../application/use-cases/flows/marketplace-sync-settings-use-case.js";
import type { PluginInstallFromMarketplaceUseCase } from "../../../application/use-cases/plugin/plugin-install-from-marketplace-use-case.js";
import { Manifest } from "../../../domain/models/manifest.js";
import type { Plugin } from "../../../domain/models/plugin.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { Logger } from "../../../kernel/ports/logger.js";
import type { AiToolId } from "../../../kernel/tool.js";
import type {
  InstallRuntimeConfigResult,
  InstallRuntimeConfigUseCase,
} from "./install-runtime-config-use-case.js";

export interface InstallAiToolOptions {
  toolId: AiToolId;
  projectRoot: string;
  force: boolean;
  version: string;
  propagatePlugins: boolean;
}

export interface InstallAiToolResult {
  runtimeResult: InstallRuntimeConfigResult;
  propagatedPlugins: string[];
  propagationWarnings: string[];
}

export class InstallAiToolUseCase {
  constructor(
    private readonly installRuntimeConfig: InstallRuntimeConfigUseCase,
    private readonly manifestRepo: ManifestRepository,
    private readonly pluginInstallFromMarketplace: PluginInstallFromMarketplaceUseCase,
    private readonly marketplaceSyncSettings: MarketplaceSyncSettingsUseCase,
    private readonly logger: Logger
  ) {}

  async execute(options: InstallAiToolOptions): Promise<InstallAiToolResult> {
    const { toolId, projectRoot, force, version, propagatePlugins } = options;
    const manifest = (await this.manifestRepo.load()) ?? Manifest.create();
    const runtimeResult = await this.installRuntimeConfig.execute({
      toolId,
      projectRoot,
      manifest,
      force,
      version,
    });
    if (runtimeResult.skipped || !propagatePlugins) {
      return { runtimeResult, propagatedPlugins: [], propagationWarnings: [] };
    }
    return this.propagateAndSync(toolId, projectRoot, runtimeResult);
  }

  private async propagateAndSync(
    toolId: AiToolId,
    projectRoot: string,
    runtimeResult: InstallRuntimeConfigResult
  ): Promise<InstallAiToolResult> {
    const freshManifest = await this.manifestRepo.load();
    if (freshManifest === null) {
      return { runtimeResult, propagatedPlugins: [], propagationWarnings: [] };
    }
    const plugins = this.collectUniquePlugins(
      freshManifest.getInstalledToolIds() as AiToolId[],
      toolId,
      (id) => freshManifest.getPlugins(id)
    );
    const propagated: string[] = [];
    const warnings: string[] = [];
    for (const plugin of plugins) {
      await this.propagatePlugin(plugin, toolId, projectRoot, propagated, warnings);
    }
    if (propagated.length > 0) {
      await this.marketplaceSyncSettings.execute({ projectRoot });
    }
    return { runtimeResult, propagatedPlugins: propagated, propagationWarnings: warnings };
  }

  private collectUniquePlugins(
    allToolIds: AiToolId[],
    excludeToolId: AiToolId,
    getPlugins: (id: AiToolId) => readonly Plugin[]
  ): Plugin[] {
    const seen = new Set<string>();
    const result: Plugin[] = [];
    for (const id of allToolIds) {
      if (id === excludeToolId) continue;
      for (const plugin of getPlugins(id)) {
        if (!seen.has(plugin.name)) {
          seen.add(plugin.name);
          result.push(plugin);
        }
      }
    }
    return result;
  }

  private async propagatePlugin(
    plugin: Plugin,
    toolId: AiToolId,
    projectRoot: string,
    propagated: string[],
    warnings: string[]
  ): Promise<void> {
    if (plugin.marketplace === undefined) {
      this.warnNoMarketplace(plugin.name, toolId, warnings);
      return;
    }
    try {
      await this.pluginInstallFromMarketplace.execute({
        pluginName: plugin.name,
        version: plugin.version,
        fromMarketplace: plugin.marketplace,
        toolIds: [toolId],
        projectRoot,
        interactive: false,
        autoSelect: true,
        replace: true,
        requestedVersionPolicy: "prefer-catalog",
      });
      propagated.push(plugin.name);
    } catch (err) {
      const msg = `Plugin '${plugin.name}' could not be propagated to ${toolId}: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.warn(msg);
      warnings.push(msg);
    }
  }

  private warnNoMarketplace(pluginName: string, toolId: AiToolId, warnings: string[]): void {
    const msg = `Plugin '${pluginName}' has no marketplace — cannot propagate to ${toolId}. Add it manually.`;
    this.logger.warn(msg);
    warnings.push(msg);
  }
}
