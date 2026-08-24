import { describe, expect, it } from "vitest";
import {
  flattenCopilotHooksShape,
  mergeClaudeSettingsHooks,
  mergeCodexFrameworkHooksJson,
  mergeCursorFlatHooks,
} from "../../../src/domain/formats/flat-hooks-merge.js";

// ── mergeClaudeSettingsHooks ──────────────────────────────────────────────────

describe("mergeClaudeSettingsHooks", () => {
  it("merges plugin hooks into empty settings.json", () => {
    const plugin = JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "node ./.claude/hooks/plugin/run.js" }] },
        ],
      },
    });
    const { content } = mergeClaudeSettingsHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown[]> };
    expect(result.hooks.SessionStart).toHaveLength(1);
  });

  it("preserves existing settings keys when merging hooks", () => {
    const existing = JSON.stringify({ model: "claude-opus-4-5", theme: "dark" });
    const plugin = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "run.js" }] }] },
    });
    const { content } = mergeClaudeSettingsHooks(existing, plugin);
    const result = JSON.parse(content) as Record<string, unknown>;
    expect(result.model).toBe("claude-opus-4-5");
    expect(result.theme).toBe("dark");
    expect(result.hooks).toBeDefined();
  });

  it("additively appends hooks from a second plugin without overwriting", () => {
    const plugin1 = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "first.js" }] }] },
    });
    const { content: after1 } = mergeClaudeSettingsHooks(null, plugin1);

    const plugin2 = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "second.js" }] }] },
    });
    const { content: after2 } = mergeClaudeSettingsHooks(after1, plugin2);
    const result = JSON.parse(after2) as { hooks: { SessionStart: unknown[] } };
    expect(result.hooks.SessionStart).toHaveLength(2);
  });

  it("merges two different events independently", () => {
    const plugin = JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "start.js" }] }],
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "prompt.js" }] }],
      },
    });
    const { content } = mergeClaudeSettingsHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown[]> };
    expect(result.hooks.SessionStart).toHaveLength(1);
    expect(result.hooks.UserPromptSubmit).toHaveLength(1);
  });

  it("returns empty warnings array", () => {
    const plugin = JSON.stringify({ hooks: {} });
    const { warnings } = mergeClaudeSettingsHooks(null, plugin);
    expect(warnings).toEqual([]);
  });

  it("does not create hooks key when plugin has no hook events", () => {
    const plugin = JSON.stringify({ hooks: {} });
    const { content } = mergeClaudeSettingsHooks(null, plugin);
    const result = JSON.parse(content) as Record<string, unknown>;
    expect(result.hooks).toEqual({});
  });
});

// ── flattenCopilotHooksShape ──────────────────────────────────────────────────

describe("flattenCopilotHooksShape", () => {
  it("flattens nested Claude matcher-group to flat entries", () => {
    const input = JSON.stringify({
      hooks: {
        PreToolUse: [{ hooks: [{ type: "command", command: "./.github/hooks/plugin/check.sh" }] }],
      },
    });
    const result = JSON.parse(flattenCopilotHooksShape(input)) as {
      version: number;
      hooks: { PreToolUse: Array<{ type: string; command: string }> };
    };
    expect(result.version).toBe(1);
    expect(result.hooks.PreToolUse).toHaveLength(1);
    expect(result.hooks.PreToolUse[0].type).toBe("command");
    expect(result.hooks.PreToolUse[0].command).toBe("./.github/hooks/plugin/check.sh");
  });

  it("drops the matcher field (not in Copilot flat shape)", () => {
    const input = JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: "some-matcher", hooks: [{ type: "command", command: "run.sh" }] }],
      },
    });
    const result = JSON.parse(flattenCopilotHooksShape(input)) as {
      hooks: { PreToolUse: Array<Record<string, unknown>> };
    };
    expect(result.hooks.PreToolUse[0]).not.toHaveProperty("matcher");
  });

  it("preserves timeout when present", () => {
    const input = JSON.stringify({
      hooks: {
        PreToolUse: [{ hooks: [{ type: "command", command: "run.sh", timeout: 30 }] }],
      },
    });
    const result = JSON.parse(flattenCopilotHooksShape(input)) as {
      hooks: { PreToolUse: Array<{ timeout?: number }> };
    };
    expect(result.hooks.PreToolUse[0].timeout).toBe(30);
  });

  it("preserves PascalCase event names", () => {
    const input = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "run.js" }] }] },
    });
    const result = JSON.parse(flattenCopilotHooksShape(input)) as {
      hooks: Record<string, unknown>;
    };
    expect(result.hooks).toHaveProperty("SessionStart");
    expect(result.hooks).not.toHaveProperty("sessionStart");
  });

  it("returns empty hooks when input has no events", () => {
    const input = JSON.stringify({ hooks: {} });
    const result = JSON.parse(flattenCopilotHooksShape(input)) as Record<string, unknown>;
    expect(result).toEqual({ version: 1 });
  });
});

