import { stringify } from "smol-toml";

interface StdioServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface HttpServer {
  url: string;
  bearerTokenEnvVar?: string;
  http_headers?: Record<string, string>;
  env_http_headers?: Record<string, string>;
}

const UNIVERSAL_FIELDS = [
  "startup_timeout_sec",
  "tool_timeout_sec",
  "enabled",
  "required",
  "enabled_tools",
  "disabled_tools",
] as const;

function buildStdioTomlEntry(raw: StdioServer & Record<string, unknown>): Record<string, unknown> {
  const entry: Record<string, unknown> = { command: raw.command };
  if (raw.args !== undefined) entry.args = raw.args;
  if (raw.env !== undefined) entry.env = raw.env;
  if (raw.cwd !== undefined) entry.cwd = raw.cwd;
  for (const field of UNIVERSAL_FIELDS) {
    if (raw[field] !== undefined) entry[field] = raw[field];
  }
  return entry;
}

function buildHttpTomlEntry(raw: HttpServer & Record<string, unknown>): Record<string, unknown> {
  const entry: Record<string, unknown> = { url: raw.url };
  if (raw.bearerTokenEnvVar !== undefined) entry.bearer_token_env_var = raw.bearerTokenEnvVar;
  if (raw.http_headers !== undefined) entry.http_headers = raw.http_headers;
  if (raw.env_http_headers !== undefined) entry.env_http_headers = raw.env_http_headers;
  for (const field of UNIVERSAL_FIELDS) {
    if (raw[field] !== undefined) entry[field] = raw[field];
  }
  return entry;
}

function mapServerToToml(raw: Record<string, unknown>): Record<string, unknown> {
  if ("command" in raw) return buildStdioTomlEntry(raw as StdioServer & Record<string, unknown>);
  if ("url" in raw) return buildHttpTomlEntry(raw as HttpServer & Record<string, unknown>);
  return {};
}

export function mcpJsonToToml(json: string): string {
  const parsed = JSON.parse(json) as { mcpServers?: Record<string, Record<string, unknown>> };
  const servers = parsed.mcpServers ?? {};
  if (Object.keys(servers).length === 0) return "";
  const mcp_servers: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(servers)) {
    mcp_servers[name] = mapServerToToml(raw);
  }
  return stringify({ mcp_servers });
}

export function mergeJsonUserPrime(existing: string, incoming: string): string {
  const existingObj = existing.trim() ? (JSON.parse(existing) as Record<string, unknown>) : {};
  const incomingObj = JSON.parse(incoming) as Record<string, unknown>;
  return JSON.stringify(deepMerge(incomingObj, existingObj), null, 2);
}

export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = deepMerge(
        existing as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
