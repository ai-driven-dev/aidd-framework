import { AgentsCapability } from "../../capabilities/agents-capability.js";
import { CommandsCapability } from "../../capabilities/commands-capability.js";
import { HooksCapability } from "../../capabilities/hooks-capability.js";
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
import { parseToml, stringifyToml } from "../../formats/toml.js";
import { CONFIG_MCP } from "../../models/framework.js";
import type {
  AiTool,
  HasAgents,
  HasCommands,
  HasHooks,
  HasMcp,
  HasPlugins,
  HasRules,
  HasSkills,
  UserFileSectionKey,
} from "../contracts.js";
import { registerTool } from "../registry.js";

const DIRECTORY = ".codex/";
const TOOL_SUFFIX = ".codex.md";
const AGENTS_SKILLS_PREFIX = ".agents/skills/";

const SKILLS_TO_AGENTS_RE = /\.codex\/skills\//g;
const AGENTS_SKILLS_PLAIN_RE = /\.agents\/skills\/aidd-/g;

function remapSkillPaths(content: string): string {
  return content.replace(SKILLS_TO_AGENTS_RE, ".agents/skills/aidd-");
}

function reverseSkillPaths(content: string): string {
  return content.replace(AGENTS_SKILLS_PLAIN_RE, ".codex/skills/");
}

export function rewriteCodexContent(
  content: string,
  context: { directory: string; docsDir: string }
): string {
  const step1 = baseRewriteContent(content, context.directory, context.docsDir);
  const step2 = remapSkillPaths(step1);
  return step2.replace(
    /(@?)\.codex\/commands\/(\d+)[_-][^/]+\/([^\s]+)/g,
    "$1.codex/commands/aidd/$2/$3"
  );
}

export function reverseRewriteCodexContent(content: string, docsDir: string): string {
  const step1 = reverseSkillPaths(content);
  return baseReverseRewriteContent(step1, DIRECTORY, docsDir);
}

const MIN_PROJECT_DOC_MAX_BYTES = 262144;
const CONFIG_CODEX_HOOKS = "codex-hooks";

type TomlRecord = Record<string, unknown>;

function parseSafe(content: string): TomlRecord {
  if (!content.trim()) return {};
  try {
    return parseToml(content);
  } catch {
    return {};
  }
}

function mergeMcpServers(existing: TomlRecord, incoming: TomlRecord): void {
  const incomingServers = incoming.mcp_servers as TomlRecord | undefined;
  if (!incomingServers) return;
  const existingServers = (existing.mcp_servers ?? {}) as TomlRecord;
  for (const [name, value] of Object.entries(incomingServers)) {
    if (!(name in existingServers)) {
      existingServers[name] = value;
    }
  }
  existing.mcp_servers = existingServers;
}

function ensureProjectDocMaxBytes(existing: TomlRecord, incoming: TomlRecord): void {
  const existingVal =
    typeof existing.project_doc_max_bytes === "number" ? existing.project_doc_max_bytes : 0;
  const incomingVal =
    typeof incoming.project_doc_max_bytes === "number"
      ? incoming.project_doc_max_bytes
      : MIN_PROJECT_DOC_MAX_BYTES;
  if (existingVal >= MIN_PROJECT_DOC_MAX_BYTES) return;
  existing.project_doc_max_bytes = Math.max(existingVal, incomingVal, MIN_PROJECT_DOC_MAX_BYTES);
}

function ensureCodexHooks(existing: TomlRecord): void {
  const features = existing.features as TomlRecord | undefined;
  if (features?.hooks !== undefined || features?.codex_hooks !== undefined) return;
  existing.features = { ...(features ?? {}), hooks: true };
}

export function mergeCodexConfigToml(existing: string, aiddPayload: string): string {
  const result = parseSafe(existing);
  const payload = parseSafe(aiddPayload);
  mergeMcpServers(result, payload);
  ensureProjectDocMaxBytes(result, payload);
  ensureCodexHooks(result);
  return stringifyToml(result);
}

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

export function stripCodexSkillFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (fm.name !== undefined) result.name = fm.name;
  if (fm.description !== undefined) result.description = fm.description;
  if (fm.allowed_tools !== undefined) result.allowed_tools = fm.allowed_tools;
  return result;
}

export const codex: AiTool<
  HasAgents & HasSkills & HasCommands & HasRules & HasMcp & HasHooks & HasPlugins
> = {
  kind: "ai",
  toolId: "codex",
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  signalDir: `${DIRECTORY}commands`,
  configOutputPaths: { "config.toml": ".codex/config.toml" },

  capabilities: {
    agents: new AgentsCapability({ directory: DIRECTORY, toolSuffix: TOOL_SUFFIX, format: "toml" }),
    skills: new SkillsCapability({
      prefix: "aidd-",
      buildInstallPath: buildCodexSkillFilePath,
      convertFrontmatter: stripCodexSkillFrontmatter,
      reverseConvertFrontmatter: (fm) => fm,
    }),
    commands: new CommandsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => buildAiddCommandFilePath(DIRECTORY, fileName),
      convertFrontmatter: (fm, relativeFileName) => convertCommandFrontmatter(fm, relativeFileName),
      reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatter(fm),
    }),
    rules: new RulesCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => `${DIRECTORY}rules/${stripToolSuffix(TOOL_SUFFIX, fileName)}`,
      convertFrontmatter: (fm) => fm,
      reverseConvertFrontmatter: (fm) => fm,
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
      nativeActivation: { binary: "codex", upgradeVerb: "upgrade", enableVerb: "add" },
    }),
  },

  rewriteContent(content: string, docsDir: string): string {
    return rewriteCodexContent(content, { directory: DIRECTORY, docsDir });
  },

  reverseRewriteContent(content: string, docsDir: string): string {
    return reverseRewriteCodexContent(content, docsDir);
  },

  detectUserFileSectionKey(relativePath: string): UserFileSectionKey | null {
    return detectSectionKeyFromPrefixes(relativePath, [
      [`${AGENTS_SKILLS_PREFIX}aidd-`, "skills"],
      [`${DIRECTORY}agents/`, "agents"],
      [`${DIRECTORY}commands/aidd/`, "commands"],
      [`${DIRECTORY}rules/`, "rules"],
    ]);
  },
};

registerTool(codex);
