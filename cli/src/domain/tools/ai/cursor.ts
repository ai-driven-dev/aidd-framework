import { join } from "node:path";
import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { McpCapability } from "../../capabilities/mcp-capability.js";
import { PluginsCapability } from "../../capabilities/plugins-capability.js";
import { RulesCapability } from "../../capabilities/rules-capability.js";
import { SkillsCapability } from "../../capabilities/skills-capability.js";
import {
  buildAiddCommandFilePath,
  convertCommandFrontmatter,
  detectSectionKeyFromPrefixes,
  reverseConvertCommandFrontmatter,
  stripToolSuffix,
} from "../../formats/command.js";
import { baseReverseRewriteContent, baseRewriteContent } from "../../formats/placeholders.js";
import { CURSOR_PLUGIN_ROOT_TOKEN } from "../../formats/plugin-root-token-rewrite.js";
import { CONFIG_MCP } from "../../models/framework.js";
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
    displayName: "Cursor",
    directory: DIRECTORY,
    toolSuffix: TOOL_SUFFIX,
    signalDir: ".cursor/commands",
    configOutputPaths: { "settings.json": ".cursor/settings.json" },

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
        buildInstallPath: (fileName) => buildAiddCommandFilePath(DIRECTORY, fileName),
        convertFrontmatter: (fm, relativeFileName) =>
          convertCommandFrontmatter(fm, relativeFileName),
        reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatter(fm),
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
        reverseConvertFrontmatter: (fm) => {
          const { globs } = fm;
          if (Array.isArray(globs) && globs.length > 0) return { paths: globs };
          if (typeof globs === "string") {
            try {
              const parsed = JSON.parse(globs);
              if (Array.isArray(parsed) && parsed.length > 0) return { paths: parsed };
            } catch {
              /* globs is not valid JSON */
            }
          }
          return {};
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
        // plugin-local: Cursor auto-discovers mcp.json at the plugin root, but never a
        // plugin-scope hooks.json - three probes (headless/interactive, auto-discovered
        // and explicit --plugin-dir, with and without a manifest) fired zero of seven
        // events. Only a project-scope .cursor/hooks.json is ever observed firing (see
        // measurements.md Phase 4/6), so hooksDestination routes hooks there instead of
        // here; hooksRelativePath/hooksContentFormat stay declared for the shape they
        // still describe but are no longer read for Cursor's own install.
        acceptsHooks: true,
        pluginRootToken: CURSOR_PLUGIN_ROOT_TOKEN,
        hooksRelativePath: "hooks.json",
        hooksContentFormat: "cursor",
        hooksDestination: "project",
        acceptsMcp: true,
        mcpRelativePath: "mcp.json",
        installScope: "user",
        userPluginsDir: (h) => join(h, ".cursor", "plugins", "local"),
      }),
    },

    // Measured: Cursor writes no token count in any file it produces — there is nothing
    // on disk for a local reader to find. A gap this deliverable names rather than fills;
    // see spec.md non-goals.
    telemetryLocalRead: {
      kind: "unsupported",
      reason: "It writes no token count in any file it produces.",
    },
    // A declared task no longer needs a written path in the payload at all - it reads a
    // tool call's own arguments the same way a step's skill name is read, and Cursor's
    // postToolUse payload carries tool_input on every call, exactly like Claude Code's.
    telemetryTaskAttributable: true,
    telemetryJournalHost: "cursor",

    rewriteContent(content: string, docsDir: string): string {
      return baseRewriteContent(content, DIRECTORY, docsDir)
        .replace(
          /(@?)\.cursor\/commands\/(\d+)[_-][^/]+\/([^\s]+)/g,
          "$1.cursor/commands/aidd/$2/$3"
        )
        .replace(/(@\.cursor\/rules\/[^\s]+)\.md\b/g, "$1.mdc");
    },

    reverseRewriteContent(content: string, docsDir: string): string {
      return baseReverseRewriteContent(
        content.replace(/(@\.cursor\/rules\/[^\s]+)\.mdc\b/g, "$1.md"),
        DIRECTORY,
        docsDir
      );
    },

    detectUserFileSectionKey(relativePath: string): UserFileSectionKey | null {
      if (relativePath.startsWith(`${DIRECTORY}rules/`)) {
        const key = relativePath.slice(`${DIRECTORY}rules/`.length);
        return { section: "rules", key: key.endsWith(".mdc") ? `${key.slice(0, -4)}.md` : key };
      }
      return detectSectionKeyFromPrefixes(relativePath, [
        [`${DIRECTORY}agents/`, "agents"],
        [`${DIRECTORY}commands/aidd/`, "commands"],
        [`${DIRECTORY}skills/`, "skills"],
      ]);
    },
  };

registerTool(cursor);
