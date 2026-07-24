import { join } from "node:path";
import type { PluginsCapability } from "../../../domain/capabilities/plugins-capability.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { Plugin } from "../../../domain/models/plugin.js";
import { PluginContentTranslator } from "../../../domain/models/plugin-content-translator.js";
import type { PluginDistribution } from "../../../domain/models/plugin-distribution.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { MarketplaceRegistry } from "../../../domain/ports/marketplace-registry.js";
import type { PluginDistributionReader } from "../../../domain/ports/plugin-distribution-reader.js";
import type { PluginFetcher } from "../../../domain/ports/plugin-fetcher.js";
import { isAiTool, type ToolConfig } from "../../../domain/tools/registry.js";
import { BuiltTreeMaterializationTranslator } from "../plugin/translator/built-tree-materialization-translator.js";
import { resolveTranslator } from "../plugin/translator/plugin-translator-factory.js";
import type { EnsureBuiltMarketplaceUseCase } from "./ensure-built-marketplace-use-case.js";

interface ApplyPluginFilesOptions {
  toolId: AiToolId;
  plugin: Plugin;
  toolConfig: ToolConfig;
  projectRoot: string;
  cacheDir: string;
  manifest: Manifest;
  docsDir: string;
  fileFilter?: ((relativePath: string) => boolean) | null;
}

/** Optional deps that let restore re-materialize via the build pipeline (parity with install). */
export interface BuiltMaterializationDeps {
  ensureBuilt: EnsureBuiltMarketplaceUseCase;
  marketplaceRegistry: MarketplaceRegistry;
  homedir: () => string;
}

export class ApplyPluginFilesUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly hasher: Hasher,
    private readonly pluginFetcher: PluginFetcher,
    private readonly pluginDistributionReader: PluginDistributionReader,
    private readonly builtDeps?: BuiltMaterializationDeps
  ) {}

  async execute(options: ApplyPluginFilesOptions): Promise<number> {
    const localPath = await this.pluginFetcher.fetch(options.plugin.source, options.cacheDir);
    const dist = await this.pluginDistributionReader.read(localPath);
    const builtTree = this.builtTreeTranslator(options.toolConfig);
    if (builtTree !== null && options.plugin.marketplace !== undefined) {
      return this.restoreViaBuiltTree(builtTree, dist, options);
    }
    return this.restoreViaTranslate(dist, options);
  }

  // Materializing tools (cursor/opencode) must re-materialize from the BUILT tree so
  // restored content + hashes match what install wrote — not the raw source transform.
  private builtTreeTranslator(toolConfig: ToolConfig): BuiltTreeMaterializationTranslator | null {
    if (this.builtDeps === undefined || !isAiTool(toolConfig)) return null;
    const caps = toolConfig.capabilities as { plugins?: PluginsCapability };
    if (caps.plugins === undefined) return null;
    const translator = resolveTranslator(caps.plugins, {
      fs: this.fs,
      hasher: this.hasher,
      homedir: this.builtDeps.homedir,
      ensureBuilt: this.builtDeps.ensureBuilt,
      marketplaceRegistry: this.builtDeps.marketplaceRegistry,
    });
    return translator instanceof BuiltTreeMaterializationTranslator ? translator : null;
  }

  private async restoreViaBuiltTree(
    translator: BuiltTreeMaterializationTranslator,
    dist: PluginDistribution,
    options: ApplyPluginFilesOptions
  ): Promise<number> {
    const { toolId, plugin, projectRoot, manifest, docsDir } = options;
    manifest.removePlugin(toolId, plugin.name);
    await translator.addPlugin(
      dist,
      toolId,
      plugin.source,
      projectRoot,
      manifest,
      plugin.marketplace,
      docsDir
    );
    return manifest.getPlugins(toolId).find((p) => p.name === plugin.name)?.files.size ?? 0;
  }

  private async restoreViaTranslate(
    dist: PluginDistribution,
    options: ApplyPluginFilesOptions
  ): Promise<number> {
    const { toolId, plugin, toolConfig, projectRoot, manifest, docsDir, fileFilter } = options;
    const files = new PluginContentTranslator(this.hasher).translate(dist, toolConfig, docsDir);
    let restored = 0;
    for (const f of files) {
      if (fileFilter !== null && fileFilter !== undefined && !fileFilter(f.relativePath)) continue;
      const outputPath = join(projectRoot, f.relativePath);
      if (!(await this.isFileAtDesiredState(outputPath, f.hash.value))) {
        await this.fs.writeFile(outputPath, f.content);
        restored++;
      }
    }
    manifest.updatePlugin(
      toolId,
      plugin.withFiles(new Map(files.map((f) => [f.relativePath, f.hash.value])))
    );
    return restored;
  }

  private async isFileAtDesiredState(
    outputPath: string,
    expectedHashValue: string
  ): Promise<boolean> {
    if (!(await this.fs.fileExists(outputPath))) return false;
    const content = await this.fs.readFile(outputPath);
    return this.hasher.hash(content).value === expectedHashValue;
  }
}
