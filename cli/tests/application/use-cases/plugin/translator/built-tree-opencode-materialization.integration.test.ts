import "../../../../../src/domain/tools/ai/opencode.js";
import "../../../../../src/domain/tools/ai/kilo.js";
import { join } from "node:path";
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
const BUILT = "/built/opencode";

function dist(mcpContent?: string): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: "aidd-vcs", version: "1.0.0" },
    format: "claude",
    files: [],
    components: {
      commands: [],
      agents: [],
      rules: [],
      skills: [],
      hooks: [],
      mcp: mcpContent === undefined ? [] : [{ relativePath: ".mcp.json", content: mcpContent }],
    },
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

describe("BuiltTreeMaterializationTranslator — opencode (integration)", () => {
  it("copies only this plugin's flat files into the project, byte-for-byte", async () => {
    const fs = new InMemoryFileAdapter();
    const skill = "Load [assets/x.md](../assets/x.md)";
    // This plugin's files (namespaced aidd-vcs-*) plus another plugin's (must be ignored).
    fs.setFile(`${BUILT}/.opencode/skills/aidd-vcs-01-commit/SKILL.md`, skill);
    fs.setFile(`${BUILT}/.opencode/agents/aidd-vcs-helper.md`, "agent body");
    fs.setFile(`${BUILT}/.opencode/skills/aidd-dev-00-sdlc/SKILL.md`, "OTHER PLUGIN");
    fs.setFile(`${BUILT}/.build-version`, "5.0.0:1.0.0");

    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);
    const translator = new BuiltTreeMaterializationTranslator(
      fs,
      new DeterministicHasher(),
      () => "/home/u",
      fakeEnsureBuiltMarketplace(),
      await makeRegistry()
    );

    await translator.addPlugin(
      dist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework",
      "docs"
    );

    expect(fs.getFile(join(PROJECT_ROOT, ".opencode/skills/aidd-vcs-01-commit/SKILL.md"))).toBe(
      skill
    );
    expect(fs.getFile(join(PROJECT_ROOT, ".opencode/agents/aidd-vcs-helper.md"))).toBe(
      "agent body"
    );
    // Other plugin's files and the sentinel are NOT installed.
    expect(fs.has(join(PROJECT_ROOT, ".opencode/skills/aidd-dev-00-sdlc/SKILL.md"))).toBe(false);
    expect(fs.has(join(PROJECT_ROOT, ".build-version"))).toBe(false);
    const installed = manifest.getPlugins("opencode").find((p) => p.name === "aidd-vcs");
    expect(installed?.files.size).toBe(2);
  });

  it("merges Kilo MCP entries and records them for removal", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(
      `${BUILT.replace("opencode", "kilo")}/.kilo/skills/aidd-vcs-01-commit/SKILL.md`,
      "skill"
    );
    const manifest = Manifest.create();
    manifest.addTool("kilo", "test", []);
    const translator = new BuiltTreeMaterializationTranslator(
      fs,
      new DeterministicHasher(),
      () => "/home/u",
      fakeEnsureBuiltMarketplace(),
      await makeRegistry()
    );
    const mcpContent = JSON.stringify({
      mcpServers: { github: { url: "https://mcp.github.example" } },
    });

    await translator.addPlugin(
      dist(mcpContent),
      "kilo",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework",
      "docs"
    );

    expect(JSON.parse(fs.getFile(join(PROJECT_ROOT, "kilo.json")) ?? "{}")).toEqual({
      mcp: { github: { type: "remote", url: "https://mcp.github.example", enabled: true } },
    });
    expect(
      manifest
        .getPlugins("kilo")
        .find((p) => p.name === "aidd-vcs")
        ?.mcpEntries.has("github")
    ).toBe(true);
  });
});
