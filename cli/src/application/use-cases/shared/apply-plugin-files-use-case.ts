// Called from use-cases/plugin and use-cases/restore.
import { join } from "node:path";
import type { MarketplaceRegistry } from "../../../contexts/distribution/domain/ports/marketplace-registry.js";
import type { PluginFetcher } from "../../../contexts/distribution/domain/ports/plugin-fetcher.js";
import type { ToolConfig } from "../../../contexts/tools/domain/registry.js";
import { PluginContentTranslator } from "../../../contexts/translate/domain/content-translator.js";
import type { PluginDistribution } from "../../../contexts/translate/domain/plugin-distribution.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { Plugin } from "../../../domain/models/plugin.js";
import type { PluginDistributionReader } from "../../../domain/ports/plugin-distribution-reader.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../kernel/ports/hasher.js";
import type { AiToolId } from "../../../kernel/tool.js";
import type { PluginTranslator } from "../framework/translator/plugin-translator.js";
import { resolvePluginTranslator } from "../framework/translator/resolve-plugin-translator.js";
import {
  deleteOldFiles,
  isPluginFileAtDesiredState,
  materializeViaTranslator,
  resolvePluginBaseDir,
} from "../plugin/plugin-helpers.js";
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
    const translator = this.resolveTranslator(options.toolConfig);
    if (translator !== null && options.plugin.marketplace !== undefined) {
      return this.restoreViaTranslator(translator, dist, options);
    }
    return this.restoreViaTranslate(dist, options);
  }

  // Materializing tools (cursor/opencode) must re-materialize from the BUILT tree so
  // restored content + hashes match what install wrote, and Mode A marketplace tools
  // (claude/codex/copilot) must re-register without writing files — not the raw source
  // transform in either case.
  private resolveTranslator(toolConfig: ToolConfig): PluginTranslator | null {
    if (this.builtDeps === undefined) return null;
    return resolvePluginTranslator(toolConfig, {
      fs: this.fs,
      hasher: this.hasher,
      homedir: this.builtDeps.homedir,
      ensureBuilt: this.builtDeps.ensureBuilt,
      marketplaceRegistry: this.builtDeps.marketplaceRegistry,
    });
  }

  private async restoreViaTranslator(
    translator: PluginTranslator,
    dist: PluginDistribution,
    options: ApplyPluginFilesOptions
  ): Promise<number> {
    const { toolId, plugin, projectRoot, manifest, docsDir } = options;
    // Mode A never materializes files, so any manifest-tracked path here is a leftover
    // from a run before that was true (see plugin-update-use-case.ts's unconditional
    // equivalent). Scoped to the manifest's own keys under the plugin's base dir — never
    // a directory scan — so it cannot touch files the plugin never wrote.
    if (translator.mode === "marketplace" && this.builtDeps !== undefined) {
      const baseDir = resolvePluginBaseDir(toolId, projectRoot, this.builtDeps.homedir);
      await deleteOldFiles(plugin.files, baseDir, this.fs);
    }
    return materializeViaTranslator(
      translator,
      dist,
      toolId,
      plugin,
      projectRoot,
      manifest,
      docsDir
    );
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
      if (!(await isPluginFileAtDesiredState(this.fs, this.hasher, outputPath, f.hash.value))) {
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
}
