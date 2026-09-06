import { convertHooksFormat } from "../formats/cursor-hooks.js";
import { flatHooksSharedDirPath } from "../formats/flat-paths.js";
import { parseFrontmatter, serializeFrontmatter } from "../formats/markdown.js";
import { rewritePluginRootToken } from "../formats/plugin-root-token-rewrite.js";
import type { Hasher } from "../ports/hasher.js";
import type { AiTool, HasAgents, HasCommands, HasPlugins, HasSkills } from "../tools/contracts.js";
import { hasRules } from "../tools/contracts.js";
import type { ToolConfig } from "../tools/registry.js";
import { isAiTool } from "../tools/registry.js";
import { InstallationFile } from "./file.js";
import type { PluginComponentFile, PluginDistribution } from "./plugin-distribution.js";
import type { PluginInstallNotice, ReadonlyNoticeList } from "./plugin-install-notice.js";
import type { PluginTranslationSkip, ReadonlySkipList } from "./plugin-translation-skip.js";

const PLUGIN_MANIFEST_PATHS: readonly string[] = [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "plugin.json",
];

interface TranslatedFile {
  relativePath: string;
  content: string;
  /** An artefact, not prose: copied byte for byte, with no frontmatter round-trip and no
   * path rewriting. A skill's `scripts/` and a hook's `lib/` hold executable files, and
   * rewriting a path inside one silently corrupts it — measured: Codex's and Copilot's
   * rewrites change a bundled script by six and one bytes respectively, which is a file
   * that no longer parses. Prose is translated; artefacts are carried. */
  verbatim?: true;
}

interface MarkdownCap {
  buildInstallPath: (fileName: string) => string | null;
  convertFrontmatter: (fm: Record<string, unknown>, fileName: string) => Record<string, unknown>;
  serialize: (fm: Record<string, unknown>, body: string) => string;
}

interface SkillCap {
  convertFrontmatter: (fm: Record<string, unknown>) => Record<string, unknown>;
  serialize: (fm: Record<string, unknown>, body: string) => string;
}

const PLUGIN_HOOKS_DIR = "hooks";
const MARKDOWN_EXTENSION = ".md";

function parentDirOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

// A hook script requires its siblings relative to itself, so the tree below hooks/ has to
// survive translation intact; flattening it breaks every such require.
function pathBelow(dir: string, path: string): string {
  return path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : path;
}

export class PluginContentTranslator {
  constructor(private readonly hasher: Hasher) {}

  translate(dist: PluginDistribution, toolConfig: ToolConfig, docsDir: string): InstallationFile[] {
    return this.translateWithComponentPaths(dist, toolConfig, docsDir).files;
  }

  translateWithComponentPaths(
    dist: PluginDistribution,
    toolConfig: ToolConfig,
    docsDir: string
  ): {
    files: InstallationFile[];
    componentPaths: ReadonlyMap<string, string>;
    skipped: ReadonlySkipList;
    notices: ReadonlyNoticeList;
  } {
    const tool = asPluginTool(toolConfig);
    if (tool === null) return { files: [], componentPaths: new Map(), skipped: [], notices: [] };
    const { mode } = tool.capabilities.plugins;
    if (mode === "native") return this.translateNativeWithPaths(dist, tool, docsDir);
    if (mode === "flat") {
      const { files, skipped } = this.translateFlat(dist, tool, docsDir);
      return { files, componentPaths: new Map(), skipped, notices: [] };
    }
    return { files: [], componentPaths: new Map(), skipped: [], notices: [] };
  }

  detectFlatCollisions(
    dists: PluginDistribution[],
    toolConfig: ToolConfig
  ): Array<{ plugin: string; path: string }> {
    const tool = asPluginTool(toolConfig);
    if (tool === null) return [];
    if (tool.capabilities.plugins.mode !== "flat") return [];
    const seen = new Map<string, string>();
    const collisions: Array<{ plugin: string; path: string }> = [];
    for (const dist of dists) {
      for (const file of this.translate(dist, toolConfig, "")) {
        if (seen.has(file.relativePath)) {
          collisions.push({ plugin: dist.manifest.name, path: file.relativePath });
        } else {
          seen.set(file.relativePath, dist.manifest.name);
        }
      }
    }
    return collisions;
  }

