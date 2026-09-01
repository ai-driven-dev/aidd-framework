import { describe, expect, it } from "vitest";
import { rewriteClaudeRootInJson } from "../../../../../src/contexts/translate/domain/formats/claude-root-path-rewrite.js";

// Written as split literals to avoid biome's noTemplateCurlyInString warning.
const CLAUDE_ROOT = "$" + "{CLAUDE_PLUGIN_ROOT}";
const SCRIPTS_PATH = `${CLAUDE_ROOT}/scripts/check.sh`;
const BIN_PATH = `${CLAUDE_ROOT}/bin/server.js`;
const RELATIVE_SCRIPTS = "./scripts/check.sh";
const RELATIVE_BIN = "./bin/server.js";

describe("rewriteClaudeRootInJson", () => {
  describe("string leaf rewrite", () => {
    it("rewrites CLAUDE_PLUGIN_ROOT prefix in a plain string", () => {
      expect(rewriteClaudeRootInJson(SCRIPTS_PATH)).toBe(RELATIVE_SCRIPTS);
    });

    it("rewrites multiple occurrences in the same string", () => {
      const input = `${CLAUDE_ROOT}/a.sh and ${CLAUDE_ROOT}/b.sh`;
      expect(rewriteClaudeRootInJson(input)).toBe("./a.sh and ./b.sh");
    });

    it("passes through strings without the prefix", () => {
      expect(rewriteClaudeRootInJson("node ./server.js")).toBe("node ./server.js");
    });

    it("passes through empty string", () => {
      expect(rewriteClaudeRootInJson("")).toBe("");
    });
  });

  describe("array recursion", () => {
    it("rewrites CLAUDE_PLUGIN_ROOT in args array entries", () => {
      const input = [SCRIPTS_PATH, "--flag", BIN_PATH];
      expect(rewriteClaudeRootInJson(input)).toEqual([RELATIVE_SCRIPTS, "--flag", RELATIVE_BIN]);
    });

    it("passes through array entries without the prefix", () => {
      const input = ["--verbose", "--config", "foo.json"];
      expect(rewriteClaudeRootInJson(input)).toEqual(input);
    });
  });

  describe("object recursion", () => {
    it("rewrites string values inside a flat object", () => {
      const input = { command: SCRIPTS_PATH, cwd: "." };
      expect(rewriteClaudeRootInJson(input)).toEqual({ command: RELATIVE_SCRIPTS, cwd: "." });
    });

    it("rewrites values in nested env object", () => {
      const input = { env: { PATH: BIN_PATH } };
      expect(rewriteClaudeRootInJson(input)).toEqual({ env: { PATH: RELATIVE_BIN } });
    });

    it("does NOT rewrite object keys that contain the variable", () => {
      const input: Record<string, unknown> = {};
      input[SCRIPTS_PATH] = "value";
      const result = rewriteClaudeRootInJson(input) as Record<string, unknown>;
      expect(Object.keys(result)).toContain(SCRIPTS_PATH);
      expect(Object.values(result)).toContain("value");
    });
  });

  describe("non-string leaf pass-through", () => {
    it("passes through numbers", () => {
      expect(rewriteClaudeRootInJson(42)).toBe(42);
    });

    it("passes through booleans", () => {
      expect(rewriteClaudeRootInJson(true)).toBe(true);
    });

    it("passes through null", () => {
      expect(rewriteClaudeRootInJson(null)).toBeNull();
    });
  });

  describe("hooks.json shape", () => {
    it("rewrites a full hooks.json-like structure", () => {
      const input = {
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: SCRIPTS_PATH }] }],
        },
      };
      const expected = {
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: RELATIVE_SCRIPTS }] }],
        },
      };
      expect(rewriteClaudeRootInJson(input)).toEqual(expected);
    });
  });

  describe("mcp.json shape", () => {
    it("rewrites mcpServers.command and args entries", () => {
      const input = {
        mcpServers: {
          "aidd-test-server": {
            command: BIN_PATH,
            args: [`${CLAUDE_ROOT}/config.json`],
            env: { EXTRA: `${CLAUDE_ROOT}/lib` },
          },
        },
      };
      const expected = {
        mcpServers: {
          "aidd-test-server": {
            command: RELATIVE_BIN,
            args: ["./config.json"],
            env: { EXTRA: "./lib" },
          },
        },
      };
      expect(rewriteClaudeRootInJson(input)).toEqual(expected);
    });
  });

  describe("substitute override", () => {
    it("uses custom substitute instead of default prefix replacement", () => {
      const input = SCRIPTS_PATH;
      const result = rewriteClaudeRootInJson(input, (suffix) => `/custom/${suffix}`);
      expect(result).toBe("/custom/scripts/check.sh");
    });

    it("applies custom substitute in nested objects", () => {
      const input = { command: SCRIPTS_PATH };
      const result = rewriteClaudeRootInJson(input, (suffix) => `PREFIX/${suffix}`);
      expect(result).toEqual({ command: "PREFIX/scripts/check.sh" });
    });

    it("applies custom substitute in arrays", () => {
      const input = [SCRIPTS_PATH, BIN_PATH];
      const result = rewriteClaudeRootInJson(input, (suffix) => `OUT/${suffix}`);
      expect(result).toEqual(["OUT/scripts/check.sh", "OUT/bin/server.js"]);
    });

    it("rewrites multiple occurrences in same string with substitute", () => {
      const input = `${CLAUDE_ROOT}/a.sh and ${CLAUDE_ROOT}/b.sh`;
      const result = rewriteClaudeRootInJson(input, (suffix) => `X/${suffix}`);
      expect(result).toBe("X/a.sh and X/b.sh");
    });

    it("default behaviour (no substitute) is unchanged", () => {
      expect(rewriteClaudeRootInJson(SCRIPTS_PATH)).toBe(RELATIVE_SCRIPTS);
    });
  });
});
