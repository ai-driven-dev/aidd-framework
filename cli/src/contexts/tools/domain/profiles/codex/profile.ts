import { CODEX_ROLLOUT_LOCATION } from "../../../../../contexts/tools/domain/profiles/codex/codex-transcript-location.js";
import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { CONFIG_MCP } from "../../capabilities/config-refs.js";
import { HooksCapability } from "../../capabilities/hooks-capability.js";
import { McpCapability } from "../../capabilities/mcp-capability.js";
import { PluginsCapability } from "../../capabilities/plugins-capability.js";
import { RulesCapability } from "../../capabilities/rules-capability.js";
import { SkillsCapability } from "../../capabilities/skills-capability.js";
import type {
  AiTool,
  HasAgents,
  HasCommands,
  HasHooks,
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
import { PLUGIN_ROOT_TOKEN } from "../../formats/plugin-root-token.js";
import { registerTool } from "../../registry.js";
import {
  buildCodexContract,
  buildCodexFlatContract,
  mergeCodexConfigToml,
  stripCodexSkillFrontmatter,
} from "./build.js";

const DIRECTORY = ".codex/";
const TOOL_SUFFIX = ".codex.md";
const AGENTS_SKILLS_PREFIX = ".agents/skills/";

const SKILLS_TO_AGENTS_RE = /\.codex\/skills\//g;

function remapSkillPaths(content: string): string {
  return content.replace(SKILLS_TO_AGENTS_RE, ".agents/skills/aidd-");
}

export function rewriteCodexContent(content: string): string {
  return remapSkillPaths(content).replace(
    /(@?)\.codex\/commands\/(\d+)[_-][^/]+\/([^\s]+)/g,
    "$1.codex/commands/aidd/$2/$3"
  );
}

const CONFIG_CODEX_HOOKS = "codex-hooks";

// Measured: four consecutive `codex exec` sessions installed a plugin's
// hooks, ran clean, and journaled nothing — no warning, no line in the output — until
// `--dangerously-bypass-hook-trust` made the same install produce all three hooks and its
// journal. Codex writes one `trusted_hash` per hook under `[hooks.state]` in
// `~/.codex/config.toml` when a person approves it; a hook with no entry is skipped in
// silence, and nothing prompts for it outside a terminal.
const CODEX_HOOKS_TRUST_NOTICE =
  "Codex will not run this plugin's hooks until each one is trusted — approve the prompt " +
  "once in an interactive session, or pass --dangerously-bypass-hook-trust to codex exec " +
  "for a headless run. Until then, a session leaves no run journal and nothing says why.";

const AIDD_HOOK_COMMAND = "node .aidd/scripts/update_memory.cjs";

const AIDD_HOOK_ENTRY = {
  type: "command",
  command: AIDD_HOOK_COMMAND,
  statusMessage: "Syncing AIDD memory...",
  timeout: 30,
};

const AIDD_SESSION_START_ENTRY = {
  matcher: "startup|resume",
  hooks: [AIDD_HOOK_ENTRY],
};

type HookEntry = { type: string; command: string; [key: string]: unknown };
type SessionStartEntry = { matcher?: string; hooks: HookEntry[]; [key: string]: unknown };
type HooksRoot = { SessionStart?: SessionStartEntry[]; [key: string]: unknown };

function isAiddHookPresent(entries: SessionStartEntry[]): boolean {
  return entries.some((entry) => entry.hooks.some((hook) => hook.command === AIDD_HOOK_COMMAND));
}

function appendAiddEntry(entries: SessionStartEntry[]): SessionStartEntry[] {
  if (isAiddHookPresent(entries)) return entries;
  return [...entries, AIDD_SESSION_START_ENTRY];
}

function mergeSessionStart(existing: HooksRoot): HooksRoot {
  const current = existing.SessionStart;
  if (!Array.isArray(current)) {
    return { ...existing, SessionStart: [AIDD_SESSION_START_ENTRY] };
  }
  return { ...existing, SessionStart: appendAiddEntry(current) };
}

export function mergeCodexHooksJson(existing: string): string {
  let parsed: HooksRoot = {};
  if (existing.trim()) {
    try {
      parsed = JSON.parse(existing) as HooksRoot;
    } catch {
      parsed = {};
    }
  }
  const merged = mergeSessionStart(parsed);
  return JSON.stringify(merged, null, 2);
}

function skillNameFromPath(fileName: string): string {
  const parts = fileName.split("/");
  if (parts.length > 1) return parts[0];
  const base = parts[0];
  if (base.endsWith(TOOL_SUFFIX)) return base.slice(0, -TOOL_SUFFIX.length);
  if (base.endsWith(".md")) return base.slice(0, -3);
  return base;
}

function buildCodexSkillFilePath(fileName: string): string {
  return `${AGENTS_SKILLS_PREFIX}aidd-${skillNameFromPath(fileName)}/SKILL.md`;
}

export const codex: AiTool<
  HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasHooks & HasPlugins
> = {
  kind: "ai",
  toolId: "codex",
  distributionProbes: {
    manifest: [".codex-plugin/plugin.json"],
    marketplace: [".agents/plugins/marketplace.json"],
  },
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  displayName: "Codex",
  telemetryLocalRead: {
    kind: "declared",
    transcript: CODEX_ROLLOUT_LOCATION,
    // Complete counters per turn, no currency anywhere in a rollout, and no field naming a
    // running skill - so a step here can only ever come from a run journal interval.
    supplies: { tokenCounters: true, amount: false, toolStatedStep: false, agentName: false },
  },
  telemetryTaskAttributable: true,
  telemetryJournalHost: "codex",
  signalDir: `${DIRECTORY}commands`,
  configOutputPaths: { "config.toml": ".codex/config.toml" },
  buildContracts: { marketplace: buildCodexContract, flat: buildCodexFlatContract },

  capabilities: {
    agents: new AgentsCapability({ directory: DIRECTORY, toolSuffix: TOOL_SUFFIX, format: "toml" }),
    skills: new SkillsCapability({
      prefix: "aidd-",
      buildInstallPath: buildCodexSkillFilePath,
      convertFrontmatter: stripCodexSkillFrontmatter,
    }),
    commands: new CommandsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => buildAiddCommandFilePath(DIRECTORY, fileName),
      convertFrontmatter: (fm, relativeFileName) => convertCommandFrontmatter(fm, relativeFileName),
    }),
    rules: new RulesCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => `${DIRECTORY}rules/${stripToolSuffix(TOOL_SUFFIX, fileName)}`,
      convertFrontmatter: (fm) => fm,
    }),
    mcp: new McpCapability({
      outputPath: ".codex/config.toml",
      format: "toml",
      entrySection: "mcp_servers",
      mergeFn: mergeCodexConfigToml,
      consumes: [CONFIG_MCP],
    }),
    hooks: new HooksCapability({
      outputPath: ".codex/hooks.json",
      mergeStrategy: "user-prime",
      entrySection: "SessionStart",
      mergeFn: mergeCodexHooksJson,
      consumes: [CONFIG_CODEX_HOOKS],
    }),
    plugins: new PluginsCapability({
      mode: "native",
      pluginsDir: ".codex/plugins/",
      pluginManifestRelativePath: "plugin.json",
      acceptsMcp: true,
      translationMode: "marketplace",
      // Codex only enables plugins from its user-global config (~/.codex/config.toml)
      // plus its plugin cache (~/.codex/plugins/cache/). A project-local settings file
      // is inert, so we drive the `codex` CLI directly during marketplace sync instead.
      acceptsHooks: true,
      hooksTrustNotice: CODEX_HOOKS_TRUST_NOTICE,
      pluginRootToken: PLUGIN_ROOT_TOKEN,
      nativeActivation: {
        binary: "codex",
        upgradeVerb: "upgrade",
        enableVerb: "add",
        disableVerb: "remove",
      },
    }),
  },

  rewriteContent(content: string): string {
    return rewriteCodexContent(content);
  },
};

registerTool(codex);
