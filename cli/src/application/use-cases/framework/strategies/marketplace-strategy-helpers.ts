import { join, relative } from "node:path";
import { InvalidSourceMarketplaceError } from "../../../../domain/errors.js";
import { rewriteRelativeLinks } from "../../../../domain/formats/relative-link-rewrite.js";
import {
  PLUGIN_AGENT_INPUT_EXT,
  PLUGIN_HOOKS_RELATIVE,
  PLUGIN_MCP_RELATIVE,
} from "../../../../domain/models/framework-build.js";
import type { FileReader } from "../../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../../domain/ports/file-writer.js";
import { assertNoToolsPlaceholder } from "../shared-plugin-helpers.js";

export interface PluginPresenceFlags {
  readonly hasAgents: boolean;
  /** Agent markdown files relative to the plugin's `agents/` dir (e.g. "planner.md"), sorted. */
  readonly agentsList: readonly string[];
  readonly skillsList: readonly string[];
  readonly hasHooksJson: boolean;
  readonly hasMcpJson: boolean;
}

export async function listAgentFiles(
  fs: FileReader,
  agentsDir: string
): Promise<readonly string[]> {
  if (!(await fs.fileExists(agentsDir))) return [];
  const files = await fs.listFilesRecursive(agentsDir);
  return files
    .filter((f) => f.endsWith(PLUGIN_AGENT_INPUT_EXT))
    .map((f) => relative(agentsDir, f).replace(/\\/g, "/"))
    .sort();
}

export async function listSkillNames(
  fs: FileReader,
  pluginSrc: string
): Promise<readonly string[]> {
  const skillsDir = join(pluginSrc, "skills");
  if (!(await fs.fileExists(skillsDir))) return [];
  const files = await fs.listFilesRecursive(skillsDir);
  const names = new Set<string>();
  for (const f of files) {
    if (!f.endsWith("/SKILL.md") && !f.endsWith("\\SKILL.md") && !f.endsWith("SKILL.md")) {
      continue;
    }
    const rel = relative(skillsDir, f);
    const parts = rel.replace(/\\/g, "/").split("/");
    if (parts.length >= 2) names.add(parts[0]);
  }
  return [...names].sort();
}

export async function detectPluginPresenceFlags(
  fs: FileReader,
  pluginSrc: string
): Promise<PluginPresenceFlags> {
  const agentsDir = join(pluginSrc, "agents");
  const agentsList = await listAgentFiles(fs, agentsDir);
  const skillsList = await listSkillNames(fs, pluginSrc);
  const hasHooksJson = await fs.fileExists(join(pluginSrc, PLUGIN_HOOKS_RELATIVE));
  const hasMcpJson = await fs.fileExists(join(pluginSrc, PLUGIN_MCP_RELATIVE));
  return { hasAgents: agentsList.length > 0, agentsList, skillsList, hasHooksJson, hasMcpJson };
}

export async function writeSkillTree(
  fs: FileReader & FileWriter,
  pluginName: string,
  pluginSrc: string,
  pluginOut: string
): Promise<number> {
  const skillsSrc = join(pluginSrc, "skills");
  if (!(await fs.fileExists(skillsSrc))) return 0;
  const files = await fs.listFilesRecursive(skillsSrc);
  let count = 0;
  for (const absPath of files) {
    count += await writeSkillFile(fs, pluginName, absPath, skillsSrc, pluginOut);
  }
  return count;
}

async function writeSkillFile(
  fs: FileReader & FileWriter,
  pluginName: string,
  absPath: string,
  skillsSrc: string,
  pluginOut: string
): Promise<number> {
  const relPath = relative(skillsSrc, absPath).replace(/\\/g, "/");
  const destPath = join(pluginOut, "skills", relPath);
  const content = await fs.readFile(absPath);
  if (absPath.endsWith(".md")) {
    assertNoToolsPlaceholder(content, pluginName, relPath);
    const currentFilePluginRelative = `skills/${relPath}`;
    await fs.writeFile(destPath, rewriteRelativeLinks(content, { currentFilePluginRelative }));
  } else {
    await fs.writeFile(destPath, content);
  }
  return 1;
}

export async function resolveVersion(
  fs: FileReader,
  name: string,
  srcEntry: { version?: string } | undefined,
  outDir: string,
  outputManifestRelative: string
): Promise<string> {
  if (srcEntry?.version) return srcEntry.version;
  const manifestPath = join(outDir, "plugins", name, outputManifestRelative);
  const raw = await fs.readFile(manifestPath);
  const manifest = JSON.parse(raw) as Record<string, unknown>;
  if (typeof manifest.version === "string") return manifest.version;
  throw new InvalidSourceMarketplaceError(
    `plugin '${name}' has no version in marketplace entry or plugin.json`
  );
}

export interface SynthesizeClaudeStyleManifestOpts {
  /** Output manifest subdirectory name (e.g. ".claude-plugin" or ".cursor-plugin"). Reserved for caller/future divergence. */
  readonly manifestDir: string;
  /** When true, include `agents` as a list of `./agents/*.md` file paths if agents are present. */
  readonly agentsField: boolean;
}

