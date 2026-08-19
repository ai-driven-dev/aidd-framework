import { join } from "node:path";
import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { McpCapability } from "../../capabilities/mcp-capability.js";
import { PluginsCapability } from "../../capabilities/plugins-capability.js";
import { RulesCapability } from "../../capabilities/rules-capability.js";
import { SkillsCapability } from "../../capabilities/skills-capability.js";
import {
  InvalidMcpServerConfigError,
  McpConfigError,
  OpencodeDualConfigError,
} from "../../errors.js";
import {
  buildAiddCommandFilePath,
  convertCommandFrontmatterNoHint,
  detectSectionKeyFromPrefixes,
  reverseConvertCommandFrontmatterNoHint,
  stripToolSuffix,
} from "../../formats/command.js";
import { baseReverseRewriteContent, baseRewriteContent } from "../../formats/placeholders.js";
import { CONFIG_MCP, CONFIG_OPENCODE } from "../../models/framework.js";
import type {
  AiTool,
  HasAgents,
  HasCommands,
  HasMcp,
  HasPlugins,
  HasRules,
  HasSkills,
  UserFileSectionKey,
} from "../contracts.js";
import { registerTool } from "../registry.js";

const DIRECTORY = ".opencode/";
const TOOL_SUFFIX = ".opencode.md";

type RawServer =
  | { command: string; args?: string[]; env?: Record<string, string>; disabled?: boolean }
  | { url: string; disabled?: boolean };

interface OpencodeMcpLocalServer {
  type: "local";
  command: string[];
  enabled: boolean;
  environment?: Record<string, string>;
}

interface OpencodeMcpRemoteServer {
  type: "remote";
  url: string;
  enabled: boolean;
}

type OpencodeMcpServer = OpencodeMcpLocalServer | OpencodeMcpRemoteServer;

function convertRawServer(name: string, server: RawServer): OpencodeMcpServer {
  const enabled = server.disabled !== true;
  if ("command" in server) {
    const { command, args = [], env } = server;
    const local: OpencodeMcpLocalServer = { type: "local", command: [command, ...args], enabled };
    if (env && Object.keys(env).length > 0) local.environment = env;
    return local;
  }
  if ("url" in server) {
    return { type: "remote", url: server.url, enabled };
  }
  throw new InvalidMcpServerConfigError(name);
}

export function transformMcpToOpencode(content: string): string {
  let parsed: { mcpServers?: Record<string, RawServer> };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch (err) {
    throw new McpConfigError(
      `Cannot parse MCP config: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new McpConfigError("MCP config must be a JSON object");
  }
  const mcp: Record<string, OpencodeMcpServer> = {};
  for (const [name, server] of Object.entries(parsed.mcpServers ?? {})) {
    mcp[name] = convertRawServer(name, server);
  }
  return JSON.stringify({ mcp }, null, 2);
}

export const opencode: AiTool<
  HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasPlugins
> = {
  kind: "ai",
  toolId: "opencode",
  displayName: "OpenCode",
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  signalDir: ".opencode/commands",
  configOutputPaths: { "opencode.json": "opencode.json" },

  capabilities: {
    agents: new AgentsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      format: "markdown",
      convertFrontmatter: (fm) => ({ description: fm.description, mode: "subagent" }),
      reverseConvertFrontmatter: (fm) => ({ description: fm.description }),
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
      buildInstallPath: (fileName) => buildAiddCommandFilePath(DIRECTORY, fileName),
      convertFrontmatter: (fm, relativeFileName) =>
        convertCommandFrontmatterNoHint(fm, relativeFileName),
      reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatterNoHint(fm),
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
      reverseConvertFrontmatter: () => ({}),
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

  telemetry: {
    kind: "planned",
    trackedIn: "#653",
  },

  // `session.id` on `ai.streamText` spans is documented behind `experimental.openTelemetry`,
  // but no session has been captured to confirm it against the hook-side identifier —
  // declared unmeasured rather than guessed.
  telemetryExport: {
    kind: "unmeasured",
  },

  rewriteContent(content: string, docsDir: string): string {
    return baseRewriteContent(content, DIRECTORY, docsDir).replace(
      /(@?)\.opencode\/commands\/(\d+)[_-][^/]+\/([^\s]+)/g,
      "$1.opencode/commands/aidd/$2/$3"
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

registerTool(opencode);