  private translateNativeWithPaths(
    dist: PluginDistribution,
    tool: AiTool<HasPlugins>,
    docsDir: string
  ): {
    files: InstallationFile[];
    componentPaths: ReadonlyMap<string, string>;
    skipped: ReadonlySkipList;
    notices: ReadonlyNoticeList;
  } {
    const { pluginsDir } = tool.capabilities.plugins;
    if (pluginsDir === null) {
      return { files: [], componentPaths: new Map(), skipped: [], notices: [] };
    }
    const pluginRoot = `${pluginsDir}${dist.manifest.name}/`;
    const { files, componentPaths } = this.buildNativeFiles(dist, tool, docsDir, pluginRoot);
    const notices = this.collectHooksTrustNotices(dist, tool);
    return { files, componentPaths, skipped: [], notices };
  }

  private buildNativeFiles(
    dist: PluginDistribution,
    tool: AiTool<HasPlugins>,
    docsDir: string,
    pluginRoot: string
  ): { files: InstallationFile[]; componentPaths: ReadonlyMap<string, string> } {
    const result: InstallationFile[] = [];
    const componentPaths = new Map<string, string>();
    for (const file of dist.files) {
      const translated = this.translateFile(file, tool);
      if (translated === null) continue;
      const hooked = this.maybeConvertHooks(file.relativePath, translated.content, tool);
      const content = translated.verbatim ? hooked : this.rewriteProse(hooked, tool, docsDir);
      const installedPath = `${pluginRoot}${translated.relativePath}`;
      result.push(this.makeFile(installedPath, content));
      if (isComponentFile(file.relativePath)) componentPaths.set(installedPath, file.relativePath);
    }
    this.appendManifestFile(dist, tool, pluginRoot, result);
    return { files: result, componentPaths };
  }

  private appendManifestFile(
    dist: PluginDistribution,
    tool: AiTool<HasPlugins>,
    pluginRoot: string,
    result: InstallationFile[]
  ): void {
    const { pluginManifestRelativePath } = tool.capabilities.plugins;
    if (pluginManifestRelativePath === null) return;
    const sourceManifest = findSourceManifestContent(dist);
    if (sourceManifest === null) return;
    result.push(this.makeFile(`${pluginRoot}${pluginManifestRelativePath}`, sourceManifest));
  }

  // A delivered hook is not a skip: `hooksTrustNotice` names what a person still has to do
  // before it runs, and only applies when this plugin actually ships one.
  private collectHooksTrustNotices(
    dist: PluginDistribution,
    tool: AiTool<HasPlugins>
  ): ReadonlyNoticeList {
    if (dist.components.hooks.length === 0) return [];
    const { hooksTrustNotice } = tool.capabilities.plugins;
    if (hooksTrustNotice === null) return [];
    const entry: PluginInstallNotice = {
      pluginName: dist.manifest.name,
      component: "hooks",
      toolId: tool.toolId,
      message: hooksTrustNotice,
    };
    return [entry];
  }

  /** A plugin is authored with one spelling of the plugin root and the installer translates
   * it, exactly as prose is translated. A script carried verbatim keeps its own bytes. */
  private rewriteProse(content: string, tool: AiTool<HasPlugins>, docsDir: string): string {
    const rewritten = tool.rewriteContent(content, docsDir);
    const { pluginRootToken } = tool.capabilities.plugins;
    if (pluginRootToken === null) return rewritten;
    return rewritePluginRootToken(rewritten, pluginRootToken);
  }

  private maybeConvertHooks(sourcePath: string, content: string, tool: AiTool<HasPlugins>): string {
    if (sourcePath !== "hooks/hooks.json") return content;
    return convertHooksFormat(content, tool.capabilities.plugins.hooksContentFormat);
  }

  private translateFile(
    file: PluginComponentFile,
    tool: AiTool<HasPlugins>
  ): TranslatedFile | null {
    if (PLUGIN_MANIFEST_PATHS.includes(file.relativePath)) return null;
    const cap = tool.capabilities.plugins;
    if (file.relativePath === ".mcp.json") {
      return cap.acceptsMcp ? { relativePath: cap.mcpRelativePath, content: file.content } : null;
    }
    if (file.relativePath.split("/")[0] === PLUGIN_HOOKS_DIR) {
      if (!cap.acceptsHooks) return null;
      if (file.relativePath === `${PLUGIN_HOOKS_DIR}/hooks.json`) {
        return { relativePath: cap.hooksRelativePath, content: file.content };
      }
      // Everything under `hooks/` but its own manifest is a script the host runs. It goes
      // beside the manifest, and where the manifest sits at the plugin root it keeps its
      // own directory — a script at the root would leave the command naming `hooks/`
      // pointing at nothing.
      const manifestDir = parentDirOf(cap.hooksRelativePath) || PLUGIN_HOOKS_DIR;
      return {
        relativePath: `${manifestDir}/${pathBelow(PLUGIN_HOOKS_DIR, file.relativePath)}`,
        content: file.content,
        verbatim: true,
      };
    }
    return this.translateComponent(file, tool);
  }