/**
 * Synthesize a Claude-style plugin manifest shared by claude + cursor + copilot strategies.
 * Key insertion order: name, description, version, author, homepage, repository, license,
 * keywords, agents (conditional), skills (conditional), hooks (conditional), mcpServers (conditional).
 */
export function synthesizeClaudeStyleManifest(
  source: Record<string, unknown>,
  presence: PluginPresenceFlags,
  opts: SynthesizeClaudeStyleManifestOpts
): Record<string, unknown> {
  const manifest: Record<string, unknown> = {};
  if (typeof source.name === "string") manifest.name = source.name;
  if (typeof source.description === "string") manifest.description = source.description;
  if (typeof source.version === "string") manifest.version = source.version;
  if (typeof source.author === "string" || typeof source.author === "object")
    manifest.author = source.author;
  if (typeof source.homepage === "string") manifest.homepage = source.homepage;
  if (typeof source.repository === "string") manifest.repository = source.repository;
  if (typeof source.license === "string") manifest.license = source.license;
  if (Array.isArray(source.keywords)) manifest.keywords = source.keywords;
  if (opts.agentsField && presence.agentsList.length > 0)
    manifest.agents = presence.agentsList.map((n) => `./agents/${n}`);
  if (presence.skillsList.length > 0)
    manifest.skills = presence.skillsList.map((n) => `./skills/${n}`);
  if (presence.hasHooksJson) manifest.hooks = "./hooks/hooks.json";
  if (presence.hasMcpJson) manifest.mcpServers = "./.mcp.json";
  return manifest;
}

/**
 * Build a Claude-style marketplace catalog object shared by claude + cursor + codex strategies.
 */
export function buildClaudeStyleMarketplace(
  source: { name: string; version?: string; description?: string; owner?: unknown },
  pluginEntries: readonly Record<string, unknown>[]
): Record<string, unknown> {
  const obj: Record<string, unknown> = { name: source.name };
  if (typeof source.version === "string") obj.version = source.version;
  if (typeof source.description === "string") obj.description = source.description;
  if (source.owner !== undefined) obj.owner = source.owner;
  obj.plugins = pluginEntries;
  return obj;
}

export function buildClaudeStyleCatalogEntry(
  name: string,
  description: string,
  version: string,
  srcEntry: Record<string, unknown> | undefined
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name,
    source: `./plugins/${name}`,
    description,
    version,
  };
  if (typeof srcEntry?.strict === "boolean") entry.strict = srcEntry.strict;
  if (typeof srcEntry?.recommended === "boolean") entry.recommended = srcEntry.recommended;
  return entry;
}

// ── Codex-native marketplace catalog (for `codex plugin marketplace add`) ──────
// Shape verified 2026-07-05 against https://github.com/openai/plugins
// .agents/plugins/marketplace.json and https://developers.openai.com/codex/plugins/build.

/** Default category when the source marketplace entry does not specify one. */
export const CODEX_DEFAULT_CATEGORY = "Developer Tools";
/**
 * Default per-plugin auth policy. AIDD plugins bundle skills/agents/hooks with no
 * external OAuth, so auth is deferred to first use rather than forced at install.
 */
export const CODEX_DEFAULT_AUTHENTICATION = "ON_USE";
const CODEX_INSTALLATION_AVAILABLE = "AVAILABLE";

/**
 * Build a Codex marketplace catalog: `{ name, interface: { displayName }, plugins }`.
 * `displayName` falls back to the marketplace name when the source omits it.
 */
export function buildCodexMarketplace(
  source: { name: string; displayName?: string },
  pluginEntries: readonly Record<string, unknown>[]
): Record<string, unknown> {
  const displayName = typeof source.displayName === "string" ? source.displayName : source.name;
  return { name: source.name, interface: { displayName }, plugins: pluginEntries };
}

/**
 * Build a single Codex marketplace entry. `installation`/`authentication`/`category`
 * are required per the plugin-creator spec; `authentication` and `category` accept a
 * source-entry override, else fall back to the AIDD-shaped defaults.
 */
export function buildCodexMarketplaceEntry(
  name: string,
  srcEntry: Record<string, unknown> | undefined
): Record<string, unknown> {
  const authentication =
    typeof srcEntry?.authentication === "string"
      ? srcEntry.authentication
      : CODEX_DEFAULT_AUTHENTICATION;
  const category =
    typeof srcEntry?.category === "string" ? srcEntry.category : CODEX_DEFAULT_CATEGORY;
  return {
    name,
    source: { source: "local", path: `./plugins/${name}` },
    policy: { installation: CODEX_INSTALLATION_AVAILABLE, authentication },
    category,
  };
}

export async function resolveDescription(
  fs: FileReader,
  name: string,
  srcEntry: { description?: string } | undefined,
  outDir: string,
  outputManifestRelative: string
): Promise<string> {
  if (srcEntry?.description) return srcEntry.description;
  const manifestPath = join(outDir, "plugins", name, outputManifestRelative);
  const raw = await fs.readFile(manifestPath);
  const manifest = JSON.parse(raw) as Record<string, unknown>;
  if (typeof manifest.description === "string" && manifest.description.length > 0) {
    return manifest.description;
  }
  throw new InvalidSourceMarketplaceError(
    `plugin '${name}' has no description in marketplace entry or plugin.json`
  );
}
