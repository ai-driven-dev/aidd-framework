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

/** The only place a tool identifier is allowed to be written down: its own profile directory. */
const ALLOWED_DIRS = TOOL_IDS.map((id) => `src/contexts/tools/domain/profiles/${id}/`);
const ALLOWED_FILES = new Set(["src/kernel/tool.ts"]);

/**
 * Files naming a tool outside its profile today. This list may only shrink.
 *
 * `built-tree-materialization-translator.ts` left it in phase 6: it chose the framework
 * build mode with `toolId === "opencode" ? ... `, and now reads that mode off the profile.
 * `tool-contracts.ts` left it in phase 10: its nine per-tool build contracts moved into
 * each tool's own profile directory, one `build.ts` per tool.
 */
const BASELINE = [
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

/** The rule itself, over an explicit file/source pair instead of the real tree. */
function namesToolOutsideProfile(file: string, source: string): boolean {
  if (ALLOWED_FILES.has(file) || ALLOWED_DIRS.some((dir) => file.startsWith(dir))) return false;
  return TOOL_IDS.some((id) => source.includes(`"${id}"`));
}

describe("adding a tool costs one file", () => {
  it("no tool identifier is written outside its own profile", () => {
    const violations = sourceFiles().filter((file) => namesToolOutsideProfile(file, read(file)));

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "tool named outside its profile — read it from the profile instead").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("flags a tool name outside its profile and clears one inside it", () => {
    expect(namesToolOutsideProfile("src/domain/models/framework.ts", 'if (id === "cursor")')).toBe(
      true
    );
    expect(
      namesToolOutsideProfile(
        "src/contexts/tools/domain/profiles/cursor/profile.ts",
        'id: "cursor"'
      )
    ).toBe(false);
  });
});
