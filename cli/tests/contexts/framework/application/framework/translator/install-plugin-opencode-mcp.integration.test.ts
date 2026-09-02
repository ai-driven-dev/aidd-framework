/**
 * Phase 4b — OpenCode MCP merge integration.
 * Asserts that installing a plugin with .mcp.json against OpenCode:
 *   - merges servers into opencode.json under the mcp section
 *   - preserves disabled state (enabled: false) from source
 *   - populates Plugin.mcpEntries in the manifest
 *   - does not affect Claude (Mode A) installs
 *   - is idempotent: a second add with same version produces byte-equal opencode.json
 *   - replace path: v1→v2 drops orphaned servers, adds new ones
 */
import "../../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import "../../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";
const STUB_HOME = "/tmp/test-home";
const PLUGIN_NAME = "aidd-context";
const OPENCODE_JSON = join(PROJECT_ROOT, "opencode.json");

const MCP_CONTENT = JSON.stringify({
  mcpServers: {
    "local-tool": { command: "node", args: ["./server.js"] },
    "remote-tool": { url: "https://example.com/mcp" },
    "disabled-tool": { command: "python", args: ["./off.py"], disabled: true },
  },
});

function buildDist(name = PLUGIN_NAME, mcpContent = MCP_CONTENT): PluginDistribution {
  return new PluginDistribution({
    manifest: { name, version: "1.0.0" },
    format: "claude",
    files: [{ relativePath: ".mcp.json", content: mcpContent }],
    components: {
      commands: [],
      agents: [],
      rules: [],
      skills: [],
      hooks: [],
      mcp: [{ relativePath: ".mcp.json", content: mcpContent }],
    },
  });
}

function buildAdapter(seed: Record<string, string> = {}): {
  adapter: ModeBFlatMaterializationTranslator;
  fs: InMemoryFileAdapter;
} {
  const fs = new InMemoryFileAdapter(seed);
  const hasher = new DeterministicHasher();
  const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
  return { adapter, fs };
}

