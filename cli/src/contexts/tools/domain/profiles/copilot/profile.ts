import { join } from "node:path";
import { GITKEEP_FILE } from "../../../../../kernel/file.js";
import { DOCS_DIR } from "../../../../../kernel/paths.js";
import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { CONFIG_MCP } from "../../capabilities/config-refs.js";
import { McpCapability } from "../../capabilities/mcp-capability.js";
import { PluginsCapability } from "../../capabilities/plugins-capability.js";
import { RulesCapability } from "../../capabilities/rules-capability.js";
import { SettingsCapability } from "../../capabilities/settings-capability.js";
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
import { PLUGIN_ROOT_TOKEN } from "../../formats/plugin-root-token.js";
import { claudeStyleMarketplaceKey } from "../../marketplace-entry.js";
import { registerTool } from "../../registry.js";
import { buildCopilotFlatContract, buildCopilotMarketplaceContract } from "./build.js";
import { COPILOT_WORKSPACE_DIR } from "./copilot-paths.js";

const DIRECTORY = COPILOT_WORKSPACE_DIR;
const TOOL_SUFFIX = ".copilot.md";

// Canon's framework-doc reference placeholders. Copilot is the only tool that rewrites
// content between the canonical form and its own workspace-relative paths, so these
// tokens live here rather than in a shared location nothing else reads.
const TOOLS_PLACEHOLDER = "{{TOOLS}}/";
const DOCS_PLACEHOLDER = "{{DOCS}}/";
const AT_TOOLS_PLACEHOLDER = "@{{TOOLS}}/";
const AT_DOCS_PLACEHOLDER = "@{{DOCS}}/";

const EXT_AGENT = ".agent.md";
const EXT_PROMPT = ".prompt.md";
const EXT_INSTRUCTIONS = ".instructions.md";

function escapedRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  // Unknown section: a predictable directory-prefixed default rather than a silently dropped
  // reference when a new section is added to the framework.
  return `${DIRECTORY}${path}`;
}

function rewriteCopilotContent(content: string): string {
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
          return `[${DOCS_DIR}/${path}](../../${DOCS_DIR}/${path})`;
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
      .replaceAll(DOCS_PLACEHOLDER, `${DOCS_DIR}/`)
  );
}

export const copilot: AiTool<
  HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasSettings & HasPlugins
> = {
  kind: "ai",
  toolId: "copilot",
  distributionProbes: {
    manifest: [".plugin/plugin.json", ".github/plugin/plugin.json", "plugin.json"],
    // `.github/plugin/plugin.json` is the manifest's own second-choice location, never a
    // marketplace catalog: a real build leaves one at `.plugin/marketplace.json`.
    marketplace: [".plugin/marketplace.json"],
  },
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  displayName: "GitHub Copilot",
  telemetryLocalRead: {
    kind: "declared",
    supplies: { tokenCounters: true, amount: false, toolStatedStep: false, agentName: false },
    // `input` is measured exclusive of `cache_read`: on a session carrying a non-zero
    // `cache_read`, 9 (`input`) + 42038 (`cache_read`) + 21404 (`cache_write`) = 63451, exactly
    // `modelMetrics.<model>.usage.inputTokens`. The four counters this reader stores are
    // therefore disjoint and the report is right to add them; an `input` that included
    // `cache_read` would have over-counted every Copilot session by its cached share.
    limitation:
      "Its own file names outputTokens per turn, but session.shutdown carries all four " +
      "counters for the whole session — a session total, never a sum of requests. Its four " +
      "counters are measured disjoint, cached prompt included.",
  },
  telemetryTaskAttributable: true,
  telemetryJournalHost: "copilot",
  signalDir: ".github/prompts",
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
      pluginRootToken: PLUGIN_ROOT_TOKEN,
      acceptsMcp: true,
      translationMode: "marketplace",
      // Copilot treats enabledPlugins in settings.json as a recommendation, not an auto-install,
      // and a project marketplace is not installable from project scope: `copilot plugin install`
      // is what actually loads a plugin, while the settings file below surfaces recommendations.
      // Its registry is global to the user and keyed by name, so a name held by a project that
      // no longer exists breaks every other project's installs — measured; `update` exits 1 on a
      // local path that is gone and 0 otherwise, which is what lets a dead name be reclaimed with
      // `--force` without ever taking one that still resolves.
      nativeActivation: {
        binary: "copilot",
        upgradeVerb: "update",
        enableVerb: "install",
        disableVerb: "uninstall",
        sourceCheckVerb: "update",
        forceRemoveArgs: ["--force"],
        // Where `copilot plugin marketplace add`/`install` land, measured against the real
        // binary. Never written by aidd; named here for a diagnostic alone.
        userSettingsPath: (h) => join(h, ".copilot", "settings.json"),
      },
      // VS Code Copilot reads this file, not the `copilot` CLI, which writes
      // ~/.copilot/settings.json and leaves this one untouched. `chat.plugins.marketplaces`
      // cannot stand in for it: it has application scope and VS Code rejects it in a workspace
      // .vscode/settings.json. This file is a shared, committed recommendation, so
      // `enabledPlugins`, which names plugins, belongs in it, while a marketplace registration
      // naming an absolute path on one machine does not — hence `null`, with the registration
      // driven through `copilot plugin install` instead.
      marketplaceSettings: {
        settingsPath: ".github/copilot/settings.json",
        settingsKey: "extraKnownMarketplaces",
        marketplacesSettingsPath: null,
        enabledPluginsKey: "enabledPlugins",
        toEntryKey: claudeStyleMarketplaceKey,
      },
    }),
  },

  rewriteContent: rewriteCopilotContent,
};

registerTool(copilot);
