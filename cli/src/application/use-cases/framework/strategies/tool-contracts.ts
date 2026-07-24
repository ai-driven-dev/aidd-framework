/**
 * Per-tool ToolBuildContract implementations.
 *
 * Each function returns a ToolBuildContract describing how the tool handles each
 * artifact kind in both marketplace and flat modes. The two orchestrators
 * (MarketplaceBuildStrategy, FlatBuildStrategy) read these contracts — no
 * per-tool if-branches live in the orchestrators.
 *
 * All content transforms, path computations, and merge helpers are pure
 * functions reused from domain/formats/. The contracts are thin wiring.
 */

import {
  stripAgentFrontmatter,
  stripCursorAgentFrontmatter,
} from "../../../../domain/formats/agent-frontmatter-strip.js";
import {
  OUTPUT_CLAUDE_MANIFEST_RELATIVE,
  OUTPUT_CLAUDE_MARKETPLACE_RELATIVE,
} from "../../../../domain/formats/claude-build-paths.js";
import { codexAgentMarkdownToToml } from "../../../../domain/formats/codex-agent-toml.js";
import {
  OUTPUT_CODEX_AGENTS_DIR,
  OUTPUT_CODEX_MANIFEST_RELATIVE,
  OUTPUT_CODEX_MARKETPLACE_RELATIVE,
} from "../../../../domain/formats/codex-paths.js";
import {
  OUTPUT_CURSOR_MANIFEST_RELATIVE,
  OUTPUT_CURSOR_MARKETPLACE_RELATIVE,
} from "../../../../domain/formats/cursor-paths.js";
import {
  flattenCopilotHooksShape,
  mergeClaudeSettingsHooks,
  mergeCodexFrameworkHooksJson,
  mergeCursorFlatHooks,
} from "../../../../domain/formats/flat-hooks-merge.js";
import {
  flatMcpKeyPrefix,
  genericFlatAgentPath,
  genericFlatHooksFile,
  genericFlatHooksScriptPath,
  genericFlatSkillPath,
} from "../../../../domain/formats/flat-paths.js";
import { parseFrontmatter, serializeFrontmatter } from "../../../../domain/formats/markdown.js";
import { buildOpencodeFlatConfig } from "../../../../domain/formats/opencode-mcp-merge.js";
import { rewriteRelativeLinks } from "../../../../domain/formats/relative-link-rewrite.js";
import { stringifyToml } from "../../../../domain/formats/toml.js";
import { mergeVscodeMcp } from "../../../../domain/formats/vscode-mcp-merge.js";
import {
  FLAT_AGENT_OUTPUT_EXT,
  FLAT_GITHUB_AGENTS_PREFIX,
  FLAT_GITHUB_HOOKS_PREFIX,
  FLAT_GITHUB_SKILLS_PREFIX,
  FLAT_VSCODE_MCP_PATH,
  OUTPUT_MARKETPLACE_RELATIVE,
  OUTPUT_PLUGIN_MANIFEST_RELATIVE,
} from "../../../../domain/models/framework-build.js";
import type { FileReader } from "../../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../../domain/ports/file-writer.js";
import { mergeCodexConfigToml } from "../../../../domain/tools/ai/codex.js";
import { transformMcpToOpencode } from "../../../../domain/tools/ai/opencode.js";
import type { PluginPresence, ToolBuildContract } from "../../../../domain/tools/build-contract.js";
import {
  buildClaudeStyleCatalogEntry,
  buildClaudeStyleMarketplace,
  buildCodexMarketplace,
  buildCodexMarketplaceEntry,
  resolveDescription,
  resolveVersion,
  synthesizeClaudeStyleManifest,
} from "./marketplace-strategy-helpers.js";

type FsType = FileReader & FileWriter;
type SrcEntry =
  | { version?: string; description?: string; strict?: boolean; recommended?: boolean }
  | undefined;

// ── Agent transform helpers ───────────────────────────────────────────────────

function transformClaudeAgent(content: string, _plugin: string, outName: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const rewrittenBody = rewriteRelativeLinks(body, {
    currentFilePluginRelative: `agents/${outName}`,
  });
  return serializeFrontmatter(frontmatter, rewrittenBody);
}

