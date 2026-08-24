import "../../../../../src/domain/tools/ai/opencode.js";
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

function dist(): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: "aidd-vcs", version: "1.0.0" },
    format: "claude",
    files: [],
    components: { commands: [], agents: [], rules: [], skills: [], hooks: [], mcp: [] },
  });
}

function distWithHooks(): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: "aidd-vcs", version: "1.0.0" },
    format: "claude",
    files: [],
    components: {
      commands: [],
      agents: [],
      rules: [],
      skills: [],
      mcp: [],
      hooks: [
        { relativePath: "hooks/hooks.json", content: "{}" },
        { relativePath: "hooks/journal.cjs", content: "// journal" },
        { relativePath: "hooks/lib/host.cjs", content: "// host" },
      ],
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
    // This plugin's skills nest under its own segment (aidd-vcs/...); agents stay
    // hyphen-prefixed (aidd-vcs-helper.md). Another plugin's files must be ignored.
    fs.setFile(`${BUILT}/.opencode/skills/aidd-vcs/01-commit/SKILL.md`, skill);
    fs.setFile(`${BUILT}/.opencode/agents/aidd-vcs-helper.md`, "agent body");
    fs.setFile(`${BUILT}/.opencode/skills/aidd-dev/00-sdlc/SKILL.md`, "OTHER PLUGIN");
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

    expect(fs.getFile(`${PROJECT_ROOT}/.opencode/skills/aidd-vcs/01-commit/SKILL.md`)).toBe(skill);
    expect(fs.getFile(`${PROJECT_ROOT}/.opencode/agents/aidd-vcs-helper.md`)).toBe("agent body");
    // Other plugin's files and the sentinel are NOT installed.
    expect(fs.has(`${PROJECT_ROOT}/.opencode/skills/aidd-dev/00-sdlc/SKILL.md`)).toBe(false);
    expect(fs.has(`${PROJECT_ROOT}/.build-version`)).toBe(false);
    const installed = manifest.getPlugins("opencode").find((p) => p.name === "aidd-vcs");
    expect(installed?.files.size).toBe(2);
  });

  // finding #1: the built tree's flat hooks land in one shared, non-namespaced directory
  // (.opencode/plugin/), not under a "<plugin>-"-prefixed segment like skills/agents —
  // so belongsToPlugin's naming-convention filter dropped every hook file here, even
  // though the build itself now delivers them. This plugin's own hook filenames, read
  // from its distribution, are what scope the copy instead.
  it("copies this plugin's flat hooks by filename, not by naming convention", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(`${BUILT}/.opencode/plugin/journal.cjs`, "// journal");
    fs.setFile(`${BUILT}/.opencode/plugin/lib/host.cjs`, "// host");
    fs.setFile(`${BUILT}/.opencode/plugin/other-plugin-hook.js`, "OTHER PLUGIN");

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
      distWithHooks(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework",
      "docs"
    );

    expect(fs.getFile(`${PROJECT_ROOT}/.opencode/plugin/journal.cjs`)).toBe("// journal");
    expect(fs.getFile(`${PROJECT_ROOT}/.opencode/plugin/lib/host.cjs`)).toBe("// host");
    expect(fs.has(`${PROJECT_ROOT}/.opencode/plugin/hooks.json`)).toBe(false);
    expect(fs.has(`${PROJECT_ROOT}/.opencode/plugin/other-plugin-hook.js`)).toBe(false);
  });
});
