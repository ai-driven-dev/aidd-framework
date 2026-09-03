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
 * Phase 10 brought it from seven entries to three by moving what was tool data into the
 * profiles: the nine per-tool build contracts became one `build.ts` per tool, the
 * target/mode pairs and the plugin-manifest locations are now read off the profiles
 * instead of being listed twice, `FrameworkBuildTarget` and `PluginFormat` are aliases
 * of `AiToolId` rather than three unions with the same members, and restore names its
 * config artifacts through their constants.
 *
 * What is left is named tool by tool, because each is a different reason and only one of
 * them is debt:
 *
 * - `tool-recommendations.ts` recommends tools to a user by name. There is no profile to
 *   read this off: the knowledge is which tool suits which stack, which belongs to
 *   nobody's profile. A sixth tool is welcome to appear in no recommendation at all.
 * - `config-refs.ts` declares `CONFIG_OPENCODE = "opencode"`, the name of a config
 *   artifact, not of a tool. It happens to be spelled like one because the artifact is
 *   that tool's config file; opencode's profile is what says it consumes it.
 * - `capabilities/plugins-capability.ts` types `NativeActivation.binary` as the three CLIs this repo
 *   has measured and written activators for. It is an allowlist on purpose: a fourth
 *   tool driving its own CLI needs an activator registered against that binary anyway,
 *   so widening the type would move the cost rather than remove it.
 */
const BASELINE = [
  "src/contexts/framework/domain/tool-recommendations.ts",
  "src/contexts/tools/domain/capabilities/config-refs.ts",
  "src/contexts/tools/domain/capabilities/plugins-capability.ts",
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
