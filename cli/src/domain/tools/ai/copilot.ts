import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { buildDefaultMarketplaceEntry } from "../../capabilities/marketplace-entry.js";
import { McpCapability } from "../../capabilities/mcp-capability.js";
import { PluginsCapability } from "../../capabilities/plugins-capability.js";
import { RulesCapability } from "../../capabilities/rules-capability.js";
import { SettingsCapability } from "../../capabilities/settings-capability.js";
import { SkillsCapability } from "../../capabilities/skills-capability.js";
import {
  convertCommandFrontmatter,
  reverseConvertCommandFrontmatter,
} from "../../formats/command.js";
import { PLUGIN_ROOT_TOKEN } from "../../formats/plugin-root-token-rewrite.js";
import {
  AT_DOCS_PLACEHOLDER,
  AT_TOOLS_PLACEHOLDER,
  CONFIG_MCP,
  DOCS_PLACEHOLDER,
  GITKEEP_FILE,
  TOOLS_PLACEHOLDER,
} from "../../models/framework.js";
import type {
  AiTool,
  HasAgents,
  HasCommands,
  HasMcp,
  HasPlugins,
  HasRules,
  HasSettings,
  HasSkills,
  UserFileSectionKey,
} from "../contracts.js";
import { registerTool } from "../registry.js";
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

function escapedRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  reverseConvertFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
    return { name: fm.name, description: fm.description };
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
  reverseConvertFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
    return reverseConvertCommandFrontmatter(fm);
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
  reverseConvertFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
    const { applyTo } = fm;
    if (typeof applyTo === "string" && applyTo !== "**") {
      return { paths: applyTo.split(",").map((s) => s.trim()) };
    }
    // applyTo: "**" or absent → no paths (always apply)
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
  reverseConvertFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
    return fm;
  },
};

function resolveInstalledPath(path: string): string {
  if (path.startsWith("agents/")) {
    const subPath = path.slice("agents/".length);
    if (subPath === "" || subPath.endsWith("/")) return `${DIRECTORY}agents/${subPath}`;
    return agentsHandler.buildFilePath(subPath) ?? `${DIRECTORY}${path}`;
  }
  if (path.startsWith("commands/")) {
    const subPath = path.slice("commands/".length);
    if (subPath === "" || subPath.endsWith("/")) return `${DIRECTORY}prompts/${subPath}`;
    return commandsHandler.buildFilePath(subPath) ?? `${DIRECTORY}${path}`;
  }
  if (path.startsWith("rules/")) {
    const subPath = path.slice("rules/".length);
    if (subPath === "" || subPath.endsWith("/")) return `${DIRECTORY}instructions/${subPath}`;
    return rulesHandler.buildFilePath(subPath) ?? `${DIRECTORY}${path}`;
  }
  if (path.startsWith("skills/")) {
    const subPath = path.slice("skills/".length);
    if (subPath === "" || subPath.endsWith("/")) return `${DIRECTORY}skills/${subPath}`;
    return skillsHandler.buildFilePath(subPath) ?? `${DIRECTORY}${path}`;
  }
  // Unknown section: fall back to raw directory-prefixed path.
  // If a new section is added to the framework, this produces a predictable
  // default rather than silently dropping the reference.
  return `${DIRECTORY}${path}`;
}

