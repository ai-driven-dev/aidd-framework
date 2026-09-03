/**
 * Marketplace catalog and manifest shaping shared by more than one tool's build
 * contract (claude, cursor, copilot, codex).
 *
 * A tool's build contract otherwise lives entirely inside that tool's own profile
 * directory. These functions are the exception: claude and cursor emit byte-identical
 * plugin manifests and catalog entries, and claude and copilot transform an agent's
 * frontmatter identically in marketplace mode. Duplicating them per tool would drift;
 * one tool importing another's directory would violate the boundary this refactor is
 * drawing. This file is the place both can reach without either.
 */
import { join } from "node:path";
import { InvalidSourceMarketplaceError } from "../../../kernel/errors.js";
import { parseFrontmatter, serializeFrontmatter } from "../../../kernel/markdown.js";
import { rewriteRelativeLinks } from "../../../kernel/materialization/relative-link-rewrite.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { PluginPresence } from "./build-contract.js";

type SrcEntry =
  | { version?: string; description?: string; strict?: boolean; recommended?: boolean }
  | undefined;

/**
 * Marketplace-mode agent transform shared by claude and copilot: both keep the
 * frontmatter untouched and only rewrite relative links to the flattened output path.
 */
export function transformClaudeAgent(content: string, _plugin: string, outName: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const rewrittenBody = rewriteRelativeLinks(body, {
    currentFilePluginRelative: `agents/${outName}`,
  });
  return serializeFrontmatter(frontmatter, rewrittenBody);
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
  presence: PluginPresence,
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
 * Build a Claude-style marketplace catalog object shared by claude + cursor strategies.
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

/**
 * Resolve version + description, then shape the catalog entry — the marketplace-entry
 * builder claude and cursor both hand to `ToolBuildContract.buildMarketplaceEntry`.
 */
export async function buildClaudeStyleEntry(
  name: string,
  outDir: string,
  srcEntry: SrcEntry,
  manifestRelative: string,
  fs: FileReader & FileWriter
): Promise<Record<string, unknown>> {
  const args = [fs, name, srcEntry, outDir, manifestRelative] as const;
  const version = await resolveVersion(...args);
  const description = await resolveDescription(...args);
  return buildClaudeStyleCatalogEntry(
    name,
    description,
    version,
    srcEntry as Record<string, unknown> | undefined
  );
}

// ── Codex-native marketplace catalog (for `codex plugin marketplace add`) ──────
// Shape verified 2026-07-05 against https://github.com/openai/plugins
// .agents/plugins/marketplace.json and https://developers.openai.com/codex/plugins/build.

/** Default category when the source marketplace entry does not specify one. */
const CODEX_DEFAULT_CATEGORY = "Developer Tools";
/**
 * Default per-plugin auth policy. AIDD plugins bundle skills/agents/hooks with no
 * external OAuth, so auth is deferred to first use rather than forced at install.
 */
const CODEX_DEFAULT_AUTHENTICATION = "ON_USE";
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