  private translateComponent(
    file: PluginComponentFile,
    tool: AiTool<HasPlugins>
  ): TranslatedFile | null {
    const top = file.relativePath.split("/")[0];
    if (top === "commands" && hasCommands(tool)) {
      return translateMarkdown(file, "commands/", tool.directory, tool.capabilities.commands);
    }
    if (top === "agents" && hasAgents(tool)) {
      return translateMarkdown(file, "agents/", tool.directory, tool.capabilities.agents);
    }
    if (top === "rules" && hasRules(tool)) {
      return translateMarkdown(file, "rules/", tool.directory, tool.capabilities.rules);
    }
    if (top === "skills" && hasSkills(tool)) {
      return translateSkill(file, tool.capabilities.skills);
    }
    return null;
  }

  private translateFlat(
    dist: PluginDistribution,
    tool: AiTool<HasPlugins>,
    docsDir: string
  ): { files: InstallationFile[]; skipped: ReadonlySkipList } {
    const { flatNamespacePrefix } = tool.capabilities.plugins;
    if (flatNamespacePrefix === null) return { files: [], skipped: [] };
    const result: InstallationFile[] = [];
    for (const file of dist.components.commands) {
      result.push(
        this.flatCommandFile(file, dist.manifest.name, tool, flatNamespacePrefix, docsDir)
      );
    }
    for (const section of ["agents", "rules", "skills"] as const) {
      for (const file of dist.components[section]) {
        const f = this.flatSectionFile(file, section, dist.manifest.name, tool, docsDir);
        if (f !== null) result.push(f);
      }
    }
    result.push(...this.flatHooksFiles(dist, tool));
    const skipped = this.collectHooksSkips(dist, tool);
    return { files: result, skipped };
  }

  // A flat-mode hook is a runtime module a loader scans for, not a manifest a merge
  // reads — hooks/hooks.json describes the wrong shape for that and is never delivered;
  // everything else under hooks/ (the module itself and whatever it requires beside it)
  // is carried verbatim into flatHooksDir, exactly as native mode carries a hook script.
  private flatHooksFiles(dist: PluginDistribution, tool: AiTool<HasPlugins>): InstallationFile[] {
    const { flatHooksDir } = tool.capabilities.plugins;
    if (flatHooksDir === null) return [];
    return dist.components.hooks
      .filter((file) => file.relativePath !== `${PLUGIN_HOOKS_DIR}/hooks.json`)
      .map((file) =>
        this.makeFile(flatHooksSharedDirPath(flatHooksDir, file.relativePath), file.content)
      );
  }

  private collectHooksSkips(dist: PluginDistribution, tool: AiTool<HasPlugins>): ReadonlySkipList {
    if (dist.components.hooks.length === 0) return [];
    const { acceptsHooks, hooksUnsupportedReason } = tool.capabilities.plugins;
    if (acceptsHooks || hooksUnsupportedReason === null) return [];
    const entry: PluginTranslationSkip = {
      pluginName: dist.manifest.name,
      component: "hooks",
      toolId: tool.toolId,
      reason: hooksUnsupportedReason,
    };
    return [entry];
  }

  private flatCommandFile(
    file: PluginComponentFile,
    pluginName: string,
    tool: AiTool<HasPlugins>,
    prefix: string,
    docsDir: string
  ): InstallationFile {
    const filename = basename(file.relativePath);
    const raw = prefixCommandName(file.content, file.relativePath, prefix, pluginName);
    const content = tool.rewriteContent(raw, docsDir);
    return this.makeFile(`${tool.directory}commands/${pluginName}/${filename}`, content);
  }

  private flatSectionFile(
    file: PluginComponentFile,
    section: "agents" | "rules" | "skills",
    pluginName: string,
    tool: AiTool<HasPlugins>,
    docsDir: string
  ): InstallationFile | null {
    if (!sectionPresent(tool, section)) return null;
    const sectionDir = `${section}/`;
    const fileName = file.relativePath.slice(sectionDir.length);
    // Same rule as the native path: prose is rewritten, an artefact is carried. A flat
    // install rewrote every file it carried, so a script survived here only where a tool's
    // own rewrite happened to leave it alone — which is luck, not a guarantee.
    const content = isProse(file.relativePath)
      ? tool.rewriteContent(file.content, docsDir)
      : file.content;
    return this.makeFile(`${tool.directory}${section}/${pluginName}/${fileName}`, content);
  }

