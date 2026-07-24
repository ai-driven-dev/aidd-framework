import { join } from "node:path";
import { McpCapability } from "../../../../domain/capabilities/mcp-capability.js";
import type { PluginsCapability } from "../../../../domain/capabilities/plugins-capability.js";
import { CursorProjectScopeUnsupportedError } from "../../../../domain/errors.js";
import { mergeOpencodeMcp } from "../../../../domain/formats/opencode-mcp-merge.js";
import type { InstallationFile } from "../../../../domain/models/file.js";
import type { Manifest } from "../../../../domain/models/manifest.js";
import { Plugin } from "../../../../domain/models/plugin.js";
import { PluginContentTranslator } from "../../../../domain/models/plugin-content-translator.js";
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
import { getToolConfig, isAiTool } from "../../../../domain/tools/registry.js";
import { writePluginFiles } from "../plugin-helpers.js";
import type { PluginTranslator } from "./plugin-translator.js";

/**
 * Mode B — Flat materialization.
 *
 * This class is a translator adapter (not a hexagonal port adapter).
 * Materializes plugin content directly into the tool's plugin directory as files on disk.
 * Used by tools without native marketplace support: OpenCode, Cursor (user-scope).
 */
export class ModeBFlatMaterializationTranslator implements PluginTranslator {
  readonly mode = "flat" as const;

  constructor(
    private readonly fs: FileWriter & FileReader,
    private readonly hasher: Hasher,
    private readonly homedir: () => string
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
  ): Promise<{ skipped: ReadonlySkipList }> {
    const ctx = this.resolveFlatToolContext(toolId, dist, docsDir, projectRoot);
    if (ctx === null) return { skipped: [] };
    const mcp = await this.resolveMcp(dist, toolId, projectRoot, previousMcpEntries);
    const allSkipped: ReadonlySkipList = [...ctx.skipped, ...mcp.mcpSkips];
    if (ctx.files.length === 0 && mcp.mcpEntries.size === 0) return { skipped: allSkipped };
    await this.writeAndRegisterPlugin(
      dist,
      toolId,
      source,
      ctx.files,
      mcp.mcpEntries,
      ctx.componentPaths,
      marketplace,
      ctx.baseDir,
      manifest
    );
    return { skipped: allSkipped };
  }

  private resolveFlatToolContext(
    toolId: AiToolId,
    dist: PluginDistribution,
    docsDir: string,
    projectRoot: string
  ): {
    caps: Record<string, unknown>;
    files: InstallationFile[];
    componentPaths: ReadonlyMap<string, string>;
    skipped: ReadonlySkipList;
    baseDir: string;
  } | null {
    const toolConfig = getToolConfig(toolId);
    if (!isAiTool(toolConfig)) return null;
    const caps = toolConfig.capabilities as Record<string, unknown>;
    const pluginsCap = caps.plugins as PluginsCapability;
    if (pluginsCap.mode === "native" && pluginsCap.installScope !== "user") {
      throw new CursorProjectScopeUnsupportedError();
    }
    const { files, componentPaths, skipped } = new PluginContentTranslator(
      this.hasher
    ).translateWithComponentPaths(dist, toolConfig, docsDir);
    const baseDir = this.resolveBaseDir(pluginsCap, projectRoot);
    return { caps, files, componentPaths, skipped, baseDir };
  }

  private async resolveMcp(
    dist: PluginDistribution,
    toolId: AiToolId,
    projectRoot: string,
    previousMcpEntries: ReadonlyMap<string, string>
  ): Promise<{ mcpEntries: ReadonlyMap<string, string>; mcpSkips: ReadonlySkipList }> {
    const toolConfig = getToolConfig(toolId);
    if (!isAiTool(toolConfig)) return { mcpEntries: new Map(), mcpSkips: [] };
    const caps = toolConfig.capabilities as Record<string, unknown>;
    if (!this.qualifiesForOpencodeMcpMerge(caps) || dist.components.mcp.length === 0) {
      return { mcpEntries: new Map(), mcpSkips: [] };
    }
    return this.mergeOpencodeMcpEntries(dist, caps, projectRoot, previousMcpEntries, toolId);
  }

  private async writeAndRegisterPlugin(
    dist: PluginDistribution,
    toolId: AiToolId,
    source: PluginSource,
    files: InstallationFile[],
    mcpEntries: ReadonlyMap<string, string>,
    componentPaths: ReadonlyMap<string, string>,
    marketplace: string | undefined,
    baseDir: string,
    manifest: Manifest
  ): Promise<void> {
    if (files.length > 0) await writePluginFiles(files, baseDir, this.fs);
    const plugin = Plugin.fromDistributionWithMcp(
      dist,
      source,
      files,
      mcpEntries,
      componentPaths,
      marketplace
    );
    manifest.addPlugin(toolId, plugin);
  }

  private qualifiesForOpencodeMcpMerge(caps: Record<string, unknown>): boolean {
    if (!("mcp" in caps)) return false;
    const mcp = caps.mcp;
    if (!(mcp instanceof McpCapability)) return false;
    if (mcp.params.mergeStrategy !== "framework-prime") return false;
    const plugins = caps.plugins as PluginsCapability;
    return plugins.mode === "flat";
  }

  private async mergeOpencodeMcpEntries(
    dist: PluginDistribution,
    caps: Record<string, unknown>,
    projectRoot: string,
    previousMcpEntries: ReadonlyMap<string, string>,
    toolId: AiToolId
  ): Promise<{ mcpEntries: ReadonlyMap<string, string>; mcpSkips: ReadonlySkipList }> {
    const mcpCap = caps.mcp as McpCapability;
    const outputRelPath = await mcpCap.resolveOutput(projectRoot, this.fs);
    const outputPath = join(projectRoot, outputRelPath);
    const existingContent = await this.readExistingJson(outputPath);
    const rawMcp = dist.components.mcp[0].content;
    const transformed = mcpCap.transform(rawMcp);
    const { mergedContent, contributedEntries, collisions } = mergeOpencodeMcp(
      existingContent,
      transformed,
      previousMcpEntries,
      this.hasher
    );
    if (contributedEntries.size > 0 || previousMcpEntries.size > 0) {
      await this.fs.writeFile(outputPath, mergedContent);
    }
    const mcpSkips = this.collisionsToSkips(collisions, dist.manifest.name, toolId);
    return { mcpEntries: contributedEntries, mcpSkips };
  }

  private collisionsToSkips(
    collisions: ReadonlyArray<string>,
    pluginName: string,
    toolId: AiToolId
  ): ReadonlySkipList {
    return collisions.map(
      (reason): PluginTranslationSkip => ({
        pluginName,
        component: "mcp",
        toolId,
        reason,
      })
    );
  }

  private async readExistingJson(path: string): Promise<string | null> {
    try {
      return await this.fs.readFile(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private resolveBaseDir(
    plugins: { resolvePluginsBaseDir: (projectRoot: string, homedir: string) => string },
    projectRoot: string
  ): string {
    return plugins.resolvePluginsBaseDir(projectRoot, this.homedir());
  }
}
