/**
 * Copilot's ToolBuildContract: marketplace (OpenPlugin format) and flat
 * (direct workspace materialization) modes.
 *
 * Content transforms, path computations, and merge helpers are pure functions reused
 * from domain/formats/. The contracts themselves are thin wiring.
 */
import { stripAgentFrontmatter } from "../../../../../domain/formats/agent-frontmatter-strip.js";
import { flattenCopilotHooksShape } from "../../../../../domain/formats/flat-hooks-merge.js";
import {
  genericFlatAgentPath,
  genericFlatHooksFile,
  genericFlatHooksScriptPath,
  genericFlatSkillPath,
} from "../../../../../domain/formats/flat-paths.js";
import { parseFrontmatter, serializeFrontmatter } from "../../../../../domain/formats/markdown.js";
import { rewriteRelativeLinks } from "../../../../../domain/formats/relative-link-rewrite.js";
import { mergeVscodeMcp } from "../../../../../domain/formats/vscode-mcp-merge.js";
import {
  FLAT_AGENT_OUTPUT_EXT,
  FLAT_GITHUB_AGENTS_PREFIX,
  FLAT_GITHUB_HOOKS_PREFIX,
  FLAT_GITHUB_SKILLS_PREFIX,
  FLAT_VSCODE_MCP_PATH,
  OUTPUT_MARKETPLACE_RELATIVE,
  OUTPUT_PLUGIN_MANIFEST_RELATIVE,
} from "../../../../../domain/models/framework-build.js";
import type { ToolBuildContract } from "../../build-contract.js";
import {
  resolveDescription,
  resolveVersion,
  synthesizeClaudeStyleManifest,
  transformClaudeAgent,
} from "../../marketplace-catalog.js";

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