  private makeFile(relativePath: string, content: string): InstallationFile {
    return new InstallationFile({
      relativePath,
      content,
      hash: this.hasher.hash(content),
    });
  }
}

function asPluginTool(config: ToolConfig): AiTool<HasPlugins> | null {
  if (!isAiTool(config)) return null;
  if (!hasPlugins(config)) return null;
  return config;
}

function hasPlugins(tool: AiTool<unknown>): tool is AiTool<HasPlugins> {
  return "plugins" in (tool.capabilities as object);
}

function hasCommands(tool: AiTool<HasPlugins>): tool is AiTool<HasPlugins & HasCommands> {
  return "commands" in (tool.capabilities as object);
}

function hasAgents(tool: AiTool<HasPlugins>): tool is AiTool<HasPlugins & HasAgents> {
  return "agents" in (tool.capabilities as object);
}

function hasSkills(tool: AiTool<HasPlugins>): tool is AiTool<HasPlugins & HasSkills> {
  return "skills" in (tool.capabilities as object);
}

function sectionPresent(tool: AiTool<HasPlugins>, section: "agents" | "rules" | "skills"): boolean {
  return section in (tool.capabilities as object);
}

/** Prose is translated; anything else a plugin ships is an artefact, carried byte for
 * byte. The extension is the whole test: a plugin's components are markdown by definition,
 * and everything beside them — a script, a template, a fixture — is not. */
function isProse(relativePath: string): boolean {
  return relativePath.endsWith(MARKDOWN_EXTENSION);
}

function isComponentFile(relativePath: string): boolean {
  const top = relativePath.split("/")[0];
  return top === "agents" || top === "commands" || top === "rules" || top === "skills";
}

function findSourceManifestContent(dist: PluginDistribution): string | null {
  for (const path of PLUGIN_MANIFEST_PATHS) {
    const file = dist.files.find((f) => f.relativePath === path);
    if (file !== undefined) return file.content;
  }
  return null;
}

function basename(relativePath: string): string {
  return relativePath.split("/").at(-1) ?? relativePath;
}

function prefixCommandName(
  content: string,
  relativePath: string,
  prefix: string,
  pluginName: string
): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const rawName = typeof frontmatter.name === "string" ? frontmatter.name : "";
  const simpleName = stripCommandPrefix(rawName) || basename(relativePath);
  const newFrontmatter = { ...frontmatter, name: `${prefix}${pluginName}:${simpleName}` };
  return serializeFrontmatter(newFrontmatter, body);
}

function stripCommandPrefix(name: string): string {
  const match = /^aidd:\d+:(.+)$/.exec(name);
  if (match) return match[1];
  const colonIdx = name.lastIndexOf(":");
  if (colonIdx !== -1) return name.slice(colonIdx + 1);
  return name;
}

function toPluginRelativePath(fullPath: string, toolDirectory: string): string {
  const relative = fullPath.startsWith(toolDirectory)
    ? fullPath.slice(toolDirectory.length)
    : fullPath;
  return relative.replace(/^([^/]+)\/aidd\//, "$1/");
}

function translateMarkdown(
  file: PluginComponentFile,
  sectionDir: string,
  toolDirectory: string,
  cap: MarkdownCap
): TranslatedFile | null {
  const fileName = file.relativePath.slice(sectionDir.length);
  const fullPath = cap.buildInstallPath(fileName);
  if (fullPath === null) return null;
  const relativePath = toPluginRelativePath(fullPath, toolDirectory);
  const { frontmatter, body } = parseFrontmatter(file.content);
  const newFm = cap.convertFrontmatter(frontmatter, fileName);
  const content = cap.serialize(newFm, body);
  return { relativePath, content };
}

/** A skill is prose with frontmatter; anything else under `skills/` is an asset the skill
 * carries — a script it runs, a template it copies. Translating an asset would put it
 * through a frontmatter round-trip and a path rewrite, neither of which is meaningful for
 * a file that is not prose and both of which can damage it. */
function translateSkill(file: PluginComponentFile, cap: SkillCap): TranslatedFile {
  if (!isProse(file.relativePath)) {
    return { relativePath: file.relativePath, content: file.content, verbatim: true };
  }
  const { frontmatter, body } = parseFrontmatter(file.content);
  const newFm = cap.convertFrontmatter(frontmatter);
  const content = cap.serialize(newFm, body);
  return { relativePath: file.relativePath, content };
}
