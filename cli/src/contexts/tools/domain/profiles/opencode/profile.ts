import { join } from "node:path";
import { OpencodeDualConfigError } from "../../../../../kernel/errors.js";
import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { CONFIG_MCP, CONFIG_OPENCODE } from "../../capabilities/config-refs.js";
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
  convertCommandFrontmatterNoHint,
  stripToolSuffix,
} from "../../formats/command.js";
import { registerTool } from "../../registry.js";
import { buildOpencodeFlatContract, transformMcpToOpencode } from "./build.js";
import { OPENCODE_DIRECTORY, OPENCODE_FLAT_HOOKS_DIR } from "./opencode-paths.js";

const DIRECTORY = OPENCODE_DIRECTORY;
const FLAT_HOOKS_DIR = OPENCODE_FLAT_HOOKS_DIR;
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
  displayName: "OpenCode",
  telemetryLocalRead: {
    kind: "declared",
    // Counters per message, and no amount: `info.cost` is `0` in every message captured
    // and its denomination was never established, so it is deliberately never read. No
    // field names a running skill either.
    supplies: { tokenCounters: true, amount: false, toolStatedStep: false },
    // Measured 2026-08-20: `input` is exclusive of `cache.read` for providerID "anthropic",
    // matching that API's own documented behaviour. A second provider was probed 2026-08-24
    // (providerID "opencode") and reconciled the same way, but never exercised its cache
    // across two turns of one session — no capture puts a large `cache.read` beside `input`
    // for a non-Anthropic provider, so that probe corroborates without confirming. A
    // provider that reports prompt tokens inclusive of the cached ones, the way native
    // OpenAI's usage does, has never been captured here. See plugins/aidd-telemetry/README.md.
    limitation:
      "Its four counters are measured correct for the anthropic provider — not " +
      "independently confirmed for any other provider OpenCode can route to.",
  },
  telemetryTaskAttributable: true,
  telemetryJournalHost: "opencode",
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
      acceptsHooks: true,
      flatHooksDir: FLAT_HOOKS_DIR,
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