function transformCursorAgent(content: string, _plugin: string, outName: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const stripped = stripCursorAgentFrontmatter(frontmatter);
  const rewrittenBody = rewriteRelativeLinks(body, {
    currentFilePluginRelative: `agents/${outName}`,
  });
  return serializeFrontmatter(stripped, rewrittenBody);
}

// ── Shared catalog builders ────────────────────────────────────────────────────

async function buildClaudeStyleEntry(
  name: string,
  outDir: string,
  srcEntry: SrcEntry,
  manifestRelative: string,
  fs: FsType
): Promise<Record<string, unknown>> {
  const args = [fs, name, srcEntry, outDir, manifestRelative] as const;
  const version = await resolveVersion(...args);
  const description = await resolveDescription(...args);
  return buildClaudeStyleCatalogEntry(
    name,
    description,
    version,
    srcEntry as Record<string, unknown> | undefined
  );
}

// ── Claude contract ────────────────────────────────────────────────────────────

export function buildClaudeContract(): ToolBuildContract {
  const manifestRelative = OUTPUT_CLAUDE_MANIFEST_RELATIVE;
  const marketplaceRelative = OUTPUT_CLAUDE_MARKETPLACE_RELATIVE;
  // Split literal to avoid biome's noTemplateCurlyInString warning.
  const claudeToken = "$" + "{CLAUDE_PLUGIN_ROOT}";
  return {
    manifestDir: ".claude-plugin",
    marketplaceRelative,
    pluginRootToken: claudeToken,
    manifestFileRelative: manifestRelative,
    synthesizeManifest: (source, presence) =>
      synthesizeClaudeStyleManifest(source, presence, {
        manifestDir: ".claude-plugin",
        agentsField: true,
      }),
    manifestSchemaName: "plugin-manifest",
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: (_p, rel) => rel,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        path: (_p, rel) => rel,
        transform: transformClaudeAgent,
      },
      mcp: {
        supported: true,
        source: { kind: "configFile", srcPath: ".mcp.json" },
        path: () => ".mcp.json",
      },
      hooks: {
        supported: true,
        source: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
        path: (_p, rel) => rel,
      },
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: async (source, entries, _fs) => ({
      catalog: buildClaudeStyleMarketplace(
        source as Parameters<typeof buildClaudeStyleMarketplace>[0],
        entries
      ),
      schemaName: "claude-marketplace",
      destRelPath: marketplaceRelative,
    }),
    buildMarketplaceEntry: async (name, _src, outDir, srcEntry, fs) =>
      buildClaudeStyleEntry(name, outDir, srcEntry, manifestRelative, fs),
  };
}

// ── Cursor contract ────────────────────────────────────────────────────────────

export function buildCursorContract(): ToolBuildContract {
  const manifestRelative = OUTPUT_CURSOR_MANIFEST_RELATIVE;
  const marketplaceRelative = OUTPUT_CURSOR_MARKETPLACE_RELATIVE;
  // Split literal to avoid biome's noTemplateCurlyInString warning.
  const cursorToken = "$" + "{CURSOR_PLUGIN_ROOT}";
  return {
    manifestDir: ".cursor-plugin",
    marketplaceRelative,
    pluginRootToken: cursorToken,
    manifestFileRelative: manifestRelative,
    synthesizeManifest: (source, presence) =>
      synthesizeClaudeStyleManifest(source, presence, {
        manifestDir: ".cursor-plugin",
        agentsField: true,
      }),
    manifestSchemaName: "plugin-manifest",
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: (_p, rel) => rel,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        path: (_p, rel) => rel,
        transform: transformCursorAgent,
      },
      mcp: {
        supported: true,
        source: { kind: "configFile", srcPath: ".mcp.json" },
        path: () => ".mcp.json",
      },
      hooks: {
        supported: true,
        source: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
        path: (_p, rel) => rel,
      },
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: async (source, entries, _fs) => ({
      catalog: buildClaudeStyleMarketplace(
        source as Parameters<typeof buildClaudeStyleMarketplace>[0],
        entries
      ),
      schemaName: "claude-marketplace",
      destRelPath: marketplaceRelative,
    }),
    buildMarketplaceEntry: async (name, _src, outDir, srcEntry, fs) =>
      buildClaudeStyleEntry(name, outDir, srcEntry, manifestRelative, fs),
  };
}

