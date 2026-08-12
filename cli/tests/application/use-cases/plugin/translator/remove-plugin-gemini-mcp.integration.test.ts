/**
 * Gemini plugin remove: unmerge MCP entries from the shared settings file.
 *
 * Gemini and opencode share the capability shape that routes MCP merging, but keep their
 * servers under different keys — `mcpServers` in .gemini/settings.json against `mcp` in
 * opencode.json. Running one tool's unmerge against the other's file is the failure this
 * suite exists to catch, and .gemini/settings.json is user-owned besides.
 */
import "../../../../../src/domain/tools/ai/gemini.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginRemoveUseCase } from "../../../../../src/application/use-cases/plugin/plugin-remove-use-case.js";
import { ModeBFlatMaterializationTranslator } from "../../../../../src/application/use-cases/plugin/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../src/domain/models/manifest.js";
import { PluginDistribution } from "../../../../../src/domain/models/plugin-distribution.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";

const PROJECT_ROOT = "/test-project";
const STUB_HOME = "/tmp/test-home";
const PLUGIN_NAME = "aidd-context";
const SETTINGS = join(PROJECT_ROOT, ".gemini", "settings.json");

const USER_SERVER = { command: "node", args: ["./mine.js"] };

const MCP_CONTENT = JSON.stringify({
  mcpServers: {
    "plugin-tool": { command: "node", args: ["./server.js"] },
  },
});

/** Keys a real Gemini user already has in this file, which no plugin removal may touch. */
const USER_SETTINGS = {
  context: { fileName: ["AGENTS.md"] },
  theme: "GitHub",
  mcpServers: { "user-server": USER_SERVER },
};

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

async function installThenRemove(fs: InMemoryFileAdapter, removeTwice = false) {
  const hasher = new DeterministicHasher();
  const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
  const manifest = Manifest.create();
  manifest.addTool("gemini", "test", []);
  const manifestRepo = new InMemoryManifestRepository(manifest);

  await adapter.addPlugin(
    buildDist(),
    "gemini",
    { kind: "local", path: "/plugin-source" },
    PROJECT_ROOT,
    manifest,
    undefined,
    "docs"
  );
  await manifestRepo.save(manifest);

  const removeUseCase = new PluginRemoveUseCase(fs, manifestRepo);
  const run = () =>
    removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["gemini"],
      projectRoot: PROJECT_ROOT,
    });
  await run();
  if (removeTwice) await run().catch(() => undefined);
  return manifestRepo;
}

function readSettings(fs: InMemoryFileAdapter): Promise<string> {
  return fs.readFile(SETTINGS);
}

describe("remove gemini plugin: unmerge MCP entries", () => {
  it("strips the plugin's servers from mcpServers, not from another tool's key", async () => {
    const fs = new InMemoryFileAdapter({ [SETTINGS]: JSON.stringify(USER_SETTINGS, null, 2) });

    await installThenRemove(fs);

    const parsed = JSON.parse(await readSettings(fs)) as Record<string, unknown>;
    const servers = parsed.mcpServers as Record<string, unknown>;
    expect(servers).not.toHaveProperty("plugin-tool");
    expect(parsed).not.toHaveProperty("mcp");
  });

  it("leaves every user-authored key intact", async () => {
    const fs = new InMemoryFileAdapter({ [SETTINGS]: JSON.stringify(USER_SETTINGS, null, 2) });

    await installThenRemove(fs);

    const parsed = JSON.parse(await readSettings(fs)) as Record<string, unknown>;
    expect(parsed.theme).toBe("GitHub");
    expect(parsed.context).toEqual({ fileName: ["AGENTS.md"] });
    expect((parsed.mcpServers as Record<string, unknown>)["user-server"]).toEqual(USER_SERVER);
  });

  it("is idempotent: a second removal changes nothing", async () => {
    const fs = new InMemoryFileAdapter({ [SETTINGS]: JSON.stringify(USER_SETTINGS, null, 2) });

    await installThenRemove(fs);
    const afterFirst = await readSettings(fs);
    await installThenRemove(fs, true);

    expect(await readSettings(fs)).toBe(afterFirst);
  });

  it("removes the plugin from the manifest", async () => {
    const fs = new InMemoryFileAdapter({ [SETTINGS]: JSON.stringify(USER_SETTINGS, null, 2) });

    const manifestRepo = await installThenRemove(fs);

    const loaded = await manifestRepo.load();
    expect((loaded?.getPlugins("gemini") ?? []).some((p) => p.name === PLUGIN_NAME)).toBe(false);
  });
});