function rewriteCopilotContent(content: string, docsDir: string): string {
  return (
    content
      .replace(
        new RegExp(`${escapedRegex(AT_TOOLS_PLACEHOLDER)}([^\\s\`'">,]+)`, "g"),
        (_match, path: string) => {
          const fullPath = resolveInstalledPath(path);
          return `[${fullPath}](../../${fullPath})`;
        }
      )
      .replace(
        new RegExp(`${escapedRegex(AT_DOCS_PLACEHOLDER)}([^\\s\`'">,]+)`, "g"),
        (_match, path: string) => {
          return `[${docsDir}/${path}](../../${docsDir}/${path})`;
        }
      )
      // {{TOOLS}}/ (without @) replaces directory prefix only — used for path references in frontmatter or prose.
      // @{{TOOLS}}/ (with @) resolves to a full installed path via resolveInstalledPath — used for @-include syntax.
      .replaceAll("{{TOOLS}}/agents/", `${DIRECTORY}agents/`)
      .replace(/\{\{TOOLS\}\}\/commands\/([^\s\n`'">,]+)/g, (_match, path: string) => {
        const flat = flattenFileName(path, EXT_PROMPT);
        return `${DIRECTORY}prompts/${flat}`;
      })
      .replaceAll("{{TOOLS}}/rules/", `${DIRECTORY}instructions/`)
      .replaceAll("{{TOOLS}}/skills/", `${DIRECTORY}skills/`)
      .replaceAll(TOOLS_PLACEHOLDER, DIRECTORY)
      .replaceAll(DOCS_PLACEHOLDER, `${docsDir}/`)
  );
}

function reverseCopilotContent(content: string, docsDir: string): string {
  return content
    .replace(
      /\[\.github\/agents\/([^\]]+)\]\([^)]+\)/g,
      (_match, path: string) => `${AT_TOOLS_PLACEHOLDER}agents/${path}`
    )
    .replace(
      /\[\.github\/prompts\/([^\]]+)\]\([^)]+\)/g,
      (_match, path: string) => `${AT_TOOLS_PLACEHOLDER}commands/${path}`
    )
    .replace(
      /\[\.github\/instructions\/([^\]]+)\]\([^)]+\)/g,
      (_match, path: string) => `${AT_TOOLS_PLACEHOLDER}rules/${path}`
    )
    .replace(
      /\[\.github\/skills\/([^\]]+)\]\([^)]+\)/g,
      (_match, path: string) => `${AT_TOOLS_PLACEHOLDER}skills/${path}`
    )
    .replace(
      new RegExp(`\\[${escapedRegex(docsDir)}\\/([^\\]]+)\\]\\([^)]+\\)`, "g"),
      (_match: string, path: string) => `${AT_DOCS_PLACEHOLDER}${path}`
    )
    .replaceAll(`${DIRECTORY}agents/`, `${TOOLS_PLACEHOLDER}agents/`)
    .replaceAll(`${DIRECTORY}prompts/`, `${TOOLS_PLACEHOLDER}commands/`)
    .replaceAll(`${DIRECTORY}instructions/`, `${TOOLS_PLACEHOLDER}rules/`)
    .replaceAll(`${DIRECTORY}skills/`, `${TOOLS_PLACEHOLDER}skills/`)
    .replaceAll(DIRECTORY, TOOLS_PLACEHOLDER)
    .replaceAll(`${docsDir}/`, DOCS_PLACEHOLDER);
}

export const copilot: AiTool<
  HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasSettings & HasPlugins
> = {
  kind: "ai",
  toolId: "copilot",
  displayName: "GitHub Copilot",
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  signalDir: ".github/prompts",
  requiredIdeIds: ["vscode"] as const,

  capabilities: {
    agents: new AgentsCapability({
      directory: DIRECTORY,
      toolSuffix: EXT_AGENT,
      format: "markdown",
      userFileExt: EXT_AGENT,
      buildInstallPath: (fileName) => agentsHandler.buildFilePath(fileName),
      convertFrontmatter: (fm, fileName) => agentsHandler.convertFrontmatter(fm, fileName),
      reverseConvertFrontmatter: (fm) => agentsHandler.reverseConvertFrontmatter(fm),
    }),
    skills: new SkillsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => skillsHandler.buildFilePath(fileName),
      convertFrontmatter: (fm) => skillsHandler.convertFrontmatter(fm),
      reverseConvertFrontmatter: (fm) => skillsHandler.reverseConvertFrontmatter(fm),
    }),
    commands: new CommandsCapability({
      directory: DIRECTORY,
      toolSuffix: EXT_PROMPT,
      buildInstallPath: (fileName) => commandsHandler.buildFilePath(fileName),
      convertFrontmatter: (fm, relativeFileName) => convertCommandFrontmatter(fm, relativeFileName),
      reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatter(fm),
    }),
    rules: new RulesCapability({
      directory: DIRECTORY,
      toolSuffix: EXT_INSTRUCTIONS,
      inputSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => rulesHandler.buildFilePath(fileName),
      convertFrontmatter: (fm) => rulesHandler.convertFrontmatter(fm),
      reverseConvertFrontmatter: (fm) => rulesHandler.reverseConvertFrontmatter(fm),
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
      // Never measured against a running Copilot hook, unlike Codex's. This is what the
      // build route has been shipping, kept as-is rather than changed on a guess.
      pluginRootToken: PLUGIN_ROOT_TOKEN,
      acceptsMcp: true,
      translationMode: "marketplace",
      // Copilot treats enabledPlugins in settings.json as a recommendation, not an
      // auto-install (github/copilot-cli#2249); the project marketplace is also not
      // installable from project scope (#3088). Drive `copilot plugin install` to
      // actually load plugins — the settings file below still surfaces recommendations.
      nativeActivation: { binary: "copilot" },
      // VS Code Copilot: extraKnownMarketplaces in .github/copilot/settings.json.
      // chat.plugins.marketplaces has application scope and cannot be set in workspace
      // .vscode/settings.json — VSCode rejects it with "This setting has an application scope".
      // Source: https://code.visualstudio.com/docs/copilot/customization/agent-plugins
      marketplaceSettings: {
        settingsPath: ".github/copilot/settings.json",
        settingsKey: "extraKnownMarketplaces",
        enabledPluginsKey: "enabledPlugins",
        toEntry: buildDefaultMarketplaceEntry,
      },
    }),
  },

  telemetry: {
    kind: "environment-variable",
    variable: "COPILOT_OTEL_ENABLED",
    value: "true",
  },

  // Measured 2026-08-13, zero-credit to verify: `gen_ai.conversation.id` lives on the
  // `invoke_agent` span, not on a log record or a metric — a receiver that only listens
  // to /v1/logs and /v1/metrics never sees the one attribute that identifies a Copilot
  // session.
  telemetryExport: {
    kind: "declared",
    identityAttribute: "gen_ai.conversation.id",
    // The identifier lives on the `invoke_agent` span, and the receiver listens on
    // `/v1/logs` and `/v1/metrics` only - so nothing has ever reached storage by this
    // route, whatever the payload may hold.
    supplies: { tokenCounters: false, amount: false, toolStatedStep: false },
  },

  // Measured on #697, against a real ~/.copilot/session-state/<id>/events.jsonl:
  // `session.shutdown`'s own `tokenDetails` carries all four counters, but once, for the
  // whole session — never per request, so no per-step record can be built from it. No
  // `transcript` location: the session id names the file exactly
  // (~/.copilot/session-state/<id>/events.jsonl), so `CopilotCostReaderAdapter` opens it
  // directly rather than walking a directory to find it — see domain/formats/
  // copilot-events.ts for the reader and the arithmetic that settles it.
  telemetryLocalRead: {
    kind: "declared",
    supplies: { tokenCounters: true, amount: false, toolStatedStep: false },
    limitation:
      "Its own file names outputTokens per turn, but session.shutdown carries all four " +
      "counters for the whole session — a session total, never a sum of requests.",
  },
  telemetryTaskAttributable: false,
  telemetryJournalHost: "copilot",

  rewriteContent: rewriteCopilotContent,

  reverseRewriteContent: reverseCopilotContent,

  detectUserFileSectionKey(relativePath: string): UserFileSectionKey | null {
    if (relativePath.startsWith(`${DIRECTORY}agents/`)) {
      const base = relativePath.slice(`${DIRECTORY}agents/`.length);
      const key = base.endsWith(EXT_AGENT) ? `${base.slice(0, -EXT_AGENT.length)}.md` : base;
      return { section: "agents", key };
    }
    if (relativePath.startsWith(`${DIRECTORY}skills/`)) {
      return { section: "skills", key: relativePath.slice(`${DIRECTORY}skills/`.length) };
    }
    // commands (prompts) and rules (instructions) use flattenFileName which is not reversible
    return null;
  },
};

registerTool(copilot);