// ── Copilot marketplace contract (OpenPlugin format) ──────────────────────────

export function buildCopilotMarketplaceContract(): ToolBuildContract {
  const manifestRelative = OUTPUT_PLUGIN_MANIFEST_RELATIVE;
  const marketplaceRelative = OUTPUT_MARKETPLACE_RELATIVE;
  // Split literal to avoid biome's noTemplateCurlyInString warning.
  const copilotToken = "$" + "{PLUGIN_ROOT}";
  return {
    manifestDir: ".plugin",
    marketplaceRelative,
    pluginRootToken: copilotToken,
    manifestFileRelative: manifestRelative,
    synthesizeManifest: (source, presence) =>
      synthesizeClaudeStyleManifest(source, presence, {
        manifestDir: ".plugin",
        agentsField: true,
      }),
    manifestSchemaName: null, // Copilot does not use AJV for the plugin manifest
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: (_p, rel) => rel,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        path: (_p, rel) => rel,
        transform: transformClaudeAgent,
      },
      mcp: {
        supported: true,
        source: { kind: "configFile", srcPath: ".mcp.json" },
        path: () => ".mcp.json",
      },
      hooks: {
        supported: true,
        source: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
        path: (_p, rel) => rel,
      },
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: async (source, entries, _fs) => ({
      catalog: {
        name: source.name,
        metadata: {
          description: source.description,
          version: source.version,
          pluginRoot: "./plugins",
        },
        owner: source.owner,
        plugins: entries,
      },
      schemaName: "marketplace",
      destRelPath: marketplaceRelative,
    }),
    buildMarketplaceEntry: async (name, _src, outDir, srcEntry, fs) => {
      const args = [fs, name, srcEntry, outDir, manifestRelative] as const;
      const version = await resolveVersion(...args);
      const description = await resolveDescription(...args);
      return { name, source: name, description, version };
    },
  };
}

// ── Codex marketplace contract ─────────────────────────────────────────────────

const CODEX_MANIFEST_STRING_KEYS = [
  "name",
  "description",
  "version",
  "homepage",
  "repository",
  "license",
] as const;

function copyCodexManifestStringFields(
  source: Record<string, unknown>,
  manifest: Record<string, unknown>
): void {
  for (const key of CODEX_MANIFEST_STRING_KEYS) {
    if (typeof source[key] === "string") manifest[key] = source[key];
  }
  if (typeof source.author === "string" || typeof source.author === "object") {
    manifest.author = source.author;
  }
  if (Array.isArray(source.keywords)) manifest.keywords = source.keywords;
}

function buildCodexManifest(
  source: Record<string, unknown>,
  presence: PluginPresence
): Record<string, unknown> {
  const manifest: Record<string, unknown> = {};
  copyCodexManifestStringFields(source, manifest);
  // agents field intentionally omitted: Codex plugin schema does not support it
  // Codex requires `skills` as a STRING dir (like the official gmail plugin); the array
  // form makes `codex plugin add` fail with "missing or invalid plugin.json".
  if (presence.skillsList.length > 0) manifest.skills = "./skills";
  if (presence.hasHooksJson) manifest.hooks = "./hooks/hooks.json";
  if (presence.hasMcpJson) manifest.mcpServers = "./.mcp.json";
  return manifest;
}

