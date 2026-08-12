/**
 * Gemini plugin install through the flat translator.
 *
 * Records the install path's real output, which is NOT the archive's: `framework build`
 * writes skills to `.agents/skills/<plugin>-<skill>/` and agents to
 * `.gemini/agents/<plugin>-<agent>.md`, while install writes both under `.gemini/`, nested
 * by plugin rather than namespaced by it. Whether the real binary discovers the nested shape
 * is an empirical question, deliberately left to this part's phase 4 rather than assumed here.
 */
import "../../../../../src/domain/tools/ai/gemini.js";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../src/application/use-cases/plugin/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../src/domain/models/manifest.js";
import { PluginDistribution } from "../../../../../src/domain/models/plugin-distribution.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";
const STUB_HOME = "/tmp/test-home";
const PLUGIN_NAME = "aidd-context";

const SKILL = {
  relativePath: "skills/01-brainstorm/SKILL.md",
  content: "---\nname: 01-brainstorm\n---\n# Brainstorm",
};
const AGENT = { relativePath: "agents/coach.md", content: "---\nname: coach\n---\n# Coach" };
const HOOK = { relativePath: "hooks/hooks.json", content: '{"SessionStart":[]}' };

function buildDist(withHooks = false): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: PLUGIN_NAME, version: "1.0.0" },
    format: "claude",
    files: withHooks ? [SKILL, AGENT, HOOK] : [SKILL, AGENT],
    components: {
      commands: [],
      agents: [AGENT],
      rules: [],
      skills: [SKILL],
      hooks: withHooks ? [HOOK] : [],
      mcp: [],
    },
  });
}

async function install(withHooks = false) {
  const fs = new InMemoryFileAdapter();
  const adapter = new ModeBFlatMaterializationTranslator(fs, new DeterministicHasher(), () =>
    String(STUB_HOME)
  );
  const manifest = Manifest.create();
  manifest.addTool("gemini", "test", []);
  const result = await adapter.addPlugin(
    buildDist(withHooks),
    "gemini",
    { kind: "local", path: "/plugin-source" },
    PROJECT_ROOT,
    manifest,
    undefined,
    "docs"
  );
  return { fs, manifest, result };
}

describe("install gemini plugin via the flat translator", () => {
  it("materializes skills and agents under the project root", async () => {
    const { fs } = await install();

    expect(fs.has(`${PROJECT_ROOT}/.gemini/skills/${PLUGIN_NAME}/01-brainstorm/SKILL.md`)).toBe(
      true
    );
    expect(fs.has(`${PROJECT_ROOT}/.gemini/agents/${PLUGIN_NAME}/coach.md`)).toBe(true);
  });

  it("tracks exactly the files it wrote in the manifest", async () => {
    const { manifest } = await install();

    const plugin = manifest.getPlugins("gemini").find((p) => p.name === PLUGIN_NAME);
    expect([...(plugin?.files.keys() ?? [])].sort()).toEqual([
      `.gemini/agents/${PLUGIN_NAME}/coach.md`,
      `.gemini/skills/${PLUGIN_NAME}/01-brainstorm/SKILL.md`,
    ]);
  });

  it("skips declarative hooks and says why, naming gemini rather than another tool", async () => {
    const { result } = await install(true);

    const hookSkip = result.skipped.find((s) => s.component === "hooks");
    expect(hookSkip?.toolId).toBe("gemini");
    expect(hookSkip?.reason).toContain(".gemini/settings.json");
    expect(hookSkip?.reason).not.toContain("OpenCode");
  });
});
