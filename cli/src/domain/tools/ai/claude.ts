import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { buildClaudeStyleMarketplaceEntry } from "../../capabilities/marketplace-entry.js";
import { McpCapability } from "../../capabilities/mcp-capability.js";
import { PluginsCapability } from "../../capabilities/plugins-capability.js";
import { RulesCapability } from "../../capabilities/rules-capability.js";
import { SkillsCapability } from "../../capabilities/skills-capability.js";
import type { UserFileSectionKey } from "../../formats/command.js";
import {
  convertCommandFrontmatter,
  detectSectionKeyFromPrefixes,
  reverseConvertCommandFrontmatter,
  stripToolSuffix,
} from "../../formats/command.js";
import { baseReverseRewriteContent, baseRewriteContent } from "../../formats/placeholders.js";
import { CONFIG_MCP } from "../../models/framework.js";
import type {
  AiTool,
  HasAgents,
  HasCommands,
  HasMcp,
  HasPlugins,
  HasRules,
  HasSkills,
} from "../contracts.js";
import { registerTool } from "../registry.js";

const DIRECTORY = ".claude/";
const TOOL_SUFFIX = ".claude.md";

function commandsDir(phase: string): string {
  return `${DIRECTORY}commands/aidd/${phase}/`;
}

export const claude: AiTool<HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasPlugins> =
  {
    kind: "ai",
    toolId: "claude",
    directory: DIRECTORY,
    toolSuffix: TOOL_SUFFIX,
    signalDir: ".claude/commands",
    configOutputPaths: { "settings.json": ".claude/settings.json" },

    capabilities: {
      agents: new AgentsCapability({
        directory: DIRECTORY,
        toolSuffix: TOOL_SUFFIX,
        format: "markdown",
      }),
      skills: new SkillsCapability({
        directory: DIRECTORY,
        toolSuffix: TOOL_SUFFIX,
        buildInstallPath: (fileName) =>
          `${DIRECTORY}skills/${stripToolSuffix(TOOL_SUFFIX, fileName)}`,
        convertFrontmatter: (fm) => fm,
        reverseConvertFrontmatter: (fm) => fm,
      }),
      commands: new CommandsCapability({
        directory: DIRECTORY,
        toolSuffix: TOOL_SUFFIX,
        buildInstallPath: (fileName) => {
          const slashIdx = fileName.indexOf("/");
          if (slashIdx !== -1) {
            const phaseDir = fileName.slice(0, slashIdx);
            const rest = fileName.slice(slashIdx + 1);
            const phase = phaseDir.match(/^(\d+)/)?.[1];
            if (phase) return `${commandsDir(phase)}${rest}`;
          }
          return `${DIRECTORY}commands/${stripToolSuffix(TOOL_SUFFIX, fileName)}`;
        },
        convertFrontmatter: (fm, relativeFileName) =>
          convertCommandFrontmatter(fm, relativeFileName),
        reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatter(fm),
      }),
      rules: new RulesCapability({
        directory: DIRECTORY,
        toolSuffix: TOOL_SUFFIX,
        buildInstallPath: (fileName) =>
          `${DIRECTORY}rules/${stripToolSuffix(TOOL_SUFFIX, fileName)}`,
        convertFrontmatter: (fm) => {
          if ("paths" in fm) {
            const paths = fm.paths;
            if (Array.isArray(paths) && paths.length === 0) return {};
            return { paths };
          }
          if ("globs" in fm) return { paths: fm.globs };
          if ("alwaysApply" in fm) {
            if (fm.alwaysApply === false && fm.description !== undefined) {
              return { description: fm.description };
            }
            return {};
          }
          return {};
        },
        reverseConvertFrontmatter: (fm) =>
          Array.isArray(fm.paths) && fm.paths.length > 0 ? { paths: fm.paths } : {},
      }),
      mcp: new McpCapability({
        outputPath: ".mcp.json",
        format: "json",
        entrySection: "mcpServers",
        consumes: [CONFIG_MCP],
      }),
      plugins: new PluginsCapability({
        mode: "native",
        pluginsDir: ".claude/plugins/",
        pluginManifestRelativePath: "plugin.json",
        acceptsHooks: true,
        acceptsMcp: true,
        translationMode: "marketplace",
        // Deliberately NOT driven through `claude plugin marketplace add`, though the
        // command exists and takes a local path. Measured: it writes `.claude/settings.json`
        // itself, after this CLI wrote it and recorded its hash — two writers, one
        // recorder, so `status` reports the file modified forever after. Claude Code
        // reads a project-local settings file, so writing it is sufficient; codex and
        // copilot are driven because for them it is not.
        marketplaceSettings: {
          settingsPath: ".claude/settings.json",
          settingsKey: "extraKnownMarketplaces",
          // The registered marketplace is the tree this CLI builds under `.aidd/cache/`,
          // named by absolute path, so the entry describes one machine and must not be
          // committed. Claude reads this file alongside the shared one, and it is the
          // file `claude plugin marketplace add --scope local` writes itself.
          marketplacesSettingsPath: ".claude/settings.local.json",
          enabledPluginsKey: "enabledPlugins",
          toEntry: buildClaudeStyleMarketplaceEntry,
        },
      }),
    },

    rewriteContent(content: string, docsDir: string): string {
      return baseRewriteContent(content, DIRECTORY, docsDir).replace(
        /(@?)\.claude\/commands\/(\d+)[_][^/]+\//g,
        (_, at, phase) => `${at}${commandsDir(phase)}`
      );
    },

    reverseRewriteContent(content: string, docsDir: string): string {
      return baseReverseRewriteContent(content, DIRECTORY, docsDir);
    },

    detectUserFileSectionKey(relativePath: string): UserFileSectionKey | null {
      return detectSectionKeyFromPrefixes(relativePath, [
        [`${DIRECTORY}agents/`, "agents"],
        [`${DIRECTORY}commands/aidd/`, "commands"],
        [`${DIRECTORY}rules/`, "rules"],
        [`${DIRECTORY}skills/`, "skills"],
      ]);
    },
  };

registerTool(claude);