export function buildCodexContract(): ToolBuildContract {
  const manifestRelative = OUTPUT_CODEX_MANIFEST_RELATIVE;
  const marketplaceRelative = OUTPUT_CODEX_MARKETPLACE_RELATIVE;
  // Split literal to avoid biome's noTemplateCurlyInString warning.
  const codexToken = "$" + "{PLUGIN_ROOT}";
  return {
    manifestDir: ".codex-plugin",
    marketplaceRelative,
    pluginRootToken: codexToken,
    manifestFileRelative: manifestRelative,
    synthesizeManifest: buildCodexManifest,
    manifestSchemaName: "codex-plugin-manifest",
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: (_p, rel) => rel,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        path: (_p, rel) =>
          `${OUTPUT_CODEX_AGENTS_DIR}/${rel.replace(/^agents\//, "").replace(/\.md$/, ".toml")}`,
        transform: (content, plugin, outName) => codexAgentMarkdownToToml(content, plugin, outName),
      },
      mcp: {
        supported: true,
        source: { kind: "configFile", srcPath: ".mcp.json" },
        path: () => ".mcp.json",
      },
      hooks: {
        supported: true,
        source: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
        path: (_p, rel) => rel,
      },
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: async (source, entries, _fs) => ({
      catalog: buildCodexMarketplace(
        source as Parameters<typeof buildCodexMarketplace>[0],
        entries
      ),
      schemaName: "codex-marketplace",
      destRelPath: marketplaceRelative,
    }),
    buildMarketplaceEntry: async (name, _src, _outDir, srcEntry, _fs) =>
      buildCodexMarketplaceEntry(name, srcEntry as Record<string, unknown> | undefined),
  };
}

// ── Copilot flat contract (for FlatBuildStrategy) ─────────────────────────────

