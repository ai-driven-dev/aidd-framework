import type { Hasher } from "../../../../kernel/ports/hasher.js";
import { stripJsonComments } from "../../../../kernel/reading/jsonc.js";

interface OpencodeMcpSection {
  mcp?: Record<string, unknown>;
}

const MCP_COLLISION_REASON =
  "server already exists in opencode.json (user-owned); plugin entry skipped";

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
export function mergeOpencodeMcp(
  existingContent: string | null,
  incomingTransformed: string,
  previousEntriesForThisPlugin: ReadonlyMap<string, string>,
  hasher: Hasher
): {
  mergedContent: string;
  contributedEntries: ReadonlyMap<string, string>;
  collisions: ReadonlyArray<string>;
} {
  const { full, mcp } = parseExisting(existingContent);
  const incoming = parseIncoming(incomingTransformed);
  const cleaned = stripPreviousEntries(mcp, previousEntriesForThisPlugin);
  return applyIncoming(full, cleaned, incoming, previousEntriesForThisPlugin, hasher);
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
  const { full, mcp } = parseExisting(existing);
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
export function unmergeOpencodeMcp(
  existingContent: string,
  entries: ReadonlyMap<string, string>
): string {
  const parsed = JSON.parse(stripJsonComments(existingContent)) as OpencodeMcpSection;
  const mcp = { ...(parsed.mcp ?? {}) };
  for (const name of entries.keys()) {
    delete mcp[name];
  }
  return JSON.stringify({ ...parsed, mcp }, null, 2);
}

// ── Private helpers ──────────────────────────────────────────────────────────

function parseExisting(content: string | null): {
  full: Record<string, unknown>;
  mcp: Record<string, unknown>;
} {
  if (content === null) return { full: {}, mcp: {} };
  // opencode.json is user-owned and may be JSONC (comments / trailing commas).
  const parsed = JSON.parse(stripJsonComments(content)) as OpencodeMcpSection;
  return {
    full: parsed as Record<string, unknown>,
    mcp: (parsed.mcp as Record<string, unknown>) ?? {},
  };
}

function parseIncoming(transformed: string): Record<string, unknown> {
  const parsed = JSON.parse(transformed) as OpencodeMcpSection;
  return (parsed.mcp as Record<string, unknown>) ?? {};
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
  hasher: Hasher
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
      collisions.push(`${name}: ${MCP_COLLISION_REASON}`);
      continue;
    }
    mcp[name] = server;
    contributed.set(name, hasher.hash(JSON.stringify(server)).value);
  }
  const mergedContent = JSON.stringify({ ...full, mcp }, null, 2);
  return { mergedContent, contributedEntries: contributed, collisions };
}
