/**
 * Opencode's ToolBuildContract: flat (direct workspace materialization) only —
 * opencode has no marketplace/native plugin mode.
 *
 * `transformMcpToOpencode` lives here rather than in `profile.ts` because the flat
 * contract's config-artifact step needs it as much as the installed-content mcp
 * capability does; the profile imports it back from here.
 */

import { InvalidMcpServerConfigError, McpConfigError } from "../../../../../kernel/errors.js";
import { parseFrontmatter, serializeFrontmatter } from "../../../../../kernel/markdown.js";
import {
  flatMcpKeyPrefix,
  genericFlatAgentPath,
  genericFlatSkillPath,
} from "../../../../../kernel/materialization/flat-paths.js";
import { rewriteRelativeLinks } from "../../../../../kernel/materialization/relative-link-rewrite.js";
import type { FileReader } from "../../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../../kernel/ports/file-writer.js";
import type { ToolBuildContract } from "../../build-contract.js";
import { buildOpencodeFlatConfig } from "../../formats/opencode-mcp-merge.js";

type FsType = FileReader & FileWriter;

// ── MCP transform (shared by the opencode profile's mcp capability and the flat contract) ──

type RawServer =
  | { command: string; args?: string[]; env?: Record<string, string>; disabled?: boolean }
  | { url: string; disabled?: boolean };

interface OpencodeMcpLocalServer {
  type: "local";
  command: string[];
  enabled: boolean;
  environment?: Record<string, string>;
}

interface OpencodeMcpRemoteServer {
  type: "remote";
  url: string;
  enabled: boolean;
}

type OpencodeMcpServer = OpencodeMcpLocalServer | OpencodeMcpRemoteServer;

function convertRawServer(name: string, server: RawServer): OpencodeMcpServer {
  const enabled = server.disabled !== true;
  if ("command" in server) {
    const { command, args = [], env } = server;
    const local: OpencodeMcpLocalServer = { type: "local", command: [command, ...args], enabled };
    if (env && Object.keys(env).length > 0) local.environment = env;
    return local;
  }
  if ("url" in server) {
    return { type: "remote", url: server.url, enabled };
  }
  throw new InvalidMcpServerConfigError(name);
}

export function transformMcpToOpencode(content: string): string {
  let parsed: { mcpServers?: Record<string, RawServer> };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch (err) {
    throw new McpConfigError(
      `Cannot parse MCP config: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new McpConfigError("MCP config must be a JSON object");
  }
  const mcp: Record<string, OpencodeMcpServer> = {};
  for (const [name, server] of Object.entries(parsed.mcpServers ?? {})) {
    mcp[name] = convertRawServer(name, server);
  }
  return JSON.stringify({ mcp }, null, 2);
}

// ── Opencode flat contract ─────────────────────────────────────────────────────

function opencodeFlatAgentPath(plugin: string, rel: string): string {
  return genericFlatAgentPath(".opencode/agents/", plugin, rel.replace(/^agents\//, ""), ".md");
}

function opencodeFlatSkillPath(plugin: string, rel: string): string {
  return genericFlatSkillPath(".opencode/skills/", plugin, rel.replace(/^skills\//, ""));
}

function opencodeFlatResolveTarget(plugin: string, rel: string): string {
  if (rel.startsWith("agents/")) return opencodeFlatAgentPath(plugin, rel);
  if (rel.startsWith("skills/")) return opencodeFlatSkillPath(plugin, rel);
  return rel;
}

function transformOpencodeFlatAgent(content: string, plugin: string, outName: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const flatRelPath = opencodeFlatAgentPath(plugin, `agents/${outName}`);
  const rewrittenBody = rewriteRelativeLinks(body, {
    currentFilePluginRelative: flatRelPath,
    resolveTargetPath: (rel) => opencodeFlatResolveTarget(plugin, rel),
  });
  const prefixedName = `${plugin}-${outName.replace(/\.md$/, "")}`;
  // mode: subagent ensures opencode treats copied agents as subagents, not primary agents.
  return serializeFrontmatter(
    { ...frontmatter, name: prefixedName, mode: "subagent" },
    rewrittenBody
  );
}

async function resolveOpencodeJsonPath(outDir: string, fs: FsType): Promise<string> {
  const jsoncExists = await fs.fileExists(`${outDir}/opencode.jsonc`);
  if (jsoncExists) return `${outDir}/opencode.jsonc`;
  return `${outDir}/opencode.json`;
}

async function collectOpencodeMcp(
  builtPlugins: readonly string[],
  sourceDir: string,
  fs: FsType
): Promise<Record<string, unknown>> {
  const incoming: Record<string, unknown> = {};
  for (const plugin of builtPlugins) {
    const mcpSrc = `${sourceDir}/plugins/${plugin}/.mcp.json`;
    if (!(await fs.fileExists(mcpSrc))) continue;
    const raw = await fs.readFile(mcpSrc);
    const transformed = JSON.parse(transformMcpToOpencode(raw)) as {
      mcp?: Record<string, unknown>;
    };
    const prefix = flatMcpKeyPrefix(plugin);
    for (const [k, v] of Object.entries(transformed.mcp ?? {})) {
      incoming[`${prefix}${k}`] = v;
    }
  }
  return incoming;
}

export function buildOpencodeFlatContract(): ToolBuildContract {
  return {
    manifestFileRelative: null,
    synthesizeManifest: null,
    manifestSchemaName: null,
    artifacts: {
      skills: {
        supported: true,
        source: { kind: "fullTree", srcDir: "skills" },
        path: opencodeFlatSkillPath,
        rewriteSkillName: true,
      },
      agents: {
        supported: true,
        source: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
        path: opencodeFlatAgentPath,
        transform: transformOpencodeFlatAgent,
      },
      mcp: { supported: false }, // handled by emitConfigArtifact (opencode.json mcp)
      hooks: { supported: false }, // opencode has no HasHooks capability
      rules: { supported: false },
      commands: { supported: false },
    },
    buildMarketplaceCatalog: null,
    buildMarketplaceEntry: null,
    emitConfigArtifact: async (builtPlugins, outDir, sourceDir, fs, _validator, assetProvider) => {
      const configPath = await resolveOpencodeJsonPath(outDir, fs);
      const existing = (await fs.fileExists(configPath)) ? await fs.readFile(configPath) : null;
      const incoming = await collectOpencodeMcp(builtPlugins, sourceDir, fs);
      const baseAsset = assetProvider.loadConfigAsset("opencode", "opencode.json");
      const base = typeof baseAsset === "string" ? baseAsset : JSON.stringify(baseAsset);
      await fs.writeFile(configPath, buildOpencodeFlatConfig(base, existing, incoming));
      return 1;
    },
  };
}