function copilotFlatAgentPath(plugin: string, rel: string): string {
  return genericFlatAgentPath(
    FLAT_GITHUB_AGENTS_PREFIX,
    plugin,
    rel.replace(/^agents\//, ""),
    FLAT_AGENT_OUTPUT_EXT
  );
}

function copilotFlatSkillPath(plugin: string, rel: string): string {
  return genericFlatSkillPath(FLAT_GITHUB_SKILLS_PREFIX, plugin, rel.replace(/^skills\//, ""));
}

function copilotFlatHooksPath(plugin: string, rel: string): string {
  const rest = rel.replace(/^hooks\//, "");
  if (rest === `${plugin}.hooks.json`)
    return genericFlatHooksFile(FLAT_GITHUB_HOOKS_PREFIX, plugin);
  return genericFlatHooksScriptPath(FLAT_GITHUB_HOOKS_PREFIX, plugin, rest);
}

function transformCopilotFlatAgent(content: string, plugin: string, outName: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const stripped = stripAgentFrontmatter(frontmatter);
  const flatRelPath = copilotFlatAgentPath(plugin, `agents/${outName}`);
  const rewrittenBody = rewriteRelativeLinks(body, {
    currentFilePluginRelative: flatRelPath,
    resolveTargetPath: (rel) => copilotFlatResolveTarget(plugin, rel),
  });
  const prefixedName = `${plugin}-${outName.replace(/\.md$/, "")}`;
  return serializeFrontmatter({ ...stripped, name: prefixedName }, rewrittenBody);
}

function copilotFlatResolveTarget(plugin: string, rel: string): string {
  if (rel.startsWith("agents/")) return copilotFlatAgentPath(plugin, rel);
  if (rel.startsWith("skills/")) return copilotFlatSkillPath(plugin, rel);
  return rel;
}

export function buildCopilotFlatContract(): ToolBuildContract {
  return {
    manifestDir: null,
    marketplaceRelative: null,
    manifestFileRelative: null,
    synthesizeManifest: null,
    manifestSchemaName: null,
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: copilotFlatSkillPath,
        // VS Code Copilot requires SKILL.md frontmatter name === parent folder name.
        rewriteSkillName: true,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        ext: FLAT_AGENT_OUTPUT_EXT,
        path: copilotFlatAgentPath,
        transform: transformCopilotFlatAgent,
      },
      mcp: {
        supported: true,
        source: { kind: "configFile", srcPath: ".mcp.json" },
        path: () => FLAT_VSCODE_MCP_PATH,
        merge: (existing, incoming, force) => mergeVscodeMcp(existing, incoming, force),
        mcpServersKey: "servers",
        mergeDest: (outDir) => `${outDir}/${FLAT_VSCODE_MCP_PATH}`,
      },
      hooks: {
        supported: true,
        source: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
        path: copilotFlatHooksPath,
        hooksTransform: (rewrittenJson) => flattenCopilotHooksShape(rewrittenJson),
      },
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: null,
    buildMarketplaceEntry: null,
  };
}

// ── Claude flat contract ───────────────────────────────────────────────────────

function claudeFlatAgentPath(plugin: string, rel: string): string {
  return genericFlatAgentPath(".claude/agents/", plugin, rel.replace(/^agents\//, ""), ".md");
}

function claudeFlatSkillPath(plugin: string, rel: string): string {
  return genericFlatSkillPath(".claude/skills/", plugin, rel.replace(/^skills\//, ""));
}

function claudeFlatHooksPath(plugin: string, rel: string): string {
  const rest = rel.replace(/^hooks\//, "");
  if (rest === `${plugin}.hooks.json`) return genericFlatHooksFile(".claude/hooks/", plugin);
  return genericFlatHooksScriptPath(".claude/hooks/", plugin, rest);
}

function claudeFlatResolveTarget(plugin: string, rel: string): string {
  if (rel.startsWith("agents/")) return claudeFlatAgentPath(plugin, rel);
  if (rel.startsWith("skills/")) return claudeFlatSkillPath(plugin, rel);
  return rel;
}

function transformClaudeFlatAgent(content: string, plugin: string, outName: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const flatRelPath = claudeFlatAgentPath(plugin, `agents/${outName}`);
  const rewrittenBody = rewriteRelativeLinks(body, {
    currentFilePluginRelative: flatRelPath,
    resolveTargetPath: (rel) => claudeFlatResolveTarget(plugin, rel),
  });
  const prefixedName = `${plugin}-${outName.replace(/\.md$/, "")}`;
  return serializeFrontmatter({ ...frontmatter, name: prefixedName }, rewrittenBody);
}

export function buildClaudeFlatContract(): ToolBuildContract {
  return {
    manifestDir: null,
    marketplaceRelative: null,
    manifestFileRelative: null,
    synthesizeManifest: null,
    manifestSchemaName: null,
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: claudeFlatSkillPath,
        rewriteSkillName: true,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        path: claudeFlatAgentPath,
        transform: transformClaudeFlatAgent,
      },
      mcp: {
        supported: true,
        source: { kind: "configFile", srcPath: ".mcp.json" },
        path: () => ".mcp.json",
        merge: (existing, incoming, force) =>
          mergeVscodeMcp(existing, incoming, force, "mcpServers"),
        mcpServersKey: "mcpServers",
        mergeDest: (outDir) => `${outDir}/.mcp.json`,
      },
      hooks: {
        supported: true,
        source: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
        path: claudeFlatHooksPath,
        hooksMerge: (existing, incoming) => mergeClaudeSettingsHooks(existing, incoming),
        hooksMergeDest: (outDir) => `${outDir}/.claude/settings.json`,
      },
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: null,
    buildMarketplaceEntry: null,
  };
}

// ── Cursor flat contract ───────────────────────────────────────────────────────

function cursorFlatAgentPath(plugin: string, rel: string): string {
  return genericFlatAgentPath(".cursor/agents/", plugin, rel.replace(/^agents\//, ""), ".md");
}

function cursorFlatSkillPath(plugin: string, rel: string): string {
  return genericFlatSkillPath(".cursor/skills/", plugin, rel.replace(/^skills\//, ""));
}

function cursorFlatHooksPath(plugin: string, rel: string): string {
  const rest = rel.replace(/^hooks\//, "");
  if (rest === `${plugin}.hooks.json`) return genericFlatHooksFile(".cursor/hooks/", plugin);
  return genericFlatHooksScriptPath(".cursor/hooks/", plugin, rest);
}

function cursorFlatResolveTarget(plugin: string, rel: string): string {
  if (rel.startsWith("agents/")) return cursorFlatAgentPath(plugin, rel);
  if (rel.startsWith("skills/")) return cursorFlatSkillPath(plugin, rel);
  return rel;
}

function transformCursorFlatAgent(content: string, plugin: string, outName: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const stripped = stripCursorAgentFrontmatter(frontmatter);
  const flatRelPath = cursorFlatAgentPath(plugin, `agents/${outName}`);
  const rewrittenBody = rewriteRelativeLinks(body, {
    currentFilePluginRelative: flatRelPath,
    resolveTargetPath: (rel) => cursorFlatResolveTarget(plugin, rel),
  });
  const prefixedName = `${plugin}-${outName.replace(/\.md$/, "")}`;
  return serializeFrontmatter({ ...stripped, name: prefixedName }, rewrittenBody);
}

export function buildCursorFlatContract(): ToolBuildContract {
  return {
    manifestDir: null,
    marketplaceRelative: null,
    manifestFileRelative: null,
    synthesizeManifest: null,
    manifestSchemaName: null,
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: cursorFlatSkillPath,
        rewriteSkillName: true,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        path: cursorFlatAgentPath,
        transform: transformCursorFlatAgent,
      },
      mcp: {
        supported: true,
        source: { kind: "configFile", srcPath: ".mcp.json" },
        path: () => ".cursor/mcp.json",
        merge: (existing, incoming, force) =>
          mergeVscodeMcp(existing, incoming, force, "mcpServers"),
        mcpServersKey: "mcpServers",
        mergeDest: (outDir) => `${outDir}/.cursor/mcp.json`,
      },
      hooks: {
        supported: true,
        source: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
        path: cursorFlatHooksPath,
        hooksMerge: (existing, incoming) => mergeCursorFlatHooks(existing, incoming),
        hooksMergeDest: (outDir) => `${outDir}/.cursor/hooks.json`,
      },
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: null,
    buildMarketplaceEntry: null,
  };
}

// ── Codex flat contract ────────────────────────────────────────────────────────

// Codex scans `.agents/skills/` (cwd → repo root) for workspace skills — the documented
// project skill root (developers.openai.com/codex/skills). Verified live on codex-cli 0.136:
// a SKILL.md there appears in Codex's "Available skills" context. (`.codex/skills/` also
// resolves on 0.136 but is undocumented, so we target the documented root.)
const CODEX_SKILLS_PREFIX = ".agents/skills/";

function codexFlatSkillPath(plugin: string, rel: string): string {
  return genericFlatSkillPath(CODEX_SKILLS_PREFIX, plugin, rel.replace(/^skills\//, ""));
}

function codexFlatAgentPath(plugin: string, rel: string): string {
  const base = rel.replace(/^agents\//, "").replace(/\.md$/, ".toml");
  return `.codex/agents/${plugin}-${base}`;
}

function codexFlatHooksPath(plugin: string, rel: string): string {
  const rest = rel.replace(/^hooks\//, "");
  return genericFlatHooksScriptPath(".codex/hooks/", plugin, rest);
}

async function collectPrefixedMcpServers(
  builtPlugins: readonly string[],
  sourceDir: string,
  fs: FsType
): Promise<Record<string, unknown>> {
  const mcpServers: Record<string, unknown> = {};
  for (const plugin of builtPlugins) {
    const mcpSrc = `${sourceDir}/plugins/${plugin}/.mcp.json`;
    if (!(await fs.fileExists(mcpSrc))) continue;
    const raw = await fs.readFile(mcpSrc);
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    const prefix = flatMcpKeyPrefix(plugin);
    for (const [k, v] of Object.entries(parsed.mcpServers ?? {})) {
      mcpServers[`${prefix}${k}`] = v;
    }
  }
  return mcpServers;
}

function buildCodexConfigPayload(mcpServers: Record<string, unknown>): string {
  if (Object.keys(mcpServers).length === 0) return "";
  return stringifyToml({ mcp_servers: mcpServers } as Record<string, unknown>);
}

export function buildCodexFlatContract(): ToolBuildContract {
  return {
    manifestDir: null,
    marketplaceRelative: null,
    manifestFileRelative: null,
    synthesizeManifest: null,
    manifestSchemaName: null,
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: codexFlatSkillPath,
        rewriteSkillName: true,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        path: codexFlatAgentPath,
        transform: (content, plugin, outName) =>
          codexAgentMarkdownToToml(content, plugin, outName, true),
      },
      mcp: { supported: false }, // handled by emitConfigArtifact (config.toml mcp_servers)
      hooks: {
        supported: true,
        source: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
        path: codexFlatHooksPath,
        hooksMerge: (existing, incoming) => mergeCodexFrameworkHooksJson(existing, incoming),
        hooksMergeDest: (outDir) => `${outDir}/.codex/hooks.json`,
      },
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: null,
    buildMarketplaceEntry: null,
    emitConfigArtifact: async (builtPlugins, outDir, sourceDir, fs) => {
      const configPath = `${outDir}/.codex/config.toml`;
      const existing = (await fs.fileExists(configPath)) ? await fs.readFile(configPath) : "";
      const mcpServers = await collectPrefixedMcpServers(builtPlugins, sourceDir, fs);
      const aiddPayload = buildCodexConfigPayload(mcpServers);
      const merged = mergeCodexConfigToml(existing, aiddPayload);
      await fs.writeFile(configPath, merged);
      return 1;
    },
  };
}

// ── Opencode flat contract ─────────────────────────────────────────────────────

function opencodeFlatAgentPath(plugin: string, rel: string): string {
  return genericFlatAgentPath(".opencode/agents/", plugin, rel.replace(/^agents\//, ""), ".md");
}

function opencodeFlatSkillPath(plugin: string, rel: string): string {
  return genericFlatSkillPath(".opencode/skills/", plugin, rel.replace(/^skills\//, ""));
}

function opencodeFlatResolveTarget(plugin: string, rel: string): string {
  if (rel.startsWith("agents/")) return opencodeFlatAgentPath(plugin, rel);
  if (rel.startsWith("skills/")) return opencodeFlatSkillPath(plugin, rel);
  return rel;
}

function transformOpencodeFlatAgent(content: string, plugin: string, outName: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const flatRelPath = opencodeFlatAgentPath(plugin, `agents/${outName}`);
  const rewrittenBody = rewriteRelativeLinks(body, {
    currentFilePluginRelative: flatRelPath,
    resolveTargetPath: (rel) => opencodeFlatResolveTarget(plugin, rel),
  });
  const prefixedName = `${plugin}-${outName.replace(/\.md$/, "")}`;
  // mode: subagent ensures opencode treats copied agents as subagents, not primary agents.
  return serializeFrontmatter(
    { ...frontmatter, name: prefixedName, mode: "subagent" },
    rewrittenBody
  );
}

async function resolveOpencodeJsonPath(outDir: string, fs: FsType): Promise<string> {
  const jsoncExists = await fs.fileExists(`${outDir}/opencode.jsonc`);
  if (jsoncExists) return `${outDir}/opencode.jsonc`;
  return `${outDir}/opencode.json`;
}

async function collectOpencodeMcp(
  builtPlugins: readonly string[],
  sourceDir: string,
  fs: FsType
): Promise<Record<string, unknown>> {
  const incoming: Record<string, unknown> = {};
  for (const plugin of builtPlugins) {
    const mcpSrc = `${sourceDir}/plugins/${plugin}/.mcp.json`;
    if (!(await fs.fileExists(mcpSrc))) continue;
    const raw = await fs.readFile(mcpSrc);
    const transformed = JSON.parse(transformMcpToOpencode(raw)) as {
      mcp?: Record<string, unknown>;
    };
    const prefix = flatMcpKeyPrefix(plugin);
    for (const [k, v] of Object.entries(transformed.mcp ?? {})) {
      incoming[`${prefix}${k}`] = v;
    }
  }
  return incoming;
}

export function buildOpencodeFlatContract(): ToolBuildContract {
  return {
    manifestDir: null,
    marketplaceRelative: null,
    manifestFileRelative: null,
    synthesizeManifest: null,
    manifestSchemaName: null,
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: opencodeFlatSkillPath,
        rewriteSkillName: true,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        path: opencodeFlatAgentPath,
        transform: transformOpencodeFlatAgent,
      },
      mcp: { supported: false }, // handled by emitConfigArtifact (opencode.json mcp)
      hooks: { supported: false }, // opencode has no HasHooks capability
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: null,
    buildMarketplaceEntry: null,
    emitConfigArtifact: async (builtPlugins, outDir, sourceDir, fs, _validator, assetProvider) => {
      const configPath = await resolveOpencodeJsonPath(outDir, fs);
      const existing = (await fs.fileExists(configPath)) ? await fs.readFile(configPath) : null;
      const incoming = await collectOpencodeMcp(builtPlugins, sourceDir, fs);
      const baseAsset = assetProvider.loadConfigAsset("opencode", "opencode.json");
      const base = typeof baseAsset === "string" ? baseAsset : JSON.stringify(baseAsset);
      await fs.writeFile(configPath, buildOpencodeFlatConfig(base, existing, incoming));
      return 1;
    },
  };
}
