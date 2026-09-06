import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { CONFIG_MCP } from "../../capabilities/config-refs.js";
import { McpCapability } from "../../capabilities/mcp-capability.js";
import { PluginsCapability } from "../../capabilities/plugins-capability.js";
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
import { convertCommandFrontmatter, stripToolSuffix } from "../../formats/command.js";
import { CLAUDE_PLUGIN_ROOT_TOKEN } from "../../formats/plugin-root-token.js";
import { claudeStyleMarketplaceKey } from "../../marketplace-entry.js";
import { registerTool } from "../../registry.js";
import { buildClaudeContract, buildClaudeFlatContract } from "./build.js";
import { CLAUDE_CODE_TRANSCRIPT_LOCATION } from "./claude-transcript-location.js";

const DIRECTORY = ".claude/";
const TOOL_SUFFIX = ".claude.md";

function commandsDir(phase: string): string {
  return `${DIRECTORY}commands/aidd/${phase}/`;
}

export const claude: AiTool<HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasPlugins> =
  {
    kind: "ai",
    toolId: "claude",
    distributionProbes: {
      manifest: [".claude-plugin/plugin.json"],
      marketplace: [".claude-plugin/marketplace.json"],
    },
    directory: DIRECTORY,
    toolSuffix: TOOL_SUFFIX,
    displayName: "Claude Code",
    telemetryLocalRead: {
      kind: "declared",
      transcript: CLAUDE_CODE_TRANSCRIPT_LOCATION,
      // The mirror image of the export: the transcript names the running skill exactly, on
      // the same line as the counters, and carries no amount at all.
      supplies: { tokenCounters: true, amount: false, toolStatedStep: true, agentName: true },
    },
    telemetryTaskAttributable: true,
    telemetryJournalHost: "claude-code",
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
        pluginRootToken: CLAUDE_PLUGIN_ROOT_TOKEN,
        acceptsMcp: true,
        translationMode: "marketplace",
        // Claude registers its own marketplaces and enables its own plugins, both driven
        // here. An earlier attempt drove them at project scope, where the command rewrites
        // `.claude/settings.json` after this CLI hashed it — two writers, one recorder, and
        // `status` reporting drift forever. `--scope local` writes `.claude/settings.local.json`
        // instead, a file this CLI neither writes nor tracks, so nothing collides. Measured.
        // That is what makes the verbs below safe to declare, and it is the whole of the
        // reason: without the scope mapping they would be the second writer again.
        nativeActivation: {
          binary: "claude",
          scopeArgs: { project: ["--scope", "local"], user: ["--scope", "user"] },
          enableVerb: "install",
          disableVerb: "uninstall",
          upgradeVerb: "update",
          // `--yes` gates a prune confirmation these calls never request, but a headless
          // stdin has no terminal to answer any prompt at all.
          pluginArgs: ["--yes"],
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
          toEntryKey: claudeStyleMarketplaceKey,
        },
      }),
    },

    rewriteContent(content: string): string {
      return content.replace(
        /(@?)\.claude\/commands\/(\d+)[_][^/]+\//g,
        (_, at, phase) => `${at}${commandsDir(phase)}`
      );
    },
  };

registerTool(claude);
