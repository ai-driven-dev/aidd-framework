import { GITKEEP_FILE } from "../../../../../kernel/file.js";
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
  HasSettings,
  HasSkills,
} from "../../contracts.js";
import { convertCommandFrontmatter } from "../../formats/command.js";
import { buildClaudeStyleMarketplaceEntry } from "../../marketplace-entry.js";
import { McpCapability } from "../../mcp-capability.js";
import { PluginsCapability } from "../../plugins-capability.js";
import { registerTool } from "../../registry.js";
import { SettingsCapability } from "../../settings-capability.js";
import { buildCopilotFlatContract, buildCopilotMarketplaceContract } from "./build.js";
import { COPILOT_WORKSPACE_DIR } from "./copilot-paths.js";

const DIRECTORY = COPILOT_WORKSPACE_DIR;
const TOOL_SUFFIX = ".copilot.md";

const EXT_AGENT = ".agent.md";
const EXT_PROMPT = ".prompt.md";
const EXT_INSTRUCTIONS = ".instructions.md";

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function flattenFileName(
  fileName: string,
  targetExt: string,
  options: { toolSuffix?: string; stripNumericPrefix?: boolean } = {}
): string {
  const parts = fileName.split("/");
  let baseName = parts[parts.length - 1];

  if (options.stripNumericPrefix) {
    baseName = baseName.replace(/^\d+[_-]/, "");
  }
  if (options.toolSuffix && baseName.endsWith(options.toolSuffix)) {
    baseName = `${baseName.slice(0, -options.toolSuffix.length)}.md`;
  }
  baseName = baseName.replaceAll("_", "-");

  const withExt = addTargetExtension(baseName, targetExt);

  if (parts.length === 1) {
    return withExt;
  }

  const prefix = buildPrefix(parts.slice(0, -1).join("/"));
  return `${prefix}-${withExt}`;
}

function buildPrefix(subPath: string): string {
  return subPath
    .split("/")
    .map((p) => p.replace(/^(\d+)[_-].*$/, "$1"))
    .join("-");
}

function addTargetExtension(baseName: string, targetExt: string): string {
  if (baseName.endsWith(targetExt)) return baseName;
  const withoutMd = baseName.endsWith(".md") ? baseName.slice(0, -3) : baseName;
  return `${withoutMd}${targetExt}`;
}

const agentsHandler = {
  buildFilePath(fileName: string): string | null {
    const base = basename(fileName);
    if (base === GITKEEP_FILE) return null;
    const name = base.endsWith(".md") ? `${base.slice(0, -3)}${EXT_AGENT}` : base;
    return `${DIRECTORY}agents/${name}`;
  },
  convertFrontmatter(fm: Record<string, unknown>, fileName?: string): Record<string, unknown> {
    const base = fileName?.split("/").at(-1);
    const name = fm.name ?? base?.replace(/\.md$/, "");
    return { name: typeof name === "string" ? name : undefined, description: fm.description };
  },
};

const commandsHandler = {
  buildFilePath(fileName: string): string | null {
    const base = basename(fileName);
    if (base === GITKEEP_FILE) return null;
    const flat = flattenFileName(fileName, EXT_PROMPT);
    return `${DIRECTORY}prompts/${flat}`;
  },
  convertFrontmatter(
    fm: Record<string, unknown>,
    relativeFileName: string
  ): Record<string, unknown> {
    return convertCommandFrontmatter(fm, relativeFileName);
  },
};

const rulesHandler = {
  buildFilePath(fileName: string): string | null {
    const base = basename(fileName);
    if (base === GITKEEP_FILE) return null;
    const flat = flattenFileName(fileName, EXT_INSTRUCTIONS, {
      toolSuffix: TOOL_SUFFIX,
      stripNumericPrefix: true,
    });
    return `${DIRECTORY}instructions/${flat}`;
  },
  convertFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
    const { paths, globs } = fm;
    const patterns = Array.isArray(paths) ? paths : Array.isArray(globs) ? globs : null;
    if (patterns !== null && patterns.length > 0) return { applyTo: patterns.join(",") };
    if (fm.alwaysApply === false && fm.description !== undefined) {
      return { description: fm.description };
    }
    return {};
  },
};

const skillsHandler = {
  buildFilePath(fileName: string): string | null {
    const base = basename(fileName);
    if (base === GITKEEP_FILE) return null;
    return `${DIRECTORY}skills/${fileName}`;
  },
  convertFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
    return fm;
  },
};

export const copilot: AiTool<
  HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasSettings & HasPlugins
