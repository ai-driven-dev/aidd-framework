import { join } from "node:path";
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
import {
  buildAiddCommandFilePath,
  convertCommandFrontmatter,
  stripToolSuffix,
} from "../../formats/command.js";
import { registerTool } from "../../registry.js";
import { buildCursorContract, buildCursorFlatContract } from "./build.js";

const DIRECTORY = ".cursor/";
const TOOL_SUFFIX = ".cursor.md";
const MDC_EXT = ".mdc";

function toMdc(fileName: string): string {
  return fileName.endsWith(".md") ? `${fileName.slice(0, -3)}${MDC_EXT}` : fileName;
}

export const cursor: AiTool<HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasPlugins> =
  {
    kind: "ai",
    toolId: "cursor",
    distributionProbes: {
      manifest: [".cursor-plugin/plugin.json"],
      marketplace: [".cursor-plugin/marketplace.json"],
    },
    directory: DIRECTORY,
    toolSuffix: TOOL_SUFFIX,
    signalDir: ".cursor/commands",
    configOutputPaths: { "settings.json": ".cursor/settings.json" },
    buildContracts: { marketplace: buildCursorContract, flat: buildCursorFlatContract },

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
        buildInstallPath: (fileName) => buildAiddCommandFilePath(DIRECTORY, fileName),
        convertFrontmatter: (fm, relativeFileName) =>
          convertCommandFrontmatter(fm, relativeFileName),
      }),
      rules: new RulesCapability({
        directory: DIRECTORY,
        toolSuffix: TOOL_SUFFIX,
        buildInstallPath: (fileName) =>
          `${DIRECTORY}rules/${toMdc(stripToolSuffix(TOOL_SUFFIX, fileName))}`,
        convertFrontmatter: (fm) => {
          const { paths, globs, description } = fm;
          const patterns = Array.isArray(paths) ? paths : Array.isArray(globs) ? globs : null;
          if (patterns === null || patterns.length === 0) {
            if (fm.alwaysApply === false && description !== undefined) {
              return { description, alwaysApply: false };
            }
            return {};
          }
          const result: Record<string, unknown> = {};
          if (description !== undefined) result.description = description;
          return {
            ...result,
            globs: JSON.stringify(patterns).replace(/,/g, ", "),
            alwaysApply: false,
          };
        },
      }),
      mcp: new McpCapability({
        outputPath: `${DIRECTORY}mcp.json`,
        format: "json",
        entrySection: "mcpServers",
        consumes: [CONFIG_MCP],
      }),
      plugins: new PluginsCapability({
        mode: "native",
        // Empty pluginsDir so translateNativeWithPaths computes pluginRoot = "<pluginName>/"
        // (base-relative keys like "aidd-context/commands/foo.md" per D2).
        pluginsDir: "",
        pluginManifestRelativePath: null,
        // plugin-local: Cursor auto-discovers hooks.json and mcp.json at the plugin root.
        acceptsHooks: true,
        hooksRelativePath: "hooks.json",
        hooksContentFormat: "flat",
        acceptsMcp: true,
        mcpRelativePath: "mcp.json",
        installScope: "user",
        userPluginsDir: (h) => join(h, ".cursor", "plugins", "local"),
      }),
    },

    rewriteContent(content: string): string {
      return content
        .replace(
          /(@?)\.cursor\/commands\/(\d+)[_-][^/]+\/([^\s]+)/g,
          "$1.cursor/commands/aidd/$2/$3"
        )
        .replace(/(@\.cursor\/rules\/[^\s]+)\.md\b/g, "$1.mdc");
    },
  };

registerTool(cursor);
