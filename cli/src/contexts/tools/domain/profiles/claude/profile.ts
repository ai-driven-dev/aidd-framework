import { buildClaudeStyleMarketplaceEntry } from "../../../../../domain/capabilities/marketplace-entry.js";
import { PluginsCapability } from "../../../../../domain/capabilities/plugins-capability.js";
import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { CONFIG_MCP } from "../../capabilities/config-refs.js";
import { RulesCapability } from "../../capabilities/rules-capability.js";
import { SkillsCapability } from "../../capabilities/skills-capability.js";
import type {
  AiTool,
  HasAgents,
  HasCommands,
  HasMcp,
  HasPlugins,
  HasRules,
  HasSkills,
} from "../../contracts.js";
import type { UserFileSectionKey } from "../../formats/command.js";
import {
  convertCommandFrontmatter,
  detectSectionKeyFromPrefixes,
  reverseConvertCommandFrontmatter,
  stripToolSuffix,
} from "../../formats/command.js";
import { baseReverseRewriteContent, baseRewriteContent } from "../../formats/placeholders.js";
import { McpCapability } from "../../mcp-capability.js";
import { registerTool } from "../../registry.js";
import { buildClaudeContract, buildClaudeFlatContract } from "./build.js";

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
    buildContracts: { marketplace: buildClaudeContract, flat: buildClaudeFlatContract },

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
        // Claude registers its own marketplaces. An earlier attempt drove the command
        // at project scope, where it rewrites `.claude/settings.json` after this CLI
        // hashed it — two writers, one recorder, and `status` reporting drift forever.
        // `--scope local` writes `.claude/settings.local.json` instead, a file this CLI
        // does not write and does not track, so nothing collides. Measured.
        //
        // No `enableVerb`: `claude plugin install --scope project` writes exactly
        // `{"<plugin>@<marketplace>": true}` into `.claude/settings.json`, character for
        // character what this CLI already writes there. Driving it would be a second way
        // of doing the same thing, and would hand a tracked file a second writer.
        nativeActivation: {
          binary: "claude",
          scopeArgs: { project: ["--scope", "local"], user: ["--scope", "user"] },
        },
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
