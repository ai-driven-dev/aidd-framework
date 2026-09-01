/**
 * Claude's ToolBuildContract: marketplace (native plugin tree) and flat
 * (direct workspace materialization) modes.
 *
 * Content transforms, path computations, and merge helpers are pure functions reused
 * from domain/formats/. The contracts themselves are thin wiring.
 */

import {
  genericFlatAgentPath,
  genericFlatHooksFile,
  genericFlatHooksScriptPath,
  genericFlatSkillPath,
} from "../../../../../kernel/flat-paths.js";
import { parseFrontmatter, serializeFrontmatter } from "../../../../../kernel/markdown.js";
import { rewriteRelativeLinks } from "../../../../../kernel/relative-link-rewrite.js";
import type { ToolBuildContract } from "../../build-contract.js";
import { mergeClaudeSettingsHooks } from "../../formats/flat-hooks-merge.js";
import { mergeVscodeMcp } from "../../formats/vscode-mcp-merge.js";
import {
  buildClaudeStyleEntry,
  buildClaudeStyleMarketplace,
  synthesizeClaudeStyleManifest,
  transformClaudeAgent,
} from "../../marketplace-catalog.js";
import {
  OUTPUT_CLAUDE_MANIFEST_RELATIVE,
  OUTPUT_CLAUDE_MARKETPLACE_RELATIVE,
} from "./claude-build-paths.js";

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
