import { join } from "node:path";
import type { McpCapability } from "../../../../domain/capabilities/mcp-capability.js";
import { mergeOpencodeMcp } from "../../../../domain/formats/opencode-mcp-merge.js";
import { InstallationFile } from "../../../../domain/models/file.js";
import type { Manifest } from "../../../../domain/models/manifest.js";
import { Plugin } from "../../../../domain/models/plugin.js";
import type { PluginDistribution } from "../../../../domain/models/plugin-distribution.js";
import type { PluginSource } from "../../../../domain/models/plugin-source.js";
import type {
  PluginTranslationSkip,
  ReadonlySkipList,
} from "../../../../domain/models/plugin-translation-skip.js";
import type { AiToolId } from "../../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../../domain/ports/hasher.js";
import type { MarketplaceRegistry } from "../../../../domain/ports/marketplace-registry.js";
import { getToolConfig, isAiTool } from "../../../../domain/tools/registry.js";
import type { EnsureBuiltMarketplaceUseCase } from "../../shared/ensure-built-marketplace-use-case.js";
import {
  isPluginFileAtDesiredState,
  qualifiesForOpencodeMcpMerge,
  resolvePluginBaseDir,
} from "../plugin-helpers.js";
import { ModeBFlatMaterializationTranslator } from "./mode-b-flat-materialization-translator.js";
import type { PluginTranslator } from "./plugin-translator.js";

/**
 * Materializes plugin content by copying the per-target BUILT tree verbatim into the
 * tool's plugin directory — so installed bytes equal `framework build` output. Bypasses
 * the per-file content transform (build already did it). For marketplace-sourced installs
 * only; raw local-path installs fall back to flat materialization.
 *
 * componentPaths is left empty (sync does not propagate built plugins), matching the
 * existing local-marketplace behavior in PluginUpdateUseCase.
 */
export class BuiltTreeMaterializationTranslator implements PluginTranslator {
  readonly mode = "flat" as const;

  constructor(
    private readonly fs: FileWriter & FileReader,
    private readonly hasher: Hasher,
    private readonly homedir: () => string,
    private readonly ensureBuilt: EnsureBuiltMarketplaceUseCase,
    private readonly marketplaceRegistry: MarketplaceRegistry
  ) {}

  async addPlugin(
    dist: PluginDistribution,
    toolId: AiToolId,
    source: PluginSource,
    projectRoot: string,
    manifest: Manifest,
    marketplace: string | undefined,
    docsDir: string,
    previousMcpEntries: ReadonlyMap<string, string> = new Map()
  ): Promise<{ skipped: ReadonlySkipList; written?: number }> {
    const resolved =
      marketplace === undefined ? null : await this.findMarketplace(marketplace, projectRoot);
    if (marketplace === undefined || resolved === null) {
      return this.fallback().addPlugin(
        dist,
        toolId,
        source,
        projectRoot,
        manifest,
        marketplace,
        docsDir,
        previousMcpEntries
      );
    }
    const mode = toolId === "opencode" || toolId === "kilo" ? "flat" : "marketplace";
    const { builtDir } = await this.ensureBuilt.execute({
      projectRoot,
      marketplace: resolved,
      target: toolId,
      mode,
    });
    const files =
      mode === "flat"
        ? await this.readFlatFiles(builtDir, dist.manifest.name, toolId)
        : await this.readBuiltFiles(
            join(builtDir, "plugins", dist.manifest.name),
            dist.manifest.name
          );
    const baseDir =
      mode === "flat" ? projectRoot : resolvePluginBaseDir(toolId, projectRoot, this.homedir);
    const written = await this.writeChangedFiles(files, baseDir);
    const { entries: mcpEntries, skipped: mcpSkipped } = await this.mergeFlatMcp(
      dist,
      toolId,
      projectRoot,
      previousMcpEntries
    );
    manifest.addPlugin(
      toolId,
      Plugin.fromDistributionWithMcp(dist, source, files, mcpEntries, new Map(), marketplace)
    );
    return { skipped: mcpSkipped, written };
  }

