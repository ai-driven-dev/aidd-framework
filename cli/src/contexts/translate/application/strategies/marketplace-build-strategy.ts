import { basename, join, relative } from "node:path";
import type { AssetProvider, SchemaName } from "../../../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { PluginPresence, ToolBuildContract } from "../../../tools/domain/build-contract.js";
import type { JsonSchemaValidator } from "../../../tools/domain/ports/schema-validator.js";
import {
  PLUGIN_AGENT_INPUT_EXT,
  SOURCE_PLUGIN_MANIFEST_RELATIVE,
} from "../../domain/build-target.js";
import { rewritePluginRootToken } from "../../domain/formats/plugin-root-token-rewrite.js";
import { assertNoToolsPlaceholder } from "../shared-plugin-helpers.js";
import type { BuildOutputStrategy, SourceMarketplace } from "./build-output-strategy.js";
import { detectPluginPresenceFlags } from "./plugin-source-tree-reader.js";
import { writeSkillTree } from "./write-skill-tree.js";

export class MarketplaceBuildStrategy implements BuildOutputStrategy {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly jsonSchemaValidator: JsonSchemaValidator,
    private readonly assetProvider: AssetProvider,
    private readonly contract: ToolBuildContract
  ) {}

  async preBuild(outDir: string): Promise<void> {
    await this.fs.deleteDirectory(outDir);
    await this.fs.createDirectory(outDir);
  }

  async writePluginManifest(
    pluginName: string,
    pluginSrc: string,
    outDir: string
  ): Promise<number> {
    if (!this.contract.synthesizeManifest || !this.contract.manifestFileRelative) return 0;
    const raw = await this.fs.readFile(join(pluginSrc, SOURCE_PLUGIN_MANIFEST_RELATIVE));
    const source = JSON.parse(raw) as Record<string, unknown>;
    const presence = await detectPluginPresenceFlags(this.fs, pluginSrc);
    const synthesized = this.contract.synthesizeManifest(source, presence as PluginPresence);
    if (this.contract.manifestSchemaName) {
      this.jsonSchemaValidator.validate(
        this.assetProvider.loadSchema(this.contract.manifestSchemaName),
        synthesized
      );
    }
    const dest = join(outDir, "plugins", pluginName, this.contract.manifestFileRelative);
    await this.fs.writeFile(dest, `${JSON.stringify(synthesized, null, 2)}\n`);
    return 1;
  }

  async writeAgents(pluginName: string, pluginSrc: string, outDir: string): Promise<number> {
    const artifact = this.contract.artifacts.agents;
    if (!artifact.supported) return 0;
    const agentsSrc = join(pluginSrc, "agents");
    if (!(await this.fs.fileExists(agentsSrc))) return 0;
    const files = await this.fs.listFilesRecursive(agentsSrc);
    let count = 0;
    for (const absPath of files) {
      if (!absPath.endsWith(PLUGIN_AGENT_INPUT_EXT)) continue;
      const content = await this.fs.readFile(absPath);
      const agentBaseName = basename(absPath);
      assertNoToolsPlaceholder(content, pluginName, relative(agentsSrc, absPath));
      // path() returns the destination path relative to pluginOut (e.g. "agents/foo.md")
      const destRelPath = artifact.path(pluginName, `agents/${agentBaseName}`);
      const destPath = join(outDir, "plugins", pluginName, destRelPath);
      // transform() receives raw content and returns the final file content
      const outContent = artifact.transform
        ? artifact.transform(content, pluginName, agentBaseName)
        : content;
      await this.fs.writeFile(destPath, outContent);
      count++;
    }
    return count;
  }

  async writeSkills(pluginName: string, pluginSrc: string, outDir: string): Promise<number> {
    const artifact = this.contract.artifacts.skills;
    if (!artifact.supported) return 0;
    const pluginOut = join(outDir, "plugins", pluginName);
    return writeSkillTree(this.fs, pluginName, pluginSrc, pluginOut, artifact.transform);
  }

  async writeHooks(pluginName: string, pluginSrc: string, outDir: string): Promise<number> {
    const artifact = this.contract.artifacts.hooks;
    if (!artifact.supported) return 0;
    const pluginOut = join(outDir, "plugins", pluginName);
    const hooksSrc = join(pluginSrc, "hooks");
    if (!(await this.fs.fileExists(hooksSrc))) return 0;
    const files = await this.fs.listFilesRecursive(hooksSrc);
    let count = 0;
    for (const absPath of files) {
      const relPath = relative(hooksSrc, absPath).replace(/\\/g, "/");
      const destPath = join(pluginOut, "hooks", relPath);
      const content = await this.fs.readFile(absPath);
      const outContent = this.applyPluginRootToken(
        artifact.transform && absPath.endsWith(".json")
          ? artifact.transform(content, pluginName, basename(absPath))
          : content
      );
      await this.fs.writeFile(destPath, outContent);
      count++;
    }
    return count;
  }

  async writeMcp(pluginName: string, pluginSrc: string, outDir: string): Promise<number> {
    const artifact = this.contract.artifacts.mcp;
    if (!artifact.supported) return 0;
    const pluginOut = join(outDir, "plugins", pluginName);
    const mcpSrc = join(pluginSrc, ".mcp.json");
    if (!(await this.fs.fileExists(mcpSrc))) return 0;
    const content = await this.fs.readFile(mcpSrc);
    const transformed = artifact.transform
      ? artifact.transform(content, pluginName, ".mcp.json")
      : content;
    await this.fs.writeFile(join(pluginOut, ".mcp.json"), this.applyPluginRootToken(transformed));
    return 1;
  }

  async postBuild(
    sourceMarketplace: SourceMarketplace,
    builtPlugins: readonly { name: string }[],
    outDir: string
  ): Promise<number> {
    if (!this.contract.buildMarketplaceCatalog || !this.contract.buildMarketplaceEntry) return 0;
    const entries = await this.buildAllEntries(sourceMarketplace, builtPlugins, outDir);
    const { catalog, schemaName, destRelPath } = await this.contract.buildMarketplaceCatalog(
      sourceMarketplace,
      entries,
      this.fs
    );
    if (schemaName) {
      this.jsonSchemaValidator.validate(
        this.assetProvider.loadSchema(schemaName as SchemaName),
        catalog
      );
    }
    await this.fs.writeFile(join(outDir, destRelPath), `${JSON.stringify(catalog, null, 2)}\n`);
    return 1;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private applyPluginRootToken(content: string): string {
    if (!this.contract.pluginRootToken) return content;
    return rewritePluginRootToken(content, this.contract.pluginRootToken);
  }

  private async buildAllEntries(
    sourceMarketplace: SourceMarketplace,
    builtPlugins: readonly { name: string }[],
    outDir: string
  ): Promise<Record<string, unknown>[]> {
    const entries: Record<string, unknown>[] = [];
    for (const built of builtPlugins) {
      const srcEntry = sourceMarketplace.plugins.find((p) => p.name === built.name);
      const pluginSrc = join(outDir, "plugins", built.name);
      if (!this.contract.buildMarketplaceEntry) continue;
      const entry = await this.contract.buildMarketplaceEntry(
        built.name,
        pluginSrc,
        outDir,
        srcEntry,
        this.fs
      );
      entries.push(entry);
    }
    return entries;
  }
}
