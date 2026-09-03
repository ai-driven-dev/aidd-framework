/**
 * Phase 5 — OpenCode plugin remove: unmerge MCP entries.
 * Asserts that removing a plugin installed with mcpEntries:
 *   - strips only plugin-contributed servers from opencode.json
 *   - preserves user-added servers
 *   - removes the plugin from the manifest
 */
import "../../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-b-flat-materialization-translator.js";
import { PluginRemoveUseCase } from "../../../../../../src/contexts/framework/application/plugin/plugin-remove-use-case.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../../helpers/ports/in-memory-manifest-repository.js";

const PROJECT_ROOT = "/test-project";
const STUB_HOME = "/tmp/test-home";
const PLUGIN_NAME = "aidd-context";
const OPENCODE_JSON = join(PROJECT_ROOT, "opencode.json");

const USER_SERVER = { type: "remote", url: "https://user.example.com/mcp", enabled: true };

const MCP_CONTENT = JSON.stringify({
  mcpServers: {
    "plugin-tool": { command: "node", args: ["./server.js"] },
    "remote-tool": { url: "https://example.com/mcp" },
  },
});

function buildDist(): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: PLUGIN_NAME, version: "1.0.0" },
    format: "claude",
    files: [{ relativePath: ".mcp.json", content: MCP_CONTENT }],
    components: {
      commands: [],
      agents: [],
      rules: [],
      skills: [],
      hooks: [],
      mcp: [{ relativePath: ".mcp.json", content: MCP_CONTENT }],
    },
  });
}

describe("remove opencode plugin: unmerge MCP entries (Phase 5)", () => {
  it("removes only plugin-contributed servers; preserves user-added servers", async () => {
    const existingJson = JSON.stringify({ mcp: { "user-server": USER_SERVER } }, null, 2);
    const fs = new InMemoryFileAdapter({ [OPENCODE_JSON]: existingJson });
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);
    const manifestRepo = new InMemoryManifestRepository(manifest);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined
    );
    await manifestRepo.save(manifest);

    const removeUseCase = new PluginRemoveUseCase(fs, manifestRepo);
    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["opencode"],
      projectRoot: PROJECT_ROOT,
    });

    const parsed = JSON.parse(await fs.readFile(OPENCODE_JSON)) as {
      mcp: Record<string, unknown>;
    };
    expect(parsed.mcp).not.toHaveProperty("plugin-tool");
    expect(parsed.mcp).not.toHaveProperty("remote-tool");
    expect(parsed.mcp["user-server"]).toEqual(USER_SERVER);
  });

  it("removes the plugin from the manifest after unmerge", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);
    const manifestRepo = new InMemoryManifestRepository(manifest);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined
    );
    await manifestRepo.save(manifest);

    const removeUseCase = new PluginRemoveUseCase(fs, manifestRepo);
    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["opencode"],
      projectRoot: PROJECT_ROOT,
    });

    const loaded = await manifestRepo.load();
    const plugins = loaded?.getPlugins("opencode") ?? [];
    expect(plugins.some((p) => p.name === PLUGIN_NAME)).toBe(false);
  });

  it("is safe to call when opencode.json does not exist (first install never completed)", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);
    const manifestRepo = new InMemoryManifestRepository(manifest);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined
    );
    // Simulate opencode.json not existing at remove time
    await fs.deleteFile(OPENCODE_JSON);
    await manifestRepo.save(manifest);

    const removeUseCase = new PluginRemoveUseCase(fs, manifestRepo);
    await expect(
      removeUseCase.execute({
        pluginName: PLUGIN_NAME,
        toolIds: ["opencode"],
        projectRoot: PROJECT_ROOT,
      })
    ).resolves.not.toThrow();
  });
});
