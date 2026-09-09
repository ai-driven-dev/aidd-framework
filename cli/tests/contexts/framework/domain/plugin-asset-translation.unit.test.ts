import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPOSITORY_ROOT } from "../../../helpers/repository-root.js";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { claude } from "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { codex } from "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { copilot } from "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { cursor } from "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { opencode } from "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { getAiToolConfig } from "../../../../src/contexts/tools/domain/registry.js";
import { PluginContentTranslator } from "../../../../src/contexts/translate/domain/content-translator.js";
import { PluginDistribution } from "../../../../src/contexts/translate/domain/plugin-distribution.js";
import { FileHash } from "../../../../src/kernel/file.js";
import { AI_TOOL_IDS } from "../../../../src/kernel/tool.js";

/**
 * Prose — a skill, an agent, a rule — is translated: frontmatter converted, paths rewritten.
 * An artefact is carried byte for byte: a path rewritten inside a program no longer parses.
 */
function pluginFile(relativePath: string): string {
  return readFileSync(join(REPOSITORY_ROOT, "plugins", "aidd-telemetry", relativePath), "utf8");
}

const ARTEFACTS = [
  "hooks/journal.cjs",
  "hooks/journal.cjs",
  "hooks/lib/record.cjs",
  "hooks/lib/repo.cjs",
  "hooks/lib/file-writes.cjs",
  "hooks/lib/step-starts.cjs",
  "hooks/lib/host.cjs",
] as const;

describe("a plugin's executable files survive being installed", () => {
  for (const relativePath of ARTEFACTS) {
    it(`${relativePath} is not what any tool's own rewrite would make of it`, () => {
      const content = pluginFile(relativePath);
      const rewritten = AI_TOOL_IDS.map((tool) => getAiToolConfig(tool).rewriteContent(content));

      // The rewrite is the thing the translator must not apply to this file. Where a tool's
      // rewrite happens to leave it alone, that is luck; where it does not, this names it.
      const damagedBy = AI_TOOL_IDS.filter((_, index) => rewritten[index] !== content);
      expect(
        damagedBy.length === 0 || relativePath.endsWith(".js"),
        `${relativePath} is rewritten by ${damagedBy.join(", ")} and is not carried verbatim`
      ).toBe(true);
    });
  }
});

/** The decisive check: not "would a rewrite damage it", but "does installing the plugin
 * actually put it there, unchanged". The path is the fixture; the content is real bytes. */
describe("installing the plugin carries a skill's own script, on every tool", () => {
  const SCRIPT = "skills/02-check/scripts/example.cjs";
  const SCRIPT_CONTENT = pluginFile("hooks/journal.cjs");
  const translator = new PluginContentTranslator({ hash: () => new FileHash("a".repeat(32)) });

  function distributionOf(): PluginDistribution {
    const skills = [
      { relativePath: "skills/02-check/SKILL.md", content: pluginFile("skills/02-check/SKILL.md") },
      { relativePath: SCRIPT, content: SCRIPT_CONTENT },
    ];
    const hooks = [
      { relativePath: "hooks/hooks.json", content: pluginFile("hooks/hooks.json") },
      { relativePath: "hooks/journal.cjs", content: pluginFile("hooks/journal.cjs") },
    ];
    return new PluginDistribution({
      manifest: { name: "aidd-telemetry", version: "0.1.0" },
      format: "claude",
      files: [...skills, ...hooks],
      components: { skills, commands: [], agents: [], rules: [], hooks, mcp: [] },
    });
  }

  for (const tool of [claude, codex, copilot, cursor, opencode]) {
    it(`${tool.toolId} installs it byte for byte`, () => {
      const installed = translator
        .translate(distributionOf(), tool)
        .find((file) => file.relativePath.endsWith("02-check/scripts/example.cjs"));

      expect(installed, `${tool.toolId} drops the script entirely`).toBeDefined();
      expect(installed?.content).toBe(SCRIPT_CONTENT);
    });
  }

  it("still translates the prose beside it", () => {
    const installed = translator
      .translate(distributionOf(), claude)
      .find((file) => file.relativePath.endsWith("02-check/SKILL.md"));

    // Carrying artefacts verbatim must not turn every skill into an artefact: this one
    // still goes through the frontmatter conversion, so it is not byte-identical.
    expect(installed?.content).not.toBe(pluginFile("skills/02-check/SKILL.md"));
    expect(installed?.content).toContain("States what is in place");
  });

  /** A script whose text that tool's own rewrite really does change. Each tool rewrites its
   * own directory's paths, so a single shared sample would let three tools pass by luck. */
  function rewritableScript(directory: string): string {
    return `const p = "${directory}commands/01_plan/x";\nconst q = "@${directory}commands/02_do/y";\n`;
  }

  function distributionWithScript(content: string): PluginDistribution {
    const skills = [
      { relativePath: "skills/02-check/SKILL.md", content: pluginFile("skills/02-check/SKILL.md") },
      { relativePath: SCRIPT, content },
    ];
    return new PluginDistribution({
      manifest: { name: "aidd-telemetry", version: "0.1.0" },
      format: "claude",
      files: skills,
      components: { skills, commands: [], agents: [], rules: [], hooks: [], mcp: [] },
    });
  }

  for (const tool of [claude, codex, copilot, cursor, opencode]) {
    it(`${tool.toolId} leaves a script's own paths alone`, () => {
      // Paths this tool's own rewrite is built to touch, in a file that is not prose. That the
      // guard is not vacuous is asserted once, below, over every tool at once.
      const script = rewritableScript(tool.directory);

      const installed = translator
        .translate(distributionWithScript(script), tool)
        .find((file) => file.relativePath.endsWith("02-check/scripts/example.cjs"));

      expect(installed?.content).toBe(script);
    });
  }

  it("carries it verbatim on a flat install too, not just a native one", () => {
    // OpenCode installs flat: skills keep their sub-path but every file used to be rewritten
    // on the way. The script survives there only because that rewrite leaves it alone.
    const installed = translator
      .translate(distributionOf(), opencode)
      .find((file) => file.relativePath.endsWith("02-check/scripts/example.cjs"));

    expect(installed, "opencode drops the script entirely").toBeDefined();
    expect(installed?.content).toBe(SCRIPT_CONTENT);
  });
  it("guards against a rewrite that some tool really would apply", () => {
    // Without this, every assertion above could pass over content no rewrite touches, and
    // the guard would be protecting nothing while looking thorough.
    const rewritten = [claude, codex, copilot, cursor, opencode].filter((tool) => {
      const script = rewritableScript(tool.directory);
      return tool.rewriteContent(script) !== script;
    });

    expect(rewritten.length).toBeGreaterThan(0);
  });
});