  // Verbatim-copies the built subtree, but skips files already matching the built
  // content on disk so a no-op restore reports (and performs) zero writes.
  private async writeChangedFiles(files: InstallationFile[], baseDir: string): Promise<number> {
    let written = 0;
    for (const f of files) {
      const outputPath = join(baseDir, f.relativePath);
      if (await isPluginFileAtDesiredState(this.fs, this.hasher, outputPath, f.hash.value)) {
        continue;
      }
      await this.fs.writeFile(outputPath, f.content);
      written++;
    }
    return written;
  }

  // Marketplace build emits plugins/<name>/<rel>; user-scope tools install at
  // <baseDir>/<name>/<rel>, so the manifest relativePath keeps the <name>/ prefix.
  private async readBuiltFiles(pluginSrc: string, name: string): Promise<InstallationFile[]> {
    const absPaths = await this.fs.listFilesRecursive(pluginSrc);
    return Promise.all(
      absPaths.map(async (abs) => {
        const rel = abs.slice(pluginSrc.length + 1);
        const content = await this.fs.readFile(abs);
        return new InstallationFile({
          relativePath: join(name, rel),
          content,
          hash: this.hasher.hash(content),
        });
      })
    );
  }

  // Flat build emits the whole marketplace into one workspace, namespaced by
  // .opencode/<section>/<plugin>-<name>/...; install copies only this plugin's files.
  private async readFlatFiles(
    builtDir: string,
    name: string,
    toolId: AiToolId
  ): Promise<InstallationFile[]> {
    const absPaths = await this.fs.listFilesRecursive(builtDir);
    const files: InstallationFile[] = [];
    for (const abs of absPaths) {
      const rel = abs.slice(builtDir.length + 1);
      if (!this.belongsToPlugin(rel, name, toolId)) continue;
      const content = await this.fs.readFile(abs);
      files.push(
        new InstallationFile({ relativePath: rel, content, hash: this.hasher.hash(content) })
      );
    }
    return files;
  }

  private belongsToPlugin(rel: string, name: string, toolId: AiToolId): boolean {
    const segments = rel.split("/");
    const root = toolId === "kilo" ? ".kilo" : ".opencode";
    return segments[0] === root && segments.length >= 3 && segments[2].startsWith(`${name}-`);
  }

  private async mergeFlatMcp(
    dist: PluginDistribution,
    toolId: AiToolId,
    projectRoot: string,
    previousEntries: ReadonlyMap<string, string>
  ): Promise<{ entries: ReadonlyMap<string, string>; skipped: ReadonlySkipList }> {
    const toolConfig = getToolConfig(toolId);
    if (!isAiTool(toolConfig) || dist.components.mcp.length === 0) {
      return { entries: new Map(), skipped: [] };
    }
    const caps = toolConfig.capabilities as Record<string, unknown>;
    if (!qualifiesForOpencodeMcpMerge(caps)) return { entries: new Map(), skipped: [] };
    const mcpCap = caps.mcp as McpCapability;
    const outputPath = join(projectRoot, await mcpCap.resolveOutput(projectRoot, this.fs));
    const existing = await this.readExistingJson(outputPath);
    const transformed = mcpCap.transform(dist.components.mcp[0].content);
    const { mergedContent, contributedEntries, collisions } = mergeOpencodeMcp(
      existing,
      transformed,
      previousEntries,
      this.hasher
    );
    if (contributedEntries.size > 0 || previousEntries.size > 0) {
      await this.fs.writeFile(outputPath, mergedContent);
    }
    return {
      entries: contributedEntries,
      skipped: collisions.map(
        (reason): PluginTranslationSkip => ({
          pluginName: dist.manifest.name,
          component: "mcp",
          toolId,
          reason,
        })
      ),
    };
  }

  private async readExistingJson(path: string): Promise<string | null> {
    try {
      return await this.fs.readFile(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async findMarketplace(name: string, projectRoot: string) {
    const all = await this.marketplaceRegistry.list(projectRoot);
    return all.find((m) => m.name === name) ?? null;
  }

  private fallback(): ModeBFlatMaterializationTranslator {
    return new ModeBFlatMaterializationTranslator(this.fs, this.hasher, this.homedir);
  }
}
