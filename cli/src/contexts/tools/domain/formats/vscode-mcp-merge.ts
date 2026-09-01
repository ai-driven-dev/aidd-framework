/**
 * Purely additive merge helper for workspace MCP config files.
 *
 * Distinct from opencode-mcp-merge (which is manifest-driven and strips previous
 * plugin-owned entries before merging). This helper has NO manifest and NO strip
 * step — flat mode is fire-and-forget (spec §Out of scope).
 *
 * Contract:
 *  - Read existing servers object from the target file (or start empty).
 *  - For each incoming key: if already present and force === false, record a collision
 *    and skip; if force === true, overwrite.
 *  - Keys in `incoming` are pre-prefixed by the caller (flatMcpKeyPrefix from
 *    flat-paths.ts). This helper is agnostic to plugin identity.
 *  - User-owned servers (any key not in incoming) are always preserved.
 *  - Returns merged JSON (2-space indent, trailing newline) and collisions list.
 *
 * The `serversKey` parameter controls which JSON property holds the servers map:
 *  - "servers" for .vscode/mcp.json (Copilot/VS Code format)
 *  - "mcpServers" for .mcp.json (Claude) or .cursor/mcp.json (Cursor)
 */

/**
 * Merges incoming MCP server entries (pre-prefixed with plugin name) into the
 * existing workspace MCP config content.
 *
 * @param existing    - Current file contents, or null if file does not exist.
 * @param incoming    - Pre-prefixed server entries to add (keys like "<plugin>-<server>").
 * @param force       - When true, overwrite colliding entries instead of recording them.
 * @param serversKey  - JSON property name for the servers map (default: "servers").
 * @returns mergedContent (the new file content) and collisions (keys that were skipped
 *          because they already existed and force was false).
 *
 * No inverse: mergeVscodeMcp is a fire-and-forget additive merge — flat mode has no
 * plugin manifest to track what was contributed, so there is no strip/unmerge operation.
 */
export function mergeVscodeMcp(
  existing: string | null,
  incoming: Record<string, unknown>,
  force: boolean,
  serversKey = "servers"
): { mergedContent: string; collisions: ReadonlyArray<string> } {
  const { full, servers } = parseExisting(existing, serversKey);
  const { servers: mergedServers, collisions } = applyIncoming(servers, incoming, force);
  const merged: Record<string, unknown> = { ...full, [serversKey]: mergedServers };
  return { mergedContent: `${JSON.stringify(merged, null, 2)}\n`, collisions };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function parseExisting(
  content: string | null,
  serversKey: string
): {
  full: Record<string, unknown>;
  servers: Record<string, unknown>;
} {
  if (content === null) return { full: {}, servers: {} };
  const parsed = JSON.parse(content) as Record<string, unknown>;
  return {
    full: parsed,
    servers: (parsed[serversKey] as Record<string, unknown>) ?? {},
  };
}

function applyIncoming(
  existingServers: Record<string, unknown>,
  incoming: Record<string, unknown>,
  force: boolean
): { servers: Record<string, unknown>; collisions: ReadonlyArray<string> } {
  const servers = { ...existingServers };
  const collisions: string[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    if (key in servers && !force) {
      collisions.push(key);
      continue;
    }
    servers[key] = value;
  }
  return { servers, collisions };
}
