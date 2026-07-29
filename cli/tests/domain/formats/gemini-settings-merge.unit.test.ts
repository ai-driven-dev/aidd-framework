import { describe, expect, it } from "vitest";
import {
  GEMINI_HOOK_EVENT_MAP,
  mergeGeminiSettingsHooks,
  mergeGeminiSettingsSeed,
} from "../../../src/domain/formats/gemini-settings-merge.js";

// ── mergeGeminiSettingsHooks ──────────────────────────────────────────────────

describe("mergeGeminiSettingsHooks", () => {
  it("merges plugin hooks into an empty settings.json, translating the event name", () => {
    const plugin = JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "node ./.gemini/hooks/plugin/run.js" }] },
        ],
      },
    });
    const { content, warnings } = mergeGeminiSettingsHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown[]> };
    expect(result.hooks.SessionStart).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("translates UserPromptSubmit to BeforeAgent", () => {
    const plugin = JSON.stringify({
      hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: "prompt.js" }] }] },
    });
    const { content } = mergeGeminiSettingsHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown[]> };
    expect(result.hooks.BeforeAgent).toHaveLength(1);
    expect(result.hooks.UserPromptSubmit).toBeUndefined();
  });

  it("preserves existing settings keys (mcpServers, context) when merging hooks", () => {
    const existing = JSON.stringify({
      mcpServers: { "plugin-server": { command: "node", args: ["server.js"] } },
      context: { fileName: ["AGENTS.md"] },
    });
    const plugin = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "run.js" }] }] },
    });
    const { content } = mergeGeminiSettingsHooks(existing, plugin);
    const result = JSON.parse(content) as Record<string, unknown>;
    expect(result.mcpServers).toBeDefined();
    expect(result.context).toEqual({ fileName: ["AGENTS.md"] });
    expect(result.hooks).toBeDefined();
  });

  it("additively appends hooks from a second plugin without overwriting", () => {
    const plugin1 = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "first.js" }] }] },
    });
    const { content: after1 } = mergeGeminiSettingsHooks(null, plugin1);

    const plugin2 = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "second.js" }] }] },
    });
    const { content: after2 } = mergeGeminiSettingsHooks(after1, plugin2);
    const result = JSON.parse(after2) as { hooks: { SessionStart: unknown[] } };
    expect(result.hooks.SessionStart).toHaveLength(2);
  });

  it("warns and drops an unmapped Claude hook event rather than writing an invalid name", () => {
    const plugin = JSON.stringify({
      hooks: { PreCompact: [{ hooks: [{ type: "command", command: "compact.js" }] }] },
    });
    const { content, warnings } = mergeGeminiSettingsHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown> };
    expect(result.hooks.PreCompress).toBeDefined();
    expect(warnings).toEqual([]);
  });

  it("warns and drops a truly unmapped event (not in GEMINI_HOOK_EVENT_MAP)", () => {
    const plugin = JSON.stringify({
      hooks: { SomeFutureClaudeEvent: [{ hooks: [{ type: "command", command: "x.js" }] }] },
    });
    const { content, warnings } = mergeGeminiSettingsHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: Record<string, unknown> };
    expect(result.hooks.SomeFutureClaudeEvent).toBeUndefined();
    expect(warnings).toEqual(["gemini: unmapped hook event 'SomeFutureClaudeEvent' skipped"]);
  });

  it("preserves the matcher field when present", () => {
    const plugin = JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "guard.js" }] }],
      },
    });
    const { content } = mergeGeminiSettingsHooks(null, plugin);
    const result = JSON.parse(content) as { hooks: { BeforeTool: Array<{ matcher?: string }> } };
    expect(result.hooks.BeforeTool[0]?.matcher).toBe("Edit");
  });

  it("maps every event AIDD ships today (SessionStart, UserPromptSubmit)", () => {
    expect(GEMINI_HOOK_EVENT_MAP.SessionStart).toBe("SessionStart");
    expect(GEMINI_HOOK_EVENT_MAP.UserPromptSubmit).toBe("BeforeAgent");
  });
});

// ── mergeGeminiSettingsSeed ────────────────────────────────────────────────────

describe("mergeGeminiSettingsSeed", () => {
  const seed = JSON.stringify({ context: { fileName: ["AGENTS.md"] } });

  it("seeds context.fileName into an empty file", () => {
    const content = mergeGeminiSettingsSeed("", seed);
    const result = JSON.parse(content) as { context: { fileName: string[] } };
    expect(result.context.fileName).toEqual(["AGENTS.md"]);
  });

  it("merging twice produces identical bytes (idempotent)", () => {
    const once = mergeGeminiSettingsSeed("", seed);
    const twice = mergeGeminiSettingsSeed(once, seed);
    expect(twice).toBe(once);
  });

  it("a pre-existing user context.fileName array retains its entries and gains AGENTS.md", () => {
    const existing = JSON.stringify({ context: { fileName: ["CUSTOM.md", "OTHER.md"] } });
    const content = mergeGeminiSettingsSeed(existing, seed);
    const result = JSON.parse(content) as { context: { fileName: string[] } };
    expect(result.context.fileName).toEqual(["CUSTOM.md", "OTHER.md", "AGENTS.md"]);
  });

  it("a pre-existing user context.fileName string is normalized into the union", () => {
    const existing = JSON.stringify({ context: { fileName: "CUSTOM.md" } });
    const content = mergeGeminiSettingsSeed(existing, seed);
    const result = JSON.parse(content) as { context: { fileName: string[] } };
    expect(result.context.fileName).toEqual(["CUSTOM.md", "AGENTS.md"]);
  });

  it("a user-authored unrelated top-level key survives the merge", () => {
    const existing = JSON.stringify({ security: { folderTrust: { enabled: false } } });
    const content = mergeGeminiSettingsSeed(existing, seed);
    const result = JSON.parse(content) as Record<string, unknown>;
    expect(result.security).toEqual({ folderTrust: { enabled: false } });
    expect((result.context as { fileName: string[] }).fileName).toEqual(["AGENTS.md"]);
  });

  it("mcpServers and hooks written by earlier merges survive the seed step", () => {
    const existing = JSON.stringify({
      mcpServers: { "plugin-server": { command: "node" } },
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "run.js" }] }] },
    });
    const content = mergeGeminiSettingsSeed(existing, seed);
    const result = JSON.parse(content) as Record<string, unknown>;
    expect(result.mcpServers).toBeDefined();
    expect(result.hooks).toBeDefined();
  });
});
