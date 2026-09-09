import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpencodeFlatContract } from "../../../../../../src/contexts/tools/domain/profiles/opencode/build.js";
import { opencode } from "../../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { PluginContentTranslator } from "../../../../../../src/contexts/translate/domain/content-translator.js";
import {
  type PluginComponentFile,
  PluginDistribution,
} from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { FileHash } from "../../../../../../src/kernel/file.js";
import { REPOSITORY_ROOT } from "../../../../../helpers/repository-root.js";

const PLUGINS_DIR = join(REPOSITORY_ROOT, "plugins");

/**
 * Two independent paths compute an OpenCode-flat skill path for the same plugin content.
 * The fixture's non-skill children under skills/ are what makes a drift between them visible.
 */

const PLUGIN_NAME = "aidd-telemetry";
const stubHasher = { hash: (_content: string) => new FileHash("a".repeat(32)) };

function skillFile(relativePath: string, content = "// stub"): PluginComponentFile {
  return { relativePath: `skills/${relativePath}`, content };
}

function makeTelemetryLikeDist(): PluginDistribution {
  const skills = [
    skillFile("shared/attribution.cjs"),
    skillFile("package.json", `{ "type": "commonjs" }`),
    skillFile("01-cost/SKILL.md", `---\nname: 01-cost\ndescription: Cost skill\n---\n\nBody.\n`),
    skillFile("01-cost/scripts/telemetry-report.cjs", `require("../../shared/attribution.cjs");`),
  ];
  return new PluginDistribution({
    manifest: { name: PLUGIN_NAME, version: "1.0.0" },
    format: "claude",
    files: skills,
    components: { commands: [], agents: [], rules: [], skills, hooks: [], mcp: [] },
  });
}

function modeBSkillPaths(dist: PluginDistribution): string[] {
  return new PluginContentTranslator(stubHasher)
    .translate(dist, opencode)
    .map((f) => f.relativePath)
    .filter((p) => p.startsWith(".opencode/skills/"))
    .sort();
}

function builtTreeSkillPaths(dist: PluginDistribution): string[] {
  const skillsArtifact = buildOpencodeFlatContract().artifacts.skills;
  if (!skillsArtifact.supported) throw new Error("opencode flat skills artifact unsupported");
  return dist.components.skills.map((f) => skillsArtifact.path(PLUGIN_NAME, f.relativePath)).sort();
}

describe("opencode flat skills — built-tree route agrees with mode-B install route", () => {
  it("produce the identical set of relative output paths for a plugin with non-skill children", () => {
    const dist = makeTelemetryLikeDist();

    const modeB = modeBSkillPaths(dist);
    const builtTree = builtTreeSkillPaths(dist);

    expect(builtTree).toEqual(modeB);
    expect(modeB).toEqual([
      ".opencode/skills/aidd-telemetry/01-cost/SKILL.md",
      ".opencode/skills/aidd-telemetry/01-cost/scripts/telemetry-report.cjs",
      ".opencode/skills/aidd-telemetry/package.json",
      ".opencode/skills/aidd-telemetry/shared/attribution.cjs",
    ]);
  });
});

// Nesting a skill under its plugin's own directory shortens its `name` to the leaf, so
// nothing stops two plugins shipping the same leaf any more. This does.
describe("skill names across plugins, now that the plugin prefix is a directory", () => {
  it("no two plugins ship a skill with the same leaf name", () => {
    const byLeaf = new Map<string, string[]>();
    for (const plugin of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
      if (!plugin.isDirectory()) continue;
      const skillsDir = join(PLUGINS_DIR, plugin.name, "skills");
      if (!existsSync(skillsDir)) continue;
      for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
        if (!skill.isDirectory()) continue;
        if (!existsSync(join(skillsDir, skill.name, "SKILL.md"))) continue;
        byLeaf.set(skill.name, [...(byLeaf.get(skill.name) ?? []), plugin.name]);
      }
    }

    const shared = [...byLeaf.entries()].filter(([, plugins]) => plugins.length > 1);
    expect(byLeaf.size).toBeGreaterThan(10);
    expect(shared.map(([leaf, plugins]) => `${leaf}: ${plugins.join(", ")}`)).toEqual([]);
  });
});
