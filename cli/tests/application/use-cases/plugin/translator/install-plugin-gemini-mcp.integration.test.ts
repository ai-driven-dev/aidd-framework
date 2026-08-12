/**
 * Gemini plugin install: MCP merge into the shared settings file.
 *
 * `.gemini/settings.json` is not a file aidd owns — a real Gemini user already has one, and
 * three writers touch it (settings seed, MCP, hooks). So the merge has to land under
 * `mcpServers` specifically, and leave everything else exactly as it found it.
 */
import "../../../../../src/domain/tools/ai/gemini.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../src/application/use-cases/plugin/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../src/domain/models/manifest.js";
import { PluginDistribution } from "../../../../../src/domain/models/plugin-distribution.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";
const STUB_HOME = "/tmp/test-home";
const PLUGIN_NAME = "aidd-context";
const SETTINGS = join(PROJECT_ROOT, ".gemini", "settings.json");

const MCP_CONTENT = JSON.stringify({
  mcpServers: {
    "local-tool": { command: "node", args: ["./server.js"] },
    "remote-tool": { url: "https://example.com/mcp" },
  },
});

const MCP_CONTENT_V2 = JSON.stringify({
  mcpServers: { "remote-tool": { url: "https://example.com/v2" } },
});

/** What a Gemini user already has before aidd ever writes here. */
const USER_SETTINGS = {
  context: { fileName: ["AGENTS.md"] },
  theme: "GitHub",
  mcpServers: { "user-server": { command: "node", args: ["./mine.js"] } },
};

function buildDist(mcpContent = MCP_CONTENT): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: PLUGIN_NAME, version: "1.0.0" },
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

function buildAdapter(seed: Record<string, string> = {}) {
  const fs = new InMemoryFileAdapter(seed);
  const adapter = new ModeBFlatMaterializationTranslator(fs, new DeterministicHasher(), () =>
    String(STUB_HOME)
  );
  return { fs, adapter };
}

async function addPlugin(
  adapter: ModeBFlatMaterializationTranslator,
  manifest: Manifest,
  dist: PluginDistribution,
  previous: ReadonlyMap<string, string> = new Map()
) {
  return adapter.addPlugin(
    dist,
    "gemini",
    { kind: "local", path: "/plugin-source" },
    PROJECT_ROOT,
    manifest,
    undefined,
    "docs",
    previous
  );
}

function freshManifest(): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("gemini", "test", []);
  return manifest;
}

describe("install gemini plugin with MCP", () => {
  it("merges servers under mcpServers, creating no section of its own", async () => {
    const { fs, adapter } = buildAdapter();

    await addPlugin(adapter, freshManifest(), buildDist());

    const parsed = JSON.parse(await fs.readFile(SETTINGS)) as Record<string, unknown>;
    expect(Object.keys(parsed.mcpServers as object).sort()).toEqual(["local-tool", "remote-tool"]);
    expect(parsed).not.toHaveProperty("mcp");
  });

  it("leaves the user's own settings keys untouched", async () => {
    const { fs, adapter } = buildAdapter({ [SETTINGS]: JSON.stringify(USER_SETTINGS, null, 2) });

    await addPlugin(adapter, freshManifest(), buildDist());

    const parsed = JSON.parse(await fs.readFile(SETTINGS)) as Record<string, unknown>;
    expect(parsed.theme).toBe("GitHub");
    expect(parsed.context).toEqual({ fileName: ["AGENTS.md"] });
    expect(parsed.mcpServers).toHaveProperty("user-server");
  });

  it("records the contributed servers in the manifest", async () => {
    const { adapter } = buildAdapter();
    const manifest = freshManifest();

    await addPlugin(adapter, manifest, buildDist());

    const plugin = manifest.getPlugins("gemini").find((p) => p.name === PLUGIN_NAME);
    expect([...(plugin?.mcpEntries.keys() ?? [])].sort()).toEqual(["local-tool", "remote-tool"]);
  });

  it("is idempotent: reinstalling the same version leaves the file byte-equal", async () => {
    const { fs, adapter } = buildAdapter({ [SETTINGS]: JSON.stringify(USER_SETTINGS, null, 2) });
    const manifest = freshManifest();
    const first = await addPlugin(adapter, manifest, buildDist());
    const afterFirst = await fs.readFile(SETTINGS);

    const plugin = manifest.getPlugins("gemini").find((p) => p.name === PLUGIN_NAME);
    manifest.removePlugin("gemini", PLUGIN_NAME);
    await addPlugin(adapter, manifest, buildDist(), plugin?.mcpEntries ?? new Map());

    expect(first.skipped).toEqual([]);
    expect(await fs.readFile(SETTINGS)).toBe(afterFirst);
  });

  it("drops servers the plugin no longer ships when its version changes", async () => {
    const { fs, adapter } = buildAdapter();
    const manifest = freshManifest();
    await addPlugin(adapter, manifest, buildDist());
    const previous = manifest.getPlugins("gemini")[0]?.mcpEntries ?? new Map();
    manifest.removePlugin("gemini", PLUGIN_NAME);

    await addPlugin(adapter, manifest, buildDist(MCP_CONTENT_V2), previous);

    const servers = (JSON.parse(await fs.readFile(SETTINGS)) as Record<string, unknown>)
      .mcpServers as Record<string, unknown>;
    expect(servers).not.toHaveProperty("local-tool");
    expect(servers).toHaveProperty("remote-tool");
  });

  it("skips a server whose name a user already owns, and says which file", async () => {
    const seeded = { mcpServers: { "local-tool": { command: "node", args: ["./user.js"] } } };
    const { adapter } = buildAdapter({ [SETTINGS]: JSON.stringify(seeded, null, 2) });

    const result = await addPlugin(adapter, freshManifest(), buildDist());

    const collision = result.skipped.find((s) => s.component === "mcp");
    expect(collision?.reason).toContain("local-tool");
    expect(collision?.reason).toContain(".gemini/settings.json");
  });
});
