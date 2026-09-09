import "../../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../../src/contexts/distribution/domain/marketplace.js";
import { BuiltTreeMaterializationTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/built-tree-materialization-translator.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/proj";
const HOME = "/home/u";
const BUILT = "/built/cursor";

function dist(): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: "sample-plugin", version: "1.0.0" },
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

describe("BuiltTreeMaterializationTranslator — cursor (integration)", () => {
  it("copies the built plugin subtree verbatim into the user plugin dir", async () => {
    const fs = new InMemoryFileAdapter();
    // Built cursor tree (transformed content already): @ expanded, .mdc rule, dotted .mcp.json.
    const skill = "Load [assets/x.md](../assets/x.md)";
    fs.setFile(`${BUILT}/plugins/sample-plugin/skills/demo/SKILL.md`, skill);
    fs.setFile(`${BUILT}/plugins/sample-plugin/rules/r.mdc`, "rule body");
    fs.setFile(`${BUILT}/plugins/sample-plugin/.mcp.json`, "{}");
    fs.setFile(
      `${BUILT}/plugins/sample-plugin/.cursor-plugin/plugin.json`,
      '{"name":"sample-plugin"}'
    );

    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);
    const translator = new BuiltTreeMaterializationTranslator(
      fs,
      new DeterministicHasher(),
      () => HOME,
      fakeEnsureBuiltMarketplace(),
      await makeRegistry()
    );

    await translator.addPlugin(
      dist(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework"
    );

    const base = `${HOME}/.cursor/plugins/local/sample-plugin`;
    // Byte-equal to the built tree, with the plugins/<name> prefix stripped.
    expect(fs.getFile(`${base}/skills/demo/SKILL.md`)).toBe(skill);
    expect(fs.getFile(`${base}/rules/r.mdc`)).toBe("rule body");
    // .mcp.json keeps its dotted name (came from build, not remapped to mcp.json).
    expect(fs.getFile(`${base}/.mcp.json`)).toBe("{}");
    const installed = manifest.getPlugins("cursor").find((p) => p.name === "sample-plugin");
    expect(installed?.files.size).toBe(4);
  });

  it("falls back to flat materialization when no marketplace is given (raw local install)", async () => {
    const fs = new InMemoryFileAdapter();
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);
    const translator = new BuiltTreeMaterializationTranslator(
      fs,
      new DeterministicHasher(),
      () => HOME,
      fakeEnsureBuiltMarketplace(),
      await makeRegistry()
    );
    const result = await translator.addPlugin(
      dist(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined
    );
    expect(result.skipped).toEqual([]);
  });
});

describe("BuiltTreeMaterializationTranslator — when no built tree applies (integration)", () => {
  const COMMAND = "---\nname: aidd:01:hello\n---\n# Hello";

  function distWithCommand(): PluginDistribution {
    return new PluginDistribution({
      manifest: { name: "sample-plugin", version: "1.0.0" },
      format: "claude",
      files: [{ relativePath: "commands/hello.md", content: COMMAND }],
      components: {
        commands: [{ relativePath: "commands/hello.md", content: COMMAND }],
        agents: [],
        rules: [],
        skills: [],
        hooks: [],
        mcp: [],
      },
    });
  }

  async function install(marketplace: string | undefined): Promise<InMemoryFileAdapter> {
    const fs = new InMemoryFileAdapter();
    fs.setFile(`${BUILT}/plugins/sample-plugin/skills/demo/SKILL.md`, "built skill");
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);
    const translator = new BuiltTreeMaterializationTranslator(
      fs,
      new DeterministicHasher(),
      () => HOME,
      fakeEnsureBuiltMarketplace(),
      await makeRegistry()
    );
    await translator.addPlugin(
      distWithCommand(),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      marketplace
    );
    return fs;
  }

  it("materializes the distribution itself, never the built tree, when no marketplace is given", async () => {
    const fs = await install(undefined);

    expect(fs.listUnder(`${HOME}/.cursor/plugins/local`)).toStrictEqual([
      `${HOME}/.cursor/plugins/local/sample-plugin/commands/hello.md`,
    ]);
  });

  it("materializes the distribution itself when the named marketplace is not registered", async () => {
    const fs = await install("unregistered-marketplace");

    expect(fs.listUnder(`${HOME}/.cursor/plugins/local`)).toStrictEqual([
      `${HOME}/.cursor/plugins/local/sample-plugin/commands/hello.md`,
    ]);
  });
});