> = {
  kind: "ai",
  toolId: "copilot",
  distributionProbes: {
    manifest: [".plugin/plugin.json", ".github/plugin/plugin.json", "plugin.json"],
    marketplace: [".github/plugin/plugin.json"],
  },
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  signalDir: ".github/prompts",
  requiredIdeIds: ["vscode"] as const,
  buildContracts: {
    marketplace: buildCopilotMarketplaceContract,
    flat: buildCopilotFlatContract,
  },

  capabilities: {
    agents: new AgentsCapability({
      directory: DIRECTORY,
      toolSuffix: EXT_AGENT,
      format: "markdown",
      userFileExt: EXT_AGENT,
      buildInstallPath: (fileName) => agentsHandler.buildFilePath(fileName),
      convertFrontmatter: (fm, fileName) => agentsHandler.convertFrontmatter(fm, fileName),
    }),
    skills: new SkillsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => skillsHandler.buildFilePath(fileName),
      convertFrontmatter: (fm) => skillsHandler.convertFrontmatter(fm),
    }),
    commands: new CommandsCapability({
      directory: DIRECTORY,
      toolSuffix: EXT_PROMPT,
      buildInstallPath: (fileName) => commandsHandler.buildFilePath(fileName),
      convertFrontmatter: (fm, relativeFileName) => convertCommandFrontmatter(fm, relativeFileName),
    }),
    rules: new RulesCapability({
      directory: DIRECTORY,
      toolSuffix: EXT_INSTRUCTIONS,
      inputSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => rulesHandler.buildFilePath(fileName),
      convertFrontmatter: (fm) => rulesHandler.convertFrontmatter(fm),
    }),
    mcp: new McpCapability({
      outputPath: ".vscode/mcp.json",
      format: "json",
      entrySection: "servers",
      consumes: [CONFIG_MCP],
      transformContent: (content) => {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if ("mcpServers" in parsed && !("servers" in parsed)) {
          const { mcpServers, ...rest } = parsed as { mcpServers: unknown } & Record<
            string,
            unknown
          >;
          return JSON.stringify({ ...rest, servers: mcpServers }, null, 2);
        }
        return content;
      },
    }),
    settings: new SettingsCapability({
      outputPath: ".vscode/settings.json",
      mergeStrategy: "framework-prime",
      staticContentAssetFile: "vscode-settings.json",
      requiresTool: "vscode",
    }),
    plugins: new PluginsCapability({
      mode: "native",
      pluginsDir: ".github/plugins/",
      pluginManifestRelativePath: "plugin.json",
      acceptsHooks: true,
      acceptsMcp: true,
      translationMode: "marketplace",
      // Copilot treats enabledPlugins in settings.json as a recommendation, not an
      // auto-install (github/copilot-cli#2249); the project marketplace is also not
      // installable from project scope (#3088). Drive `copilot plugin install` to
      // actually load plugins — the settings file below still surfaces recommendations.
      // Copilot's registry is global to the user and keyed by name, so a name can be
      // held by a project that no longer exists — measured, and it then breaks every
      // other project's plugin installs. `update` is what tells the two apart: it exits
      // 1 on a local path that is gone and 0 otherwise, so a dead name can be reclaimed
      // with `--force` without ever taking one that still resolves.
      nativeActivation: {
        binary: "copilot",
        upgradeVerb: "update",
        enableVerb: "install",
        sourceCheckVerb: "update",
        forceRemoveArgs: ["--force"],
      },
      // VS Code Copilot reads this file, not the `copilot` CLI — measured: `copilot
      // plugin marketplace add` writes ~/.copilot/settings.json and leaves this one
      // untouched. `chat.plugins.marketplaces` cannot stand in for it either: it has
      // application scope and VS Code rejects it in workspace .vscode/settings.json.
      // Source: https://code.visualstudio.com/docs/copilot/customization/agent-plugins
      //
      // That documentation also states what the file is for: "Projects can recommend
      // plugins for team members by configuring plugin settings in the workspace
      // settings". It is a shared, committed recommendation — so `enabledPlugins`,
      // which names plugins, belongs in it, and the marketplace registrations, which
      // name an absolute path on the machine that ran the install, do not. Copilot
      // offers no machine-local project file to hold them, hence `null`: this CLI
      // writes them nowhere, and drives `copilot plugin install` to register for real.
      marketplaceSettings: {
        settingsPath: ".github/copilot/settings.json",
        settingsKey: "extraKnownMarketplaces",
        marketplacesSettingsPath: null,
        enabledPluginsKey: "enabledPlugins",
        toEntry: buildClaudeStyleMarketplaceEntry,
      },
    }),
  },

  /**
   * Copilot rewrites paths when it builds a file's install location, never inside the
   * content. The one thing it used to change in content was the `{{TOOLS}}` / `{{DOCS}}`
   * placeholder syntax, which no framework emits any more.
   */
  rewriteContent(content: string): string {
    return content;
  },
};

registerTool(copilot);
