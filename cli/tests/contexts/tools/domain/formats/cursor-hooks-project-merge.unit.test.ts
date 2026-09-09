import { describe, expect, it } from "vitest";
import {
  cursorProjectHooksScriptDir,
  cursorProjectHooksScriptPath,
  mergeCursorProjectHooksJson,
  unmergeCursorProjectHooksJson,
} from "../../../../../src/contexts/tools/domain/formats/cursor-hooks-project-merge.js";

// biome-ignore lint/suspicious/noTemplateCurlyInString: intentionally testing Claude hook placeholder substitution
const PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}";

function hooksJson(command: string): string {
  return JSON.stringify({
    hooks: { PostToolUse: [{ hooks: [{ type: "command", command }] }] },
  });
}

const PLUGIN_A_HOOKS = hooksJson(`node ${PLUGIN_ROOT_VAR}/hooks/journal.cjs`);
const PLUGIN_B_HOOKS = hooksJson(`node ${PLUGIN_ROOT_VAR}/hooks/journal.cjs`);

describe("mergeCursorProjectHooksJson — repeat install (Phase 7, Task 3)", () => {
  it("installing the same plugin twice leaves one copy of its commands, not two", () => {
    const { content: afterFirst } = mergeCursorProjectHooksJson(null, PLUGIN_A_HOOKS, "aidd-a");
    const { content: afterSecond } = mergeCursorProjectHooksJson(
      afterFirst,
      PLUGIN_A_HOOKS,
      "aidd-a"
    );

    const parsed = JSON.parse(afterSecond) as { hooks: Record<string, Array<{ command: string }>> };
    expect(parsed.hooks.postToolUse).toHaveLength(1);
    expect(parsed.hooks.postToolUse[0].command).toContain(
      cursorProjectHooksScriptPath("aidd-a", "hooks/journal.cjs")
    );
  });

  it("re-installing one plugin leaves every other plugin's entries untouched", () => {
    const { content: afterA } = mergeCursorProjectHooksJson(null, PLUGIN_A_HOOKS, "aidd-a");
    const { content: afterB } = mergeCursorProjectHooksJson(afterA, PLUGIN_B_HOOKS, "aidd-b");
    const { content: afterReinstallA } = mergeCursorProjectHooksJson(
      afterB,
      PLUGIN_A_HOOKS,
      "aidd-a"
    );

    const parsed = JSON.parse(afterReinstallA) as {
      hooks: Record<string, Array<{ command: string }>>;
    };
    const commands = parsed.hooks.postToolUse.map((e) => e.command);
    expect(commands).toHaveLength(2);
    expect(commands.some((c) => c.includes("/aidd-a/"))).toBe(true);
    expect(commands.some((c) => c.includes("/aidd-b/"))).toBe(true);
  });
});

describe("unmergeCursorProjectHooksJson (Phase 7, Task 3)", () => {
  it("removes one plugin's entries, leaving every other plugin's untouched", () => {
    const { content: afterA } = mergeCursorProjectHooksJson(null, PLUGIN_A_HOOKS, "aidd-a");
    const { content: afterB } = mergeCursorProjectHooksJson(afterA, PLUGIN_B_HOOKS, "aidd-b");

    const unmerged = unmergeCursorProjectHooksJson(afterB, "aidd-a");

    const parsed = JSON.parse(unmerged) as { hooks: Record<string, Array<{ command: string }>> };
    const commands = parsed.hooks.postToolUse.map((e) => e.command);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("/aidd-b/");
  });

  it("drops an event key entirely once its last entry is removed", () => {
    const { content: afterA } = mergeCursorProjectHooksJson(null, PLUGIN_A_HOOKS, "aidd-a");

    const unmerged = unmergeCursorProjectHooksJson(afterA, "aidd-a");

    const parsed = JSON.parse(unmerged) as { hooks: Record<string, unknown> };
    expect(parsed.hooks).not.toHaveProperty("postToolUse");
  });
});

describe("cursorProjectHooksScriptDir", () => {
  it("names the directory a plugin's copied scripts live under", () => {
    expect(cursorProjectHooksScriptDir("aidd-telemetry")).toBe(".cursor/hooks/aidd-telemetry/");
  });
});

describe("rewriting a plugin's root token for the project hooks file", () => {
  it("relocates a command under hooks/ to the plugin's own script directory", () => {
    const { content } = mergeCursorProjectHooksJson(null, PLUGIN_A_HOOKS, "plugin-a");

    expect(JSON.parse(content)).toStrictEqual({
      version: 1,
      hooks: { postToolUse: [{ command: "node ./.cursor/hooks/plugin-a/journal.cjs" }] },
    });
  });

  it("leaves a plugin-relative path outside hooks/ where it was", () => {
    const { content } = mergeCursorProjectHooksJson(
      null,
      hooksJson(`node ${PLUGIN_ROOT_VAR}/scripts/run.cjs`),
      "plugin-a"
    );

    expect(JSON.parse(content)).toStrictEqual({
      version: 1,
      hooks: { postToolUse: [{ command: "node scripts/run.cjs" }] },
    });
  });

  it("names where a hook script lands, with or without its hooks/ prefix", () => {
    expect(cursorProjectHooksScriptPath("plugin-a", "hooks/journal.cjs")).toBe(
      ".cursor/hooks/plugin-a/journal.cjs"
    );
    expect(cursorProjectHooksScriptPath("plugin-a", "lib/x.cjs")).toBe(
      ".cursor/hooks/plugin-a/lib/x.cjs"
    );
  });
});
