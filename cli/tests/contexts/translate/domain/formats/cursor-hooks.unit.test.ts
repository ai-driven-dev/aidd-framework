import { describe, expect, it } from "vitest";
import { convertClaudeHooksToCursorPlugin } from "../../../../../src/contexts/translate/domain/formats/cursor-hooks.js";

describe("convertClaudeHooksToCursorPlugin", () => {
  it("converts PascalCase event to camelCase", () => {
    const input = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node run.js" }] }] },
    });
    const result = JSON.parse(convertClaudeHooksToCursorPlugin(input)) as {
      hooks: Record<string, unknown>;
    };
    expect(result.hooks).toHaveProperty("sessionStart");
    expect(result.hooks).not.toHaveProperty("SessionStart");
  });

  it("flattens inner hooks array wrapper", () => {
    const input = JSON.stringify({
      hooks: {
        SessionStart: [
          {
            hooks: [
              { type: "command", command: "a.sh" },
              { type: "command", command: "b.sh" },
            ],
          },
        ],
      },
    });
    const result = JSON.parse(convertClaudeHooksToCursorPlugin(input)) as {
      hooks: { sessionStart: unknown[] };
    };
    expect(result.hooks.sessionStart).toHaveLength(2);
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional placeholder literal in test data
  it("replaces ${CLAUDE_PLUGIN_ROOT}/ with ./", () => {
    const input = JSON.stringify({
      hooks: {
        SessionStart: [
          // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional placeholder literal in test data
          { hooks: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/update.js" }] },
        ],
      },
    });
    const result = JSON.parse(convertClaudeHooksToCursorPlugin(input)) as {
      hooks: { sessionStart: Array<{ command: string }> };
    };
    expect(result.hooks.sessionStart[0].command).toBe("node ./hooks/update.js");
  });

  it("omits events with no items", () => {
    const input = JSON.stringify({ hooks: { SessionStart: [{ hooks: [] }] } });
    const result = JSON.parse(convertClaudeHooksToCursorPlugin(input)) as {
      hooks: Record<string, unknown>;
    };
    expect(Object.keys(result.hooks)).toHaveLength(0);
  });

  it("handles missing hooks object gracefully", () => {
    const input = JSON.stringify({});
    const result = JSON.parse(convertClaudeHooksToCursorPlugin(input)) as {
      hooks: Record<string, unknown>;
    };
    expect(result.hooks).toEqual({});
  });
});
