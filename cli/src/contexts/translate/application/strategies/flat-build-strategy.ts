import { basename, dirname, join, relative } from "node:path";
import { FlatTargetExistsError, OutDirNotDirectoryError } from "../../../../kernel/errors.js";
import { parseFrontmatter, serializeFrontmatter } from "../../../../kernel/markdown.js";
import { rewriteClaudeRootInJson } from "../../../../kernel/materialization/claude-root-path-rewrite.js";
import { flatMcpKeyPrefix } from "../../../../kernel/materialization/flat-paths.js";
import { rewriteRelativeLinks } from "../../../../kernel/materialization/relative-link-rewrite.js";
import type { AssetProvider } from "../../../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { ArtifactContract, ToolBuildContract } from "../../../tools/domain/build-contract.js";
import type { JsonSchemaValidator } from "../../../tools/domain/ports/schema-validator.js";
import {
  PLUGIN_AGENT_INPUT_EXT,
  PLUGIN_HOOKS_RELATIVE,
  PLUGIN_MCP_RELATIVE,
} from "../../domain/build-target.js";
import { assertNoToolsPlaceholder } from "../shared-plugin-helpers.js";
import type { BuildOutputStrategy, SourceMarketplace } from "./build-output-strategy.js";

export class FlatBuildStrategy implements BuildOutputStrategy {
  private sourceDir = "";

  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly jsonSchemaValidator: JsonSchemaValidator,
    private readonly assetProvider: AssetProvider,
    private readonly contract: ToolBuildContract,
    private readonly force: boolean,
    private readonly absOut: string,
    private readonly isDirectory: (path: string) => Promise<boolean>,
    private readonly logger?: Logger
  ) {}

  async preBuild(outDir: string, sourceDir: string): Promise<void> {
    const exists = await this.fs.fileExists(outDir);
    if (!exists || !(await this.isDirectory(outDir))) throw new OutDirNotDirectoryError(outDir);
    this.sourceDir = sourceDir;
  }

  async writePluginManifest(): Promise<number> {
    return 0; // flat mode has no per-plugin manifest
  }

  async writeAgents(pluginName: string, pluginSrc: string): Promise<number> {
    const artifact = this.contract.artifacts.agents;
    if (!artifact.supported) return 0;
    const agentsSrc = join(pluginSrc, "agents");
    if (!(await this.fs.fileExists(agentsSrc))) return 0;
    const files = await this.fs.listFilesRecursive(agentsSrc);
    let count = 0;
    for (const absPath of files) {
      if (!absPath.endsWith(PLUGIN_AGENT_INPUT_EXT)) continue;
      count += await this.writeFlatAgent(artifact, pluginName, absPath, agentsSrc);
    }
    return count;
  }

  async writeSkills(pluginName: string, pluginSrc: string): Promise<number> {
    const artifact = this.contract.artifacts.skills;
    if (!artifact.supported) return 0;
    const skillsSrc = join(pluginSrc, "skills");
    if (!(await this.fs.fileExists(skillsSrc))) return 0;
    const files = await this.fs.listFilesRecursive(skillsSrc);
    let count = 0;
    for (const absPath of files) {
      count += await this.writeFlatSkill(artifact, pluginName, absPath, skillsSrc);
    }
    return count;
  }

  async writeHooks(pluginName: string, pluginSrc: string): Promise<number> {
    const artifact = this.contract.artifacts.hooks;
    if (!artifact.supported) {
      const hooksSrc = join(pluginSrc, PLUGIN_HOOKS_RELATIVE);
      if (await this.fs.fileExists(hooksSrc)) {
        this.logger?.warn(
          `Skipping hooks/ in plugin '${pluginName}' (hooks not supported for this target).`
        );
      }
      return 0;
    }
    const hooksSrc = join(pluginSrc, PLUGIN_HOOKS_RELATIVE);
    if (!(await this.fs.fileExists(hooksSrc))) return 0;
    const jsonCount = artifact.skipHooksJson
      ? await this.writeHooksBridgeIfDeclared(artifact, pluginName, hooksSrc)
      : await this.writeFlatHooksJson(artifact, pluginName, hooksSrc);
    const scriptCount = await this.writeFlatHooksScripts(artifact, pluginName, pluginSrc);
    return jsonCount + scriptCount;
  }

  async writeMcp(pluginName: string, pluginSrc: string): Promise<number> {
    const artifact = this.contract.artifacts.mcp;
    if (!artifact.supported || !artifact.merge || !artifact.mergeDest) return 0;
    const mcpSrc = join(pluginSrc, PLUGIN_MCP_RELATIVE);
    if (!(await this.fs.fileExists(mcpSrc))) return 0;
    return this.writeFlatMcp(artifact, pluginName, mcpSrc);
  }

  async postBuild(
    _sourceMarketplace: SourceMarketplace,
    builtPlugins: readonly { name: string }[],
    outDir: string
  ): Promise<number> {
    if (!this.contract.emitConfigArtifact) return 0;
    const names = builtPlugins.map((p) => p.name);
    return this.contract.emitConfigArtifact(
      names,
      outDir,
      this.sourceDir,
      this.fs,
      this.jsonSchemaValidator,
      this.assetProvider
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async writeFlatAgent(
    artifact: Extract<ArtifactContract, { supported: true }>,
    pluginName: string,
    absPath: string,
    agentsSrc: string
  ): Promise<number> {
    const agentBaseName = basename(absPath);
    const srcRelPath = `agents/${relative(agentsSrc, absPath).replace(/\\/g, "/")}`;
    const content = await this.fs.readFile(absPath);
    assertNoToolsPlaceholder(content, pluginName, srcRelPath);
    const flatRelPath = artifact.path(pluginName, `agents/${agentBaseName}`);
    const destPath = join(this.absOut, flatRelPath);
    await this.checkCollision(destPath, pluginName);
    const outContent = artifact.transform
      ? artifact.transform(content, pluginName, agentBaseName)
      : this.rewriteAgentForFlat(content, flatRelPath, pluginName);
    await this.fs.writeFile(destPath, outContent);
    return 1;
  }

  private rewriteAgentForFlat(content: string, flatRelPath: string, pluginName: string): string {
    const { frontmatter, body } = parseFrontmatter(content);
    const rewrittenBody = rewriteRelativeLinks(body, {
      currentFilePluginRelative: flatRelPath,
      resolveTargetPath: (rel) => this.resolveTargetForMd(pluginName, rel),
    });
    return serializeFrontmatter(frontmatter, rewrittenBody);
  }

  private async writeFlatSkill(
    artifact: Extract<ArtifactContract, { supported: true }>,
    pluginName: string,
    absPath: string,
    skillsSrc: string
  ): Promise<number> {
    const relFromSkills = relative(skillsSrc, absPath).replace(/\\/g, "/");
    const flatRelPath = artifact.path(pluginName, `skills/${relFromSkills}`);
    const destPath = join(this.absOut, flatRelPath);
    await this.checkCollision(destPath, pluginName);
    const content = await this.fs.readFile(absPath);
    if (!absPath.endsWith(".md")) {
      await this.fs.writeFile(destPath, content);
      return 1;
    }
    assertNoToolsPlaceholder(content, pluginName, relFromSkills);
    const rewritten = rewriteRelativeLinks(content, {
      currentFilePluginRelative: flatRelPath,
      resolveTargetPath: (rel) => this.resolveTargetForMd(pluginName, rel),
    });
    const outContent =
      artifact.rewriteSkillName && basename(absPath) === "SKILL.md"
        ? this.rewriteSkillNameFrontmatter(rewritten, flatRelPath)
        : rewritten;
    await this.fs.writeFile(destPath, outContent);
    return 1;
  }

  private rewriteSkillNameFrontmatter(content: string, flatRelPath: string): string {
    const { frontmatter, body } = parseFrontmatter(content);
    const parts = flatRelPath.split("/");
    const skillFolder = parts[parts.length - 2];
    if (!skillFolder) return content;
    return serializeFrontmatter({ ...frontmatter, name: skillFolder }, body);
  }

  private async writeFlatHooksJson(
    artifact: Extract<ArtifactContract, { supported: true }>,
    pluginName: string,
    hooksSrc: string
  ): Promise<number> {
    const raw = await this.fs.readFile(hooksSrc);
    if (artifact.hooksMerge && artifact.hooksMergeDest) {
      return this.writeMergedHooksJson(artifact, pluginName, raw);
    }
    return this.writeRewrittenHooksJson(artifact, pluginName, raw);
  }

  // OpenCode reads no hooks.json (artifact.skipHooksJson) - a plugin's declared hooks have
  // no trigger there unless a generated bridge replaces the manifest a native host would
  // read. Raw content only: the bridge resolves its own scripts from its own
  // `import.meta.url`, never from an outDir-relative path this strategy would otherwise
  // rewrite for it.
  private async writeHooksBridgeIfDeclared(
    artifact: Extract<ArtifactContract, { supported: true }>,
    pluginName: string,
    hooksSrc: string
  ): Promise<number> {
    const bridge = artifact.hooksBridge;
    if (!bridge) return 0;
    const skipEntry = join(dirname(hooksSrc), bridge.skipIfSourceHas);
    if (await this.fs.fileExists(skipEntry)) return 0;
    const raw = await this.fs.readFile(hooksSrc);
    const generated = bridge.generate(raw, pluginName);
    if (generated === null) return 0;
    const destPath = join(this.absOut, bridge.path(pluginName));
    await this.checkCollision(destPath, pluginName);
    await this.fs.writeFile(destPath, generated);
    return 1;
  }

  private async writeMergedHooksJson(
    artifact: Extract<ArtifactContract, { supported: true }>,
    pluginName: string,
    raw: string
  ): Promise<number> {
    if (!artifact.hooksMerge || !artifact.hooksMergeDest) return 0;
    const rewritten = this.rewriteHooksRawPaths(raw, pluginName);
    const destPath = artifact.hooksMergeDest(this.absOut);
    const existing = (await this.fs.fileExists(destPath)) ? await this.fs.readFile(destPath) : null;
    const { content, warnings } = artifact.hooksMerge(existing, rewritten);
    for (const w of warnings) this.logger?.warn(w);
    await this.fs.writeFile(destPath, content);
    return 1;
  }

  private rewriteHooksRawPaths(raw: string, pluginName: string): string {
    const parsed = JSON.parse(raw) as unknown;
    const rewritten = rewriteClaudeRootInJson(parsed, (suffix) =>
      this.resolveClaudeRootRelative(suffix, pluginName)
    );
    return JSON.stringify(rewritten);
  }

  private async writeRewrittenHooksJson(
    artifact: Extract<ArtifactContract, { supported: true }>,
    pluginName: string,
    raw: string
  ): Promise<number> {
    const parsed = JSON.parse(raw) as unknown;
    const rewritten = rewriteClaudeRootInJson(parsed, (suffix) =>
      this.resolveClaudeRootRelative(suffix, pluginName)
    );
    const rewrittenJson = `${JSON.stringify(rewritten, null, 2)}\n`;
    const finalContent = artifact.hooksTransform
      ? artifact.hooksTransform(rewrittenJson)
      : rewrittenJson;
    const destPath = join(this.absOut, artifact.path(pluginName, `hooks/${pluginName}.hooks.json`));
    await this.checkCollision(destPath, pluginName);
    await this.fs.writeFile(destPath, finalContent);
    return 1;
  }

  private async writeFlatHooksScripts(
    artifact: Extract<ArtifactContract, { supported: true }>,
    pluginName: string,
    pluginSrc: string
  ): Promise<number> {
    const hooksDir = join(pluginSrc, "hooks");
    const files = await this.fs.listFilesRecursive(hooksDir);
    let count = 0;
    for (const absPath of files) {
      if (absPath.endsWith("hooks.json")) continue;
      const relPath = relative(hooksDir, absPath).replace(/\\/g, "/");
      const destPath = join(this.absOut, artifact.path(pluginName, `hooks/${relPath}`));
      await this.checkCollision(destPath, pluginName);
      await this.fs.writeFile(destPath, await this.fs.readFile(absPath));
      count++;
    }
    return count;
  }

  private async writeFlatMcp(
    artifact: Extract<ArtifactContract, { supported: true }>,
    pluginName: string,
    mcpSrc: string
  ): Promise<number> {
    const raw = await this.fs.readFile(mcpSrc);
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    const rawServers = parsed.mcpServers ?? {};
    const prefix = flatMcpKeyPrefix(pluginName);
    const prefixed = this.prefixAndRewriteServers(rawServers, prefix, pluginName);
    if (!artifact.merge || !artifact.mergeDest) return 0;
    const mcpDest = artifact.mergeDest(this.absOut);
    const existingContent = (await this.fs.fileExists(mcpDest))
      ? await this.fs.readFile(mcpDest)
      : null;
    const { mergedContent, collisions } = artifact.merge(existingContent, prefixed, this.force);
    if (collisions.length > 0) throw new FlatTargetExistsError(mcpDest, pluginName);
    await this.fs.writeFile(mcpDest, mergedContent);
    return 1;
  }

  private prefixAndRewriteServers(
    rawServers: Record<string, unknown>,
    prefix: string,
    pluginName: string
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawServers)) {
      const rewritten = rewriteClaudeRootInJson(value, (suffix) =>
        this.resolveClaudeRootAbsolute(suffix, pluginName)
      );
      result[`${prefix}${key}`] = rewritten;
    }
    return result;
  }

  private resolveClaudeRootRelative(suffix: string, pluginName: string): string {
    return `./${this.resolveSuffixToFlatPath(suffix, pluginName)}`;
  }

  // "/"-joined and separator-normalized: this value is embedded into written JSON content
  // (an MCP server command, a rewritten CLAUDE_PLUGIN_ROOT), and on Windows this.absOut is
  // backslash-native - JSON.stringify then escapes each backslash, so a reader comparing
  // against the plain absOut string never finds it as a substring.
  private resolveClaudeRootAbsolute(suffix: string, pluginName: string): string {
    const normalizedOut = this.absOut.replace(/\\/g, "/");
    return `${normalizedOut}/${this.resolveSuffixToFlatPath(suffix, pluginName)}`;
  }

  private resolveSuffixToFlatPath(suffix: string, pluginName: string): string {
    const art = this.contract.artifacts;
    if (suffix.startsWith("agents/") && art.agents.supported) {
      const rest = suffix.slice("agents/".length);
      const withoutMd = rest.endsWith(".md") ? rest.slice(0, -3) : rest;
      const ext = art.agents.ext ?? ".agent.md";
      return art.agents.path(pluginName, `agents/${withoutMd}${ext}`);
    }
    if (suffix.startsWith("skills/") && art.skills.supported) {
      return art.skills.path(pluginName, `skills/${suffix.slice("skills/".length)}`);
    }
    if (suffix.startsWith("hooks/") && art.hooks.supported) {
      return art.hooks.path(pluginName, `hooks/${suffix.slice("hooks/".length)}`);
    }
    return suffix;
  }

  private async checkCollision(destPath: string, pluginName: string): Promise<void> {
    if (!this.force && (await this.fs.fileExists(destPath))) {
      throw new FlatTargetExistsError(destPath, pluginName);
    }
  }

  private resolveTargetForMd(pluginName: string, pluginRelPath: string): string {
    const art = this.contract.artifacts;
    if (pluginRelPath.startsWith("agents/") && art.agents.supported) {
      return art.agents.path(pluginName, pluginRelPath);
    }
    if (pluginRelPath.startsWith("skills/") && art.skills.supported) {
      return art.skills.path(pluginName, pluginRelPath);
    }
    return pluginRelPath;
  }
}