// ── mergeCursorFlatHooks ──────────────────────────────────────────────────────

describe("mergeCursorFlatHooks", () => {
  it("maps SessionStart → sessionStart", () => {
    const plugin = JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "node ./.cursor/hooks/plugin/run.js" }] },
        ],
      },
    });
    const { content } = mergeCursorFlatHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown> };
    expect(result.hooks).toHaveProperty("sessionStart");
    expect(result.hooks).not.toHaveProperty("SessionStart");
  });

  it("maps UserPromptSubmit → beforeSubmitPrompt", () => {
    const plugin = JSON.stringify({
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: "node ./.cursor/hooks/plugin/prompt.js" }] },
        ],
      },
    });
    const { content } = mergeCursorFlatHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown> };
    expect(result.hooks).toHaveProperty("beforeSubmitPrompt");
  });

  // #680: the only reason a Cursor session closes a turn headlessly. Measured 2026-08-22:
  // an interactive session fires `stop` and a headless one fires `sessionEnd` instead,
  // never both from one run - so subscribing to `stop` alone journals nothing headless,
  // in silence. This test fails if either name stops being emitted.
  it("maps Stop → both stop and sessionEnd, because Cursor fires one or the other", () => {
    const command = "node ./.cursor/hooks/plugin/turn-end.js";
    const plugin = JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: "command", command }] }] },
    });
    const { content } = mergeCursorFlatHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown[]> };

    expect(Object.keys(result.hooks).sort()).toEqual(["sessionEnd", "stop"]);
    expect(result.hooks).not.toHaveProperty("Stop");
    // Both must carry the same command: a turn closed either way journals the same line.
    expect(JSON.stringify(result.hooks.sessionEnd)).toBe(JSON.stringify(result.hooks.stop));
    expect(JSON.stringify(result.hooks.stop)).toContain(command);
  });

  it("emits version:1 wrapper", () => {
    const plugin = JSON.stringify({ hooks: {} });
    const { content } = mergeCursorFlatHooks(null, plugin);
    const result = JSON.parse(content) as { version: number };
    expect(result.version).toBe(1);
  });

  it("produces flat {command} entries (no type, no nested hooks)", () => {
    const plugin = JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "node run.js" }] }],
      },
    });
    const { content } = mergeCursorFlatHooks(null, plugin);
    const result = JSON.parse(content) as {
      hooks: { sessionStart: Array<Record<string, unknown>> };
    };
    const entry = result.hooks.sessionStart[0];
    expect(entry).toHaveProperty("command");
    expect(entry).not.toHaveProperty("type");
    expect(entry).not.toHaveProperty("hooks");
  });

  it("maps the common tool lifecycle events", () => {
    const plugin = JSON.stringify({
      hooks: {
        PreToolUse: [{ hooks: [{ type: "command", command: "pre.sh" }] }],
        PostToolUse: [{ hooks: [{ type: "command", command: "post.sh" }] }],
        Stop: [{ hooks: [{ type: "command", command: "stop.sh" }] }],
        SubagentStop: [{ hooks: [{ type: "command", command: "subagent-stop.sh" }] }],
      },
    });
    const { content, warnings } = mergeCursorFlatHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, Array<{ command: string }>> };
    expect(result.hooks.preToolUse[0].command).toBe("pre.sh");
    expect(result.hooks.postToolUse[0].command).toBe("post.sh");
    expect(result.hooks.stop[0].command).toBe("stop.sh");
    expect(result.hooks.subagentStop[0].command).toBe("subagent-stop.sh");
    expect(warnings).toEqual([]);
  });

  it("warns and skips an unsupported source event", () => {
    const plugin = JSON.stringify({
      hooks: { UnknownEvent: [{ hooks: [{ type: "command", command: "run.sh" }] }] },
    });
    const { content, warnings } = mergeCursorFlatHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown> };
    expect(Object.keys(result.hooks)).toHaveLength(0);
    expect(warnings.some((w) => w.includes("UnknownEvent"))).toBe(true);
  });

  it("accumulates both plugins into a single file", () => {
    const plugin1 = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "first.js" }] }] },
    });
    const { content: after1 } = mergeCursorFlatHooks(null, plugin1);

    const plugin2 = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "second.js" }] }] },
    });
    const { content: after2 } = mergeCursorFlatHooks(after1, plugin2);
    const result = JSON.parse(after2) as { hooks: { sessionStart: unknown[] } };
    expect(result.hooks.sessionStart).toHaveLength(2);
  });

  it("preserves existing entries from a previous cursor hooks.json", () => {
    const existing = JSON.stringify({
      version: 1,
      hooks: { sessionStart: [{ command: "existing.js" }] },
    });
    const plugin = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "new.js" }] }] },
    });
    const { content } = mergeCursorFlatHooks(existing, plugin);
    const result = JSON.parse(content) as { hooks: { sessionStart: unknown[] } };
    expect(result.hooks.sessionStart).toHaveLength(2);
  });
});

