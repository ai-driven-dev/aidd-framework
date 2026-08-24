import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import { FileHash } from "../../../src/domain/models/file.js";
import { PluginContentTranslator } from "../../../src/domain/models/plugin-content-translator.js";
import { PluginDistribution } from "../../../src/domain/models/plugin-distribution.js";
import { AI_TOOL_IDS } from "../../../src/domain/models/tool-ids.js";
import { claude } from "../../../src/domain/tools/ai/claude.js";
import { codex } from "../../../src/domain/tools/ai/codex.js";
import { copilot } from "../../../src/domain/tools/ai/copilot.js";
import { cursor } from "../../../src/domain/tools/ai/cursor.js";
import { opencode } from "../../../src/domain/tools/ai/opencode.js";
import { getAiToolConfig } from "../../../src/domain/tools/registry.js";

/**
 * A plugin ships two kinds of file, and installing it must not confuse them.
 *
 * Prose — a skill, an agent, a rule — is translated: its frontmatter is converted to the
 * host tool's spelling and its paths are rewritten to the host tool's directories. An
 * artefact — a script a skill runs, a hook the host executes — is carried byte for byte,
 * because a path rewritten inside a program is a program that no longer parses.
 *
 * This is not hypothetical. Measured against the shipped measurement bundle, Codex's own
 * rewrite grew it by six bytes and Copilot's shrank it by one. Both would have shipped a
 * broken script, silently, on install.
 */
function pluginFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../plugins/aidd-telemetry/${relativePath}`, import.meta.url)),
    "utf8"
  );
}

const ARTEFACTS = [
  "skills/00-init/scripts/telemetry-switch.cjs",
  "skills/01-cost/scripts/telemetry-report.cjs",
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
      const rewritten = AI_TOOL_IDS.map((tool) =>
        getAiToolConfig(tool).rewriteContent(content, "aidd_docs")
      );

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
 * actually put it there, unchanged". Everything above is a guard; this is the proof. */
describe("installing the plugin carries its measurement script, on every tool", () => {
  const SCRIPT = "skills/01-cost/scripts/telemetry-report.cjs";
  const translator = new PluginContentTranslator({ hash: () => new FileHash("a".repeat(32)) });

  function distributionOf(): PluginDistribution {
    const skills = [
      { relativePath: "skills/01-cost/SKILL.md", content: pluginFile("skills/01-cost/SKILL.md") },
      { relativePath: SCRIPT, content: pluginFile(SCRIPT) },
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
        .translate(distributionOf(), tool, "aidd_docs")
        .find((file) => file.relativePath.endsWith("01-cost/scripts/telemetry-report.cjs"));

      expect(installed, `${tool.toolId} drops the script entirely`).toBeDefined();
      expect(installed?.content).toBe(pluginFile(SCRIPT));
    });
  }

  it("still translates the prose beside it", () => {
    const installed = translator
      .translate(distributionOf(), claude, "aidd_docs")
      .find((file) => file.relativePath.endsWith("01-cost/SKILL.md"));

    // Carrying artefacts verbatim must not turn every skill into an artefact: this one
    // still goes through the frontmatter conversion, so it is not byte-identical.
    expect(installed?.content).not.toBe(pluginFile("skills/01-cost/SKILL.md"));
    expect(installed?.content).toContain("Answers what a period or one task consumed");
  });

  /** A script whose text that tool's own rewrite really does change. Each tool rewrites
   * its own directory's paths, so the sample is built from `tool.directory` — a single
   * shared sample would trip two tools of five and let the other three pass by luck, which
   * is exactly what asserting on the shipped bundle alone already does. */
  function rewritableScript(directory: string): string {
    return `const p = "${directory}commands/01_plan/x";\nconst q = "@${directory}commands/02_do/y";\n`;
  }

  function distributionWithScript(content: string): PluginDistribution {
    const skills = [
      { relativePath: "skills/01-cost/SKILL.md", content: pluginFile("skills/01-cost/SKILL.md") },
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
      // Paths this tool's own rewrite is built to touch, in a file that is not prose.
      // Whether this particular tool's rewrite would change them varies; that the guard is
      // not vacuous is asserted once, below, over every tool at once.
      const script = rewritableScript(tool.directory);

      const installed = translator
        .translate(distributionWithScript(script), tool, "aidd_docs")
        .find((file) => file.relativePath.endsWith("01-cost/scripts/telemetry-report.cjs"));

      expect(installed?.content).toBe(script);
    });
  }

  it("carries it verbatim on a flat install too, not just a native one", () => {
    // OpenCode installs flat: skills keep their sub-path but every file used to be
    // rewritten on the way. The script survived there only because that tool's own rewrite
    // happens to leave it alone — luck, which this pins down.
    const installed = translator
      .translate(distributionOf(), opencode, "aidd_docs")
      .find((file) => file.relativePath.endsWith("01-cost/scripts/telemetry-report.cjs"));

    expect(installed, "opencode drops the script entirely").toBeDefined();
    expect(installed?.content).toBe(pluginFile(SCRIPT));
  });
  it("guards against a rewrite that some tool really would apply", () => {
    // Without this, every assertion above could pass over content no rewrite touches, and
    // the guard would be protecting nothing while looking thorough.
    const rewritten = [claude, codex, copilot, cursor, opencode].filter((tool) => {
      const script = rewritableScript(tool.directory);
      return tool.rewriteContent(script, "aidd_docs") !== script;
    });

    expect(rewritten.length).toBeGreaterThan(0);
  });
});
