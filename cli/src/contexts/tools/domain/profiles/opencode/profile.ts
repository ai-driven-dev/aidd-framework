import { join } from "node:path";
import { OpencodeDualConfigError } from "../../../../../kernel/errors.js";
import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { CONFIG_MCP, CONFIG_OPENCODE } from "../../capabilities/config-refs.js";
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
  convertCommandFrontmatterNoHint,
  stripToolSuffix,
} from "../../formats/command.js";
import { McpCapability } from "../../mcp-capability.js";
import { PluginsCapability } from "../../plugins-capability.js";
import { registerTool } from "../../registry.js";
import { buildOpencodeFlatContract, transformMcpToOpencode } from "./build.js";

const DIRECTORY = ".opencode/";
const TOOL_SUFFIX = ".opencode.md";

export const opencode: AiTool<
  HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasPlugins
> = {
  kind: "ai",
  toolId: "opencode",
  distributionProbes: {
    marketplace: ["opencode.json"],
  },
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  signalDir: ".opencode/commands",
  configOutputPaths: { "opencode.json": "opencode.json" },
  buildContracts: { flat: buildOpencodeFlatContract },

  capabilities: {
    agents: new AgentsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      format: "markdown",
      convertFrontmatter: (fm) => ({ description: fm.description, mode: "subagent" }),
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
        convertCommandFrontmatterNoHint(fm, relativeFileName),
    }),
    rules: new RulesCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => `${DIRECTORY}rules/${stripToolSuffix(TOOL_SUFFIX, fileName)}`,
      convertFrontmatter: (fm) => {
        if (fm.alwaysApply === false && fm.description !== undefined) {
          return { description: fm.description };
        }
        return {};
      },
    }),
    mcp: new McpCapability({
      outputPath: "opencode.json",
      format: "json",
      entrySection: "mcp",
      mergeStrategy: "framework-prime",
      transformContent: transformMcpToOpencode,
      consumes: [CONFIG_MCP, CONFIG_OPENCODE],
      resolveOutputPath: async (projectRoot, fs) => {
        const jsonExists = await fs.fileExists(join(projectRoot, "opencode.json"));
        const jsoncExists = await fs.fileExists(join(projectRoot, "opencode.jsonc"));
        if (jsonExists && jsoncExists) throw new OpencodeDualConfigError();
        if (jsoncExists) return "opencode.jsonc";
        return "opencode.json";
      },
    }),
    // marketplaceSettings is not available in flat mode (FlatPluginsParams has no such field).
    // Additionally, opencode's plugin[] array accepts only npm package name strings —
    // there is no source/version concept that a marketplace entry could express.
    plugins: new PluginsCapability({
      mode: "flat",
      flatNamespacePrefix: "aidd-",
    }),
  },

  rewriteContent(content: string): string {
    return content.replace(
      /(@?)\.opencode\/commands\/(\d+)[_-][^/]+\/([^\s]+)/g,
      "$1.opencode/commands/aidd/$2/$3"
    );
  },
};

registerTool(opencode);