// ── mergeCodexFrameworkHooksJson ──────────────────────────────────────────────

describe("mergeCodexFrameworkHooksJson", () => {
  // #707: Codex has no `Stop` event. Its vocabulary, read out of the 0.149.0 binary and
  // confirmed by a live `codex exec` run with all four subscribed, is SessionStart /
  // SessionEnd / PostToolUse / PreToolUse and friends - SessionStart and SessionEnd fired,
  // Stop never did. Subscribing to Stop alone journals a session_start with nothing after
  // it, in silence. This test fails if that mapping is dropped.
  it("maps Stop to SessionEnd, the event Codex actually delivers", () => {
    // Split literal, the same way claude-root-path-rewrite.ts writes one: biome's
    // noTemplateCurlyInString cannot tell a plugin-root token from a botched template.
    const command = `node $${"{PLUGIN_ROOT}"}/hooks/journal.cjs turn-end`;
    const plugin = JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: "command", command }] }] },
    });
    const { content } = mergeCodexFrameworkHooksJson(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown[]> };

    expect(Object.keys(result.hooks)).toEqual(["SessionEnd"]);
    expect(result.hooks).not.toHaveProperty("Stop");
    expect(JSON.stringify(result.hooks.SessionEnd)).toContain(command);
  });

  it("leaves the events Codex does share with Claude under their own names", () => {
    const plugin = JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "node a.js session-start" }] }],
        PostToolUse: [{ hooks: [{ type: "command", command: "node a.js tool-used" }] }],
      },
    });
    const { content } = mergeCodexFrameworkHooksJson(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown[]> };

    expect(Object.keys(result.hooks).sort()).toEqual(["PostToolUse", "SessionStart"]);
  });

  it("emits top-level hooks wrapper", () => {
    const plugin = JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "node ./.codex/hooks/plugin/run.js" }] },
        ],
      },
    });
    const { content } = mergeCodexFrameworkHooksJson(null, plugin);
    const result = JSON.parse(content) as Record<string, unknown>;
    expect(result).toHaveProperty("hooks");
  });

  it("does NOT emit the install-mode memory hook command", () => {
    const plugin = JSON.stringify({ hooks: {} });
    const { content } = mergeCodexFrameworkHooksJson(null, plugin);
    expect(content).not.toContain("update_memory.cjs");
    expect(content).not.toContain(".aidd/scripts");
  });

  it("merges plugin hooks into codex nested shape", () => {
    const plugin = JSON.stringify({
      hooks: {
        SessionStart: [
          {
            hooks: [{ type: "command", command: "node ./.codex/hooks/plugin/run.js", timeout: 30 }],
          },
        ],
      },
    });
    const { content } = mergeCodexFrameworkHooksJson(null, plugin);
    const result = JSON.parse(content) as {
      hooks: {
        SessionStart: Array<{ hooks: Array<{ type: string; command: string; timeout?: number }> }>;
      };
    };
    const hookItem = result.hooks.SessionStart[0].hooks[0];
    expect(hookItem.type).toBe("command");
    expect(hookItem.command).toBe("node ./.codex/hooks/plugin/run.js");
    expect(hookItem.timeout).toBe(30);
  });

  it("accumulates both plugins preserving existing entries", () => {
    const plugin1 = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "first.js" }] }] },
    });
    const { content: after1 } = mergeCodexFrameworkHooksJson(null, plugin1);

    const plugin2 = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "second.js" }] }] },
    });
    const { content: after2 } = mergeCodexFrameworkHooksJson(after1, plugin2);
    const result = JSON.parse(after2) as { hooks: { SessionStart: unknown[] } };
    expect(result.hooks.SessionStart).toHaveLength(2);
  });

  it("returns empty warnings array", () => {
    const plugin = JSON.stringify({ hooks: {} });
    const { warnings } = mergeCodexFrameworkHooksJson(null, plugin);
    expect(warnings).toEqual([]);
  });

  it("preserves matcher when present in plugin hooks", () => {
    const plugin = JSON.stringify({
      hooks: {
        SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "run.js" }] }],
      },
    });
    const { content } = mergeCodexFrameworkHooksJson(null, plugin);
    const result = JSON.parse(content) as {
      hooks: { SessionStart: Array<{ matcher?: string }> };
    };
    expect(result.hooks.SessionStart[0].matcher).toBe("startup");
  });
});
