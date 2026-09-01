/**
 * Adding a tool must cost one file.
 *
 * A tool identifier may only appear in that tool's own profile and in the shared
 * vocabulary. Everywhere else, the behaviour must be read from the profile rather
 * than branched on the name — otherwise a sixth tool means editing N files again.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, read, sourceFiles } from "./helpers.js";

const TOOL_IDS = ["claude", "cursor", "copilot", "codex", "opencode", "vscode"] as const;

/** The only places a tool identifier is allowed to be written down. */
const ALLOWED = new Set([
  ...TOOL_IDS.map((id) => `src/domain/tools/ai/${id}.ts`),
  ...TOOL_IDS.map((id) => `src/domain/tools/ide/${id}.ts`),
  "src/kernel/tool.ts",
]);

/**
 * Files naming a tool outside its profile today. This list may only shrink.
 *
 * `built-tree-materialization-translator.ts` left it in phase 6: it chose the framework
 * build mode with `toolId === "opencode" ? ... `, and now reads that mode off the profile.
 */
const BASELINE = [
  "src/application/use-cases/framework/strategies/tool-contracts.ts",
  "src/application/use-cases/flows/marketplace-sync-settings-use-case.ts",
  "src/application/use-cases/restore/restore-use-case.ts",
  "src/domain/capabilities/plugins-capability.ts",
  "src/domain/formats/cursor-hooks.ts",
  "src/domain/models/framework-build.ts",
  "src/domain/models/framework.ts",
  "src/domain/models/manifest.ts",
  "src/domain/models/plugin-format.ts",
  "src/domain/models/tool-recommendations.ts",
];

describe("adding a tool costs one file", () => {
  it("no tool identifier is written outside its own profile", () => {
    const violations = sourceFiles()
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => {
        const source = read(file);
        return TOOL_IDS.some((id) => source.includes(`"${id}"`));
      });

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "tool named outside its profile — read it from the profile instead").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });
});
