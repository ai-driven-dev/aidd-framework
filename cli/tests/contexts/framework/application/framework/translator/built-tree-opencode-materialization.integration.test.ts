import "../../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
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
        { relativePath: "hooks/opencode-plugin.js", content: "export const plugin = 1;" },
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
      "aidd-framework"
    );

    expect(fs.getFile(`${PROJECT_ROOT}/.opencode/skills/aidd-vcs/01-commit/SKILL.md`)).toBe(skill);
    expect(fs.getFile(`${PROJECT_ROOT}/.opencode/agents/aidd-vcs-helper.md`)).toBe("agent body");
    // Other plugin's files and the sentinel are NOT installed.
    expect(fs.has(`${PROJECT_ROOT}/.opencode/skills/aidd-dev/00-sdlc/SKILL.md`)).toBe(false);
    expect(fs.has(`${PROJECT_ROOT}/.build-version`)).toBe(false);
    const installed = manifest.getPlugins("opencode").find((p) => p.name === "aidd-vcs");
    expect(installed?.files.size).toBe(2);
  });

  // Hooks land under .opencode/hooks/<plugin>/, and the one script that is OpenCode's own
  // runtime module goes to .opencode/plugin/<plugin>.js: neither follows the "<plugin>-"
  // naming convention belongsToPlugin reads for agents and skills, so this plugin's hook
  // paths are computed from its own distribution and matched by path instead.
  it("copies this plugin's flat hooks by their computed paths, not by naming convention", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(`${BUILT}/.opencode/hooks/aidd-vcs/journal.cjs`, "// journal");
    fs.setFile(`${BUILT}/.opencode/hooks/aidd-vcs/lib/host.cjs`, "// host");
    fs.setFile(`${BUILT}/.opencode/plugin/aidd-vcs.js`, "export const plugin = 1;");
    fs.setFile(`${BUILT}/.opencode/hooks/other-plugin/hook.js`, "OTHER PLUGIN");
    fs.setFile(`${BUILT}/.opencode/plugin/other-plugin.js`, "OTHER PLUGIN");

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
      "aidd-framework"
    );

    expect(fs.getFile(`${PROJECT_ROOT}/.opencode/hooks/aidd-vcs/journal.cjs`)).toBe("// journal");
    expect(fs.getFile(`${PROJECT_ROOT}/.opencode/hooks/aidd-vcs/lib/host.cjs`)).toBe("// host");
    expect(fs.getFile(`${PROJECT_ROOT}/.opencode/plugin/aidd-vcs.js`)).toBe(
      "export const plugin = 1;"
    );
    expect(fs.has(`${PROJECT_ROOT}/.opencode/hooks/aidd-vcs/hooks.json`)).toBe(false);
    expect(fs.has(`${PROJECT_ROOT}/.opencode/hooks/other-plugin/hook.js`)).toBe(false);
    expect(fs.has(`${PROJECT_ROOT}/.opencode/plugin/other-plugin.js`)).toBe(false);
  });
});
