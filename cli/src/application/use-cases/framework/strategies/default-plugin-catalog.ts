import type { PluginPresenceFlags } from "./plugin-source-tree-reader.js";

export interface SynthesizeDefaultPluginManifestOpts {
  /** When true, include `agents` as a list of `./agents/*.md` file paths if agents are present. */
  readonly agentsField: boolean;
}

export function synthesizeDefaultPluginManifest(
  source: Record<string, unknown>,
  presence: PluginPresenceFlags,
  opts: SynthesizeDefaultPluginManifestOpts
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

export function buildDefaultMarketplace(
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

export function buildDefaultCatalogEntry(
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
