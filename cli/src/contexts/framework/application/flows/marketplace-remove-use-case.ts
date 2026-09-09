import {
  InvalidMarketplaceNameError,
  MarketplaceNotFoundError,
} from "../../../../kernel/errors.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Prompter } from "../../../../kernel/ports/prompter.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../../kernel/tool.js";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  type Marketplace,
} from "../../../distribution/domain/marketplace.js";
import type { MarketplaceRegistry } from "../../../distribution/domain/ports/marketplace-registry.js";
import type { Manifest } from "../../domain/manifest.js";
import type { InstalledPlugin } from "../../domain/plugins/installed-plugin.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import { deletePluginFilesForTool } from "../plugin/plugin-helpers.js";

export interface MarketplaceRemoveOptions {
  name: string;
  projectRoot: string;
  autoConfirm: boolean;
}

export interface MarketplaceRemoveResult {
  marketplace: Marketplace;
  removedPluginCount: number;
  orphanCount: number;
}

interface OrphanRef {
  toolId: AiToolId;
  plugin: InstalledPlugin;
}

export class MarketplaceRemoveUseCase {
  constructor(
    private readonly fs: FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly registry: MarketplaceRegistry,
    private readonly prompter: Prompter
  ) {}

  async execute(options: MarketplaceRemoveOptions): Promise<MarketplaceRemoveResult> {
    // Machine-scope, shared by every project on this machine: removing it here would orphan the
    // host's own registration for every other project, with no confirmation and no way back short
    // of `aidd setup` running again. It is removed with the framework itself, by `aidd clean`.
    if (options.name === FRAMEWORK_MARKETPLACE_NAME) {
      throw new InvalidMarketplaceNameError(
        `"${FRAMEWORK_MARKETPLACE_NAME}" is shared by every project on this machine and is not removed with \`aidd marketplace remove\` — it is removed with the framework itself, by \`aidd clean\`, once machine scope lands there.`
      );
    }
    const marketplace = await this.findOrThrow(options.projectRoot, options.name);
    const manifest = await this.manifestRepo.load();
    const orphans = manifest ? this.collectOrphans(manifest, options.name) : [];
    const cleanup = await this.shouldCleanup(orphans.length, options.autoConfirm);
    let removed = 0;
    if (cleanup && manifest) {
      removed = await this.removeOrphans(manifest, orphans, options.projectRoot);
    }
    await this.registry.delete(options.projectRoot, marketplace.name, marketplace.scope);
    return { marketplace, removedPluginCount: removed, orphanCount: orphans.length };
  }

  private async findOrThrow(projectRoot: string, name: string): Promise<Marketplace> {
    const list = await this.registry.list(projectRoot);
    const found = list.find((m) => m.name === name);
    if (!found) throw new MarketplaceNotFoundError(name);
    return found;
  }

  private collectOrphans(manifest: Manifest, marketplaceName: string): OrphanRef[] {
    const orphans: OrphanRef[] = [];
    for (const toolId of AI_TOOL_IDS) {
      for (const plugin of manifest.getPlugins(toolId)) {
        if (plugin.marketplace === marketplaceName) orphans.push({ toolId, plugin });
      }
    }
    return orphans;
  }

  private async shouldCleanup(count: number, autoConfirm: boolean): Promise<boolean> {
    if (count === 0) return false;
    if (autoConfirm) return true;
    return this.prompter.confirm(`Remove ${count} plugin(s) installed from this marketplace?`);
  }

  private async removeOrphans(
    manifest: Manifest,
    orphans: readonly OrphanRef[],
    projectRoot: string
  ): Promise<number> {
    for (const { toolId, plugin } of orphans) {
      await deletePluginFilesForTool(plugin.files, plugin.scope, toolId, projectRoot, this.fs);
      manifest.removePlugin(toolId, plugin.name);
    }
    await this.manifestRepo.save(manifest);
    return orphans.length;
  }
}
