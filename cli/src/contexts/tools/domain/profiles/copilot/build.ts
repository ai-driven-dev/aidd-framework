/**
 * Copilot's ToolBuildContract: marketplace (OpenPlugin format) and flat
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
import { stripAgentFrontmatter } from "../../formats/agent-frontmatter-strip.js";
import { flattenCopilotHooksShape } from "../../formats/flat-hooks-merge.js";
import { mergeVscodeMcp } from "../../formats/vscode-mcp-merge.js";
import {
  resolveDescription,
  resolveVersion,
  synthesizeClaudeStyleManifest,
  transformClaudeAgent,
} from "../../marketplace-catalog.js";
import { COPILOT_VSCODE_MCP_PATH, COPILOT_WORKSPACE_DIR } from "./copilot-paths.js";

/** Path where the synthesized OpenPlugin-format plugin manifest is written. */
const OUTPUT_PLUGIN_MANIFEST_RELATIVE = ".plugin/plugin.json";

/** Path where the synthesized OpenPlugin-format marketplace catalog is written. */
const OUTPUT_MARKETPLACE_RELATIVE = ".plugin/marketplace.json";

/** Output prefix for agents in flat mode: .github/agents/<plugin>/<name>.agent.md */
const FLAT_GITHUB_AGENTS_PREFIX = `${COPILOT_WORKSPACE_DIR}agents/`;

/** Output prefix for skills in flat mode: .github/skills/<plugin>/<name>/ */
const FLAT_GITHUB_SKILLS_PREFIX = `${COPILOT_WORKSPACE_DIR}skills/`;

/** Output prefix for hooks in flat mode: .github/hooks/<plugin>.hooks.json */
const FLAT_GITHUB_HOOKS_PREFIX = `${COPILOT_WORKSPACE_DIR}hooks/`;

/** Path to the VS Code workspace MCP config merged in flat mode. */
const FLAT_VSCODE_MCP_PATH = COPILOT_VSCODE_MCP_PATH;

/** File extension for agent files in flat output (workspace canonical). */
const FLAT_AGENT_OUTPUT_EXT = ".agent.md";

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
