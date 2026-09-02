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
 *
 * Phase 11 relocated four of these without touching their content: `cursor-hooks.ts`,
 * `framework-build.ts` and `plugin-format.ts` moved into `translate` under new names
 * (`build-target.ts` for the latter); the `CONFIG_OPENCODE` constant that made
 * `framework.ts` match moved into `tools`' `config-refs.ts`, so `framework.ts` itself
 * (now `canon.ts`) no longer does.
 */
const BASELINE = [
  "src/contexts/framework/application/flows/marketplace-sync-settings-use-case.ts",
  "src/contexts/framework/application/restore/restore-use-case.ts",
  "src/contexts/tools/domain/capabilities/config-refs.ts",
  "src/contexts/translate/domain/build-target.ts",
  "src/contexts/translate/domain/plugin-format.ts",
  "src/contexts/tools/domain/plugins-capability.ts",
  "src/contexts/framework/domain/manifest.ts",
  "src/contexts/framework/domain/tool-recommendations.ts",
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
