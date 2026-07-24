import { Manifest } from "../../../domain/models/manifest.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { VersionReader } from "../../../domain/ports/version-reader.js";
import type { ToolId } from "../../../domain/tools/registry.js";
import type { MarketplaceRefreshUseCase } from "../marketplace/marketplace-refresh-use-case.js";
import type { PluginUpdateUseCase } from "../plugin/plugin-update-use-case.js";
import { BulkConflictState } from "../shared/resolve-update-decision-use-case.js";
import type {
  GlobalExecutionError,
  UpdateOneToolUseCase,
} from "../shared/update-one-tool-use-case.js";

export type { GlobalExecutionError };

export interface UpdateAllInput {
  projectRoot: string;
  userForce: boolean;
  interactive: boolean;
}

export interface UpdateAllResult {
  updatedTools: { toolId: ToolId; fileCount: number }[];
  updatedPlugins: string[];
  marketplaceRefreshFailed: boolean;
  errors: GlobalExecutionError[];
}

export class UpdateAllUseCase {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly versionReader: VersionReader,
    private readonly pluginUpdateUseCase: PluginUpdateUseCase,
    private readonly marketplaceRefreshUseCase: MarketplaceRefreshUseCase,
    private readonly updateOneToolUseCase: UpdateOneToolUseCase
  ) {}

  async execute(input: UpdateAllInput): Promise<UpdateAllResult> {
    const { projectRoot, userForce, interactive } = input;
    const manifest = (await this.manifestRepo.load()) ?? Manifest.create();
    const version = this.versionReader.get();
    const errors: GlobalExecutionError[] = [];
    const bulkState = new BulkConflictState();
    const updatedTools = await this.updateTools(manifest, projectRoot, version, errors, {
      userForce,
      interactive,
      bulkState,
    });
    const updatedPlugins = await this.updatePlugins(projectRoot, errors);
    const marketplaceRefreshFailed = await this.refreshMarketplaces(projectRoot, errors);
    return { updatedTools, updatedPlugins, marketplaceRefreshFailed, errors };
  }

  private async updateTools(
    manifest: Manifest,
    projectRoot: string,
    version: string,
    errors: GlobalExecutionError[],
    options: { userForce: boolean; interactive: boolean; bulkState: BulkConflictState }
  ): Promise<{ toolId: ToolId; fileCount: number }[]> {
    const updated: { toolId: ToolId; fileCount: number }[] = [];
    for (const toolId of manifest.getInstalledToolIds()) {
      const entry = await this.updateOneToolUseCase.execute(
        toolId,
        manifest,
        projectRoot,
        version,
        errors,
        options
      );
      if (entry) updated.push(entry);
    }
    return updated;
  }

  private async updatePlugins(
    projectRoot: string,
    errors: GlobalExecutionError[]
  ): Promise<string[]> {
    try {
      return await this.pluginUpdateUseCase.execute({ toolIds: "all", projectRoot });
    } catch (err) {
      errors.push({ scope: "plugins", message: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  private async refreshMarketplaces(
    projectRoot: string,
    errors: GlobalExecutionError[]
  ): Promise<boolean> {
    try {
      const { failedCount } = await this.marketplaceRefreshUseCase.execute({ projectRoot });
      return failedCount > 0;
    } catch (err) {
      errors.push({
        scope: "marketplace-refresh",
        message: err instanceof Error ? err.message : String(err),
      });
      return true;
    }
  }
}
