import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { McpCapability } from "../../capabilities/mcp-capability.js";
import { PluginsCapability } from "../../capabilities/plugins-capability.js";
import { SkillsCapability } from "../../capabilities/skills-capability.js";
import { detectSectionKeyFromPrefixes } from "../../formats/command.js";
import { baseReverseRewriteContent, baseRewriteContent } from "../../formats/placeholders.js";
import { CONFIG_MCP } from "../../models/framework.js";
import type {
  AiTool,
  HasAgents,
  HasMcp,
  HasPlugins,
  HasSkills,
  UserFileSectionKey,
} from "../contracts.js";
import { registerTool } from "../registry.js";

const DIRECTORY = ".gemini/";
const TOOL_SUFFIX = ".gemini.md";
const AGENTS_SKILLS_PREFIX = ".agents/skills/";

function skillNameFromPath(fileName: string): string {
  const parts = fileName.split("/");
  if (parts.length > 1) return parts[0];
  const base = parts[0];
  if (base.endsWith(TOOL_SUFFIX)) return base.slice(0, -TOOL_SUFFIX.length);
  if (base.endsWith(".md")) return base.slice(0, -3);
  return base;
}

function buildGeminiSkillFilePath(fileName: string): string {
  return `${AGENTS_SKILLS_PREFIX}aidd-${skillNameFromPath(fileName)}/SKILL.md`;
}

function stripGeminiSkillFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (fm.name !== undefined) result.name = fm.name;
  if (fm.description !== undefined) result.description = fm.description;
  return result;
}

export const gemini: AiTool<HasAgents & HasSkills & HasMcp & HasPlugins> = {
  kind: "ai",
  toolId: "gemini",
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  signalDir: `${DIRECTORY}agents`,

  capabilities: {
    agents: new AgentsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      format: "markdown",
    }),
    skills: new SkillsCapability({
      prefix: "aidd-",
      buildInstallPath: buildGeminiSkillFilePath,
      convertFrontmatter: stripGeminiSkillFrontmatter,
      reverseConvertFrontmatter: (fm) => fm,
    }),
    mcp: new McpCapability({
      outputPath: ".gemini/settings.json",
      format: "json",
      entrySection: "mcpServers",
      mergeStrategy: "framework-prime",
      consumes: [CONFIG_MCP],
    }),
    // Gemini CLI has no plugin-manager equivalent (no marketplace, no native activation).
    // Plugin install/propagation for gemini is out of scope for this build target.
    plugins: new PluginsCapability({ mode: "unsupported" }),
  },

  rewriteContent(content: string, docsDir: string): string {
    return baseRewriteContent(content, DIRECTORY, docsDir);
  },

  reverseRewriteContent(content: string, docsDir: string): string {
    return baseReverseRewriteContent(content, DIRECTORY, docsDir);
  },

  detectUserFileSectionKey(relativePath: string): UserFileSectionKey | null {
    return detectSectionKeyFromPrefixes(relativePath, [
      [`${AGENTS_SKILLS_PREFIX}aidd-`, "skills"],
      [`${DIRECTORY}agents/`, "agents"],
    ]);
  },
};

registerTool(gemini);
