/**
 * Cursor's ToolBuildContract: marketplace (native plugin tree) and flat
 * (direct workspace materialization) modes.
 *
 * Content transforms, path computations, and merge helpers are pure functions reused
 * from domain/formats/. The contracts themselves are thin wiring.
 */

import { parseFrontmatter, serializeFrontmatter } from "../../../../../kernel/markdown.js";
import {
  genericFlatAgentPath,
  genericFlatHooksFile,
  genericFlatHooksScriptPath,
  genericFlatSkillPath,
} from "../../../../../kernel/materialization/flat-paths.js";
import { rewriteRelativeLinks } from "../../../../../kernel/materialization/relative-link-rewrite.js";
import type { ToolBuildContract } from "../../build-contract.js";
import { stripCursorAgentFrontmatter } from "../../formats/agent-frontmatter-strip.js";
import { mergeCursorFlatHooks } from "../../formats/flat-hooks-merge.js";
import { mergeVscodeMcp } from "../../formats/vscode-mcp-merge.js";
import {
  buildClaudeStyleEntry,
  buildClaudeStyleMarketplace,
  synthesizeClaudeStyleManifest,
} from "../../marketplace-catalog.js";
import {
  OUTPUT_CURSOR_MANIFEST_RELATIVE,
  OUTPUT_CURSOR_MARKETPLACE_RELATIVE,
} from "./cursor-paths.js";

function transformCursorAgent(content: string, _plugin: string, outName: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const stripped = stripCursorAgentFrontmatter(frontmatter);
  const rewrittenBody = rewriteRelativeLinks(body, {
    currentFilePluginRelative: `agents/${outName}`,
  });
  return serializeFrontmatter(stripped, rewrittenBody);
}

export function buildCursorContract(): ToolBuildContract {
  const manifestRelative = OUTPUT_CURSOR_MANIFEST_RELATIVE;
  const marketplaceRelative = OUTPUT_CURSOR_MARKETPLACE_RELATIVE;
  // Split literal to avoid biome's noTemplateCurlyInString warning.
  const cursorToken = "$" + "{CURSOR_PLUGIN_ROOT}";
  return {
    pluginRootToken: cursorToken,
    manifestFileRelative: manifestRelative,
    synthesizeManifest: (source, presence) =>
      synthesizeClaudeStyleManifest(source, presence, {
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