describe("install opencode plugin with MCP (Phase 4b integration)", () => {
  it("writes opencode.json with transformed mcp section", async () => {
    const { adapter, fs } = buildAdapter();
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    expect(fs.has(OPENCODE_JSON)).toBe(true);
    const parsed = JSON.parse(await fs.readFile(OPENCODE_JSON)) as {
      mcp: Record<string, { enabled: boolean; type: string }>;
    };
    expect(parsed.mcp["local-tool"].type).toBe("local");
    expect(parsed.mcp["remote-tool"].type).toBe("remote");
  });

  it("preserves disabled: true → enabled: false in opencode.json", async () => {
    const { adapter, fs } = buildAdapter();
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const parsed = JSON.parse(await fs.readFile(OPENCODE_JSON)) as {
      mcp: Record<string, { enabled: boolean }>;
    };
    expect(parsed.mcp["disabled-tool"].enabled).toBe(false);
    expect(parsed.mcp["local-tool"].enabled).toBe(true);
    expect(parsed.mcp["remote-tool"].enabled).toBe(true);
  });

  it("populates Plugin.mcpEntries in the manifest", async () => {
    const { adapter } = buildAdapter();
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const installed = manifest.getPlugins("opencode").find((p) => p.name === PLUGIN_NAME);
    expect(installed).toBeDefined();
    expect(installed?.mcpEntries.size).toBe(3);
    expect(installed?.mcpEntries.has("local-tool")).toBe(true);
    expect(installed?.mcpEntries.has("remote-tool")).toBe(true);
    expect(installed?.mcpEntries.has("disabled-tool")).toBe(true);
  });

  it("is idempotent: second add produces byte-equal opencode.json", async () => {
    const { adapter, fs } = buildAdapter();
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );
    const firstContent = await fs.readFile(OPENCODE_JSON);
    const firstPlugin = manifest.getPlugins("opencode").find((p) => p.name === PLUGIN_NAME);
    const firstMcpEntries = firstPlugin?.mcpEntries ?? new Map();

    // Simulate re-install (replace=true path: previous removed, then re-added)
    manifest.removePlugin("opencode", PLUGIN_NAME);
    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs",
      firstMcpEntries
    );
    const secondContent = await fs.readFile(OPENCODE_JSON);

    expect(secondContent).toBe(firstContent);
  });

  it("replace path: v1 {a,b} → v2 {a,c} leaves {a(v2),c}, drops b", async () => {
    const { adapter, fs } = buildAdapter();
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    const mcpV1 = JSON.stringify({
      mcpServers: {
        "server-a": { command: "node", args: ["a.js"] },
        "server-b": { command: "node", args: ["b.js"] },
      },
    });
    await adapter.addPlugin(
      buildDist(PLUGIN_NAME, mcpV1),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const v1Plugin = manifest.getPlugins("opencode").find((p) => p.name === PLUGIN_NAME);
    const v1McpEntries = v1Plugin?.mcpEntries ?? new Map();
    manifest.removePlugin("opencode", PLUGIN_NAME);

    const mcpV2 = JSON.stringify({
      mcpServers: {
        "server-a": { command: "node", args: ["a-v2.js"] },
        "server-c": { command: "node", args: ["c.js"] },
      },
    });
    await adapter.addPlugin(
      buildDist(PLUGIN_NAME, mcpV2),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs",
      v1McpEntries
    );

    const final = JSON.parse(await fs.readFile(OPENCODE_JSON)) as {
      mcp: Record<string, unknown>;
    };
    expect(final.mcp).toHaveProperty("server-a");
    expect(final.mcp).toHaveProperty("server-c");
    expect(final.mcp).not.toHaveProperty("server-b");

    const v2Plugin = manifest.getPlugins("opencode").find((p) => p.name === PLUGIN_NAME);
    expect(v2Plugin?.mcpEntries.has("server-a")).toBe(true);
    expect(v2Plugin?.mcpEntries.has("server-c")).toBe(true);
    expect(v2Plugin?.mcpEntries.has("server-b")).toBe(false);
  });

  it("preserves user-added servers not contributed by the plugin", async () => {
    const userServer = { type: "remote", url: "https://user.example.com/mcp", enabled: true };
    const { adapter, fs } = buildAdapter({
      [OPENCODE_JSON]: JSON.stringify({ mcp: { "user-server": userServer } }, null, 2),
    });
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const parsed = JSON.parse(await fs.readFile(OPENCODE_JSON)) as {
      mcp: Record<string, unknown>;
    };
    expect(parsed.mcp["user-server"]).toEqual(userServer);
    expect(parsed.mcp["local-tool"]).toBeDefined();
  });

  it("does not write opencode.json when plugin mcp is empty (no servers)", async () => {
    const emptyMcp = JSON.stringify({ mcpServers: {} });
    const { adapter, fs } = buildAdapter();
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(PLUGIN_NAME, emptyMcp),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    expect(fs.has(OPENCODE_JSON)).toBe(false);
    const plugins = manifest.getPlugins("opencode");
    expect(plugins.find((p) => p.name === PLUGIN_NAME)).toBeUndefined();
  });

  it("preserves instructions key from framework-default opencode.json shape after merge", async () => {
    const frameworkDefault = JSON.stringify(
      { instructions: [".opencode/rules/**/*.md"], mcp: {} },
      null,
      2
    );
    const { adapter, fs } = buildAdapter({ [OPENCODE_JSON]: frameworkDefault });
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const parsed = JSON.parse(await fs.readFile(OPENCODE_JSON)) as {
      instructions: string[];
      mcp: Record<string, unknown>;
    };
    expect(parsed.instructions).toEqual([".opencode/rules/**/*.md"]);
    expect(parsed.mcp["local-tool"]).toBeDefined();
  });

  it("skips a colliding plugin server entry and preserves the user-owned server", async () => {
    const userServer = { type: "local", command: "node", args: ["user.js"], enabled: true };
    const { adapter, fs } = buildAdapter({
      [OPENCODE_JSON]: JSON.stringify({ mcp: { "local-tool": userServer } }, null, 2),
    });
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    const { skipped } = await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    // "local-tool" is user-owned — must be skipped, not overwritten
    const mcpSkip = skipped.find((s) => s.component === "mcp" && s.toolId === "opencode");
    expect(mcpSkip).toBeDefined();
    expect(mcpSkip?.reason).toContain("local-tool");
    expect(mcpSkip?.pluginName).toBe(PLUGIN_NAME);

    // User server must remain untouched
    const parsed = JSON.parse(await fs.readFile(OPENCODE_JSON)) as {
      mcp: Record<string, unknown>;
    };
    expect(parsed.mcp["local-tool"]).toEqual(userServer);

    // Plugin must NOT claim local-tool in mcpEntries
    const installed = manifest.getPlugins("opencode").find((p) => p.name === PLUGIN_NAME);
    expect(installed?.mcpEntries.has("local-tool")).toBe(false);
    // Non-colliding servers are still installed
    expect(installed?.mcpEntries.has("remote-tool")).toBe(true);
  });
});
