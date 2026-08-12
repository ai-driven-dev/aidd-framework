import "../../../../../src/domain/tools/ai/gemini.js";
import { describe, expect, it } from "vitest";
import { BuiltTreeMaterializationTranslator } from "../../../../../src/application/use-cases/plugin/translator/built-tree-materialization-translator.js";
import { Manifest } from "../../../../../src/domain/models/manifest.js";
import { Marketplace } from "../../../../../src/domain/models/marketplace.js";
import { PluginDistribution } from "../../../../../src/domain/models/plugin-distribution.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/proj";
const BUILT = "/built/gemini";

function dist(): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: "aidd-vcs", version: "1.0.0" },
    format: "claude",
    files: [],
    components: { commands: [], agents: [], rules: [], skills: [], hooks: [], mcp: [] },
  });
}

async function makeRegistry(): Promise<InMemoryMarketplaceRegistry> {
  const registry = new InMemoryMarketplaceRegistry();
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: "aidd-framework",
      source: { kind: "local", path: "/src/framework" },
      scope: "project",
      addedAt: "2026-01-01T00:00:00Z",
    })
  );
  return registry;
}

function buildTranslator(
  fs: InMemoryFileAdapter,
  registry: InMemoryMarketplaceRegistry
): BuiltTreeMaterializationTranslator {
  return new BuiltTreeMaterializationTranslator(
    fs,
    new DeterministicHasher(),
    () => "/home/u",
    fakeEnsureBuiltMarketplace(),
    registry
  );
}

describe("BuiltTreeMaterializationTranslator — gemini (integration)", () => {
  /**
   * Gemini spans two roots: its own .gemini/ and the shared .agents/ tree, and its agents sit
   * one level shallower than opencode's skills. Both are why ownership could not stay a fixed
   * segment at a fixed depth under a hardcoded directory.
   */
  it("takes the flat branch and copies this plugin's files from both roots", async () => {
    const fs = new InMemoryFileAdapter();
    const skill = "Load [assets/x.md](../assets/x.md)";
    fs.setFile(`${BUILT}/.agents/skills/aidd-vcs-01-commit/SKILL.md`, skill);
    fs.setFile(`${BUILT}/.gemini/agents/aidd-vcs-helper.md`, "agent body");
    // Another plugin's file, and a build sentinel: neither belongs to this install.
    fs.setFile(`${BUILT}/.agents/skills/aidd-dev-00-sdlc/SKILL.md`, "OTHER PLUGIN");
    fs.setFile(`${BUILT}/.build-version`, "5.0.0:1.0.0");

    const manifest = Manifest.create();
    manifest.addTool("gemini", "test", []);
    const translator = buildTranslator(fs, await makeRegistry());

    await translator.addPlugin(
      dist(),
      "gemini",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework",
      "docs"
    );

    expect(fs.getFile(`${PROJECT_ROOT}/.agents/skills/aidd-vcs-01-commit/SKILL.md`)).toBe(skill);
    expect(fs.getFile(`${PROJECT_ROOT}/.gemini/agents/aidd-vcs-helper.md`)).toBe("agent body");
    expect(fs.has(`${PROJECT_ROOT}/.agents/skills/aidd-dev-00-sdlc/SKILL.md`)).toBe(false);
    expect(fs.has(`${PROJECT_ROOT}/.build-version`)).toBe(false);
    expect(manifest.getPlugins("gemini").find((p) => p.name === "aidd-vcs")?.files.size).toBe(2);
  });

  it("ignores a file under a root gemini does not own", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(`${BUILT}/.agents/skills/aidd-vcs-01-commit/SKILL.md`, "mine");
    // Correctly namespaced for this plugin, but under another tool's directory.
    fs.setFile(`${BUILT}/.opencode/skills/aidd-vcs-01-commit/SKILL.md`, "not gemini's");

    const manifest = Manifest.create();
    manifest.addTool("gemini", "test", []);
    const translator = buildTranslator(fs, await makeRegistry());

    await translator.addPlugin(
      dist(),
      "gemini",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework",
      "docs"
    );

    expect(fs.has(`${PROJECT_ROOT}/.opencode/skills/aidd-vcs-01-commit/SKILL.md`)).toBe(false);
    expect(manifest.getPlugins("gemini").find((p) => p.name === "aidd-vcs")?.files.size).toBe(1);
  });
});
