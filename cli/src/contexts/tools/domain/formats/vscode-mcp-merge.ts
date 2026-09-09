/**
 * Merges pre-prefixed MCP server entries into an existing workspace MCP config, purely
 * additively.
 *
 * No manifest and no strip step, unlike the OpenCode merge: flat mode is fire-and-forget, so
 * there is no inverse. A colliding key is recorded and skipped unless `force` overwrites it,
 * and a user-owned server is always preserved. `serversKey` names the property holding the
 * map — `servers` for VS Code, `mcpServers` for Claude and Cursor.
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
