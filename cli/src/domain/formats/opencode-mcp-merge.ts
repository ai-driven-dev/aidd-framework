import type { Hasher } from "../ports/hasher.js";
import { stripJsonComments } from "./jsonc.js";

/**
 * Where a flat tool keeps its MCP servers. Both the JSON key and the file name vary by
 * tool (opencode uses `mcp` in opencode.json, gemini `mcpServers` in .gemini/settings.json),
 * so neither may be assumed by the merge.
 */
export interface FlatMcpSection {
  readonly key: string;
  readonly configName: string;
}

const OPENCODE_MCP_KEY = "mcp";

function collisionReason(configName: string): string {
  return `server already exists in ${configName} (user-owned); plugin entry skipped`;
}

/**
 * Merges incoming OpenCode-format MCP servers (already transformed via transformMcpToOpencode)
 * into the existing opencode.json content.
 *
 * - Strips keys previously contributed by this plugin (previousEntriesForThisPlugin) before merging.
 * - Preserves user-owned servers (keys not in previousEntriesForThisPlugin and not in incoming).
 * - Incoming servers replace previous entries owned by this plugin (idempotent re-install).
 * - Incoming servers that collide with user-owned keys are skipped and returned as collisions.
 *
 * Both `existingContent` and `incomingTransformed` must be valid JSON strings produced by
 * `JSON.stringify(_, null, 2)` (the same serialization as transformMcpToOpencode).
 */
export function mergeFlatMcpSection(
  existingContent: string | null,
  incomingTransformed: string,
  previousEntriesForThisPlugin: ReadonlyMap<string, string>,
  hasher: Hasher,
  section: FlatMcpSection
): {
  mergedContent: string;
  contributedEntries: ReadonlyMap<string, string>;
  collisions: ReadonlyArray<string>;
} {
  const { full, servers } = parseExisting(existingContent, section.key);
  const incoming = parseIncoming(incomingTransformed, section.key);
  const cleaned = stripPreviousEntries(servers, previousEntriesForThisPlugin);
  return applyIncoming(full, cleaned, incoming, previousEntriesForThisPlugin, hasher, section);
}

/**
 * Builds the opencode.json emitted by the flat framework build.
 *
 * Written unconditionally (even with zero MCP servers), so the archive always
 * ships a config — matching every sibling flat target (codex config.toml,
 * claude settings.json).
 *
 * The framework-owned keys ($schema, instructions) come from `baseConfig`: the
 * same bundled `assets/configs/opencode/opencode.json` the install path writes,
 * so both paths emit an identical shape from a single source of truth.
 *
 * - `baseConfig` keys are framework-owned and win over stale existing copies.
 * - Any other top-level keys in an existing config are preserved (user-owned).
 * - Incoming prefixed MCP servers merge into `mcp` (incoming wins); the `mcp`
 *   key is omitted entirely when neither existing nor incoming contribute one.
 * - Malformed `existing` content throws — no silent discard.
 *
 * @param baseConfig - Canonical base config (bundled opencode.json asset), as JSON
 * @param existing   - Raw content of the existing opencode.json (or null if absent)
 * @param incoming   - Already-prefixed MCP server entries to merge in
 */
export function buildOpencodeFlatConfig(
  baseConfig: string,
  existing: string | null,
  incoming: Record<string, unknown>
): string {
  const base = JSON.parse(baseConfig) as Record<string, unknown>;
  const { full, servers: mcp } = parseExisting(existing, OPENCODE_MCP_KEY);
  const userKeys = { ...full };
  for (const key of Object.keys(base)) delete userKeys[key];
  delete userKeys.mcp;
  const mergedMcp = { ...mcp, ...incoming };
  const result: Record<string, unknown> = { ...base, ...userKeys };
  delete result.mcp;
  if (Object.keys(mergedMcp).length > 0) result.mcp = mergedMcp;
  return JSON.stringify(result, null, 2);
}

/**
 * Removes servers previously contributed by a plugin from the opencode.json mcp section.
 * Keys not present in `entries` are preserved untouched.
 */
export function unmergeFlatMcpSection(
  existingContent: string,
  entries: ReadonlyMap<string, string>,
  section: FlatMcpSection
): string {
  const parsed = JSON.parse(stripJsonComments(existingContent)) as Record<string, unknown>;
  const servers = { ...((parsed[section.key] as Record<string, unknown>) ?? {}) };
  for (const name of entries.keys()) {
    delete servers[name];
  }
  return JSON.stringify({ ...parsed, [section.key]: servers }, null, 2);
}

// ── Private helpers ──────────────────────────────────────────────────────────

function parseExisting(
  content: string | null,
  sectionKey: string
): {
  full: Record<string, unknown>;
  servers: Record<string, unknown>;
} {
  if (content === null) return { full: {}, servers: {} };
  // The target config is user-owned and may be JSONC (comments / trailing commas).
  const parsed = JSON.parse(stripJsonComments(content)) as Record<string, unknown>;
  return {
    full: parsed,
    servers: (parsed[sectionKey] as Record<string, unknown>) ?? {},
  };
}

function parseIncoming(transformed: string, sectionKey: string): Record<string, unknown> {
  const parsed = JSON.parse(transformed) as Record<string, unknown>;
  return (parsed[sectionKey] as Record<string, unknown>) ?? {};
}

function stripPreviousEntries(
  existing: Record<string, unknown>,
  previous: ReadonlyMap<string, string>
): Record<string, unknown> {
  const result = { ...existing };
  for (const name of previous.keys()) {
    delete result[name];
  }
  return result;
}

function applyIncoming(
  full: Record<string, unknown>,
  cleanedMcp: Record<string, unknown>,
  incoming: Record<string, unknown>,
  previous: ReadonlyMap<string, string>,
  hasher: Hasher,
  section: FlatMcpSection
): {
  mergedContent: string;
  contributedEntries: ReadonlyMap<string, string>;
  collisions: ReadonlyArray<string>;
} {
  const mcp = { ...cleanedMcp };
  const contributed = new Map<string, string>();
  const collisions: string[] = [];
  for (const [name, server] of Object.entries(incoming)) {
    if (name in cleanedMcp && !previous.has(name)) {
      collisions.push(`${name}: ${collisionReason(section.configName)}`);
      continue;
    }
    mcp[name] = server;
    contributed.set(name, hasher.hash(JSON.stringify(server)).value);
  }
  const mergedContent = JSON.stringify({ ...full, [section.key]: mcp }, null, 2);
  return { mergedContent, contributedEntries: contributed, collisions };
}
