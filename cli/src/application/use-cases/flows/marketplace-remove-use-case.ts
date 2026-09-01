import { dirname, join } from "node:path";
import { MarketplaceNotFoundError } from "../../../domain/errors.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { Marketplace } from "../../../domain/models/marketplace.js";
import type { Plugin } from "../../../domain/models/plugin.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { MarketplaceRegistry } from "../../../domain/ports/marketplace-registry.js";
import type { Prompter } from "../../../domain/ports/prompter.js";

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
  plugin: Plugin;
}

export class MarketplaceRemoveUseCase {
  constructor(
    private readonly fs: FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly registry: MarketplaceRegistry,
    private readonly prompter: Prompter
  ) {}

  async execute(options: MarketplaceRemoveOptions): Promise<MarketplaceRemoveResult> {
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
      await this.deletePluginFiles(plugin.files, projectRoot);
      manifest.removePlugin(toolId, plugin.name);
    }
    await this.manifestRepo.save(manifest);
    return orphans.length;
  }

  private async deletePluginFiles(
    files: ReadonlyMap<string, string>,
    projectRoot: string
  ): Promise<void> {
    for (const relativePath of files.keys()) {
      const fullPath = join(projectRoot, relativePath);
      await this.fs.deleteFile(fullPath);
      await this.fs.deleteEmptyDirectories(dirname(fullPath));
    }
  }
}
