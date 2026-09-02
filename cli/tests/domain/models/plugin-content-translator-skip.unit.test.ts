import { describe, expect, it } from "vitest";
import { FileHash } from "../../../src/domain/models/file.js";
import { PluginContentTranslator } from "../../../src/domain/models/plugin-content-translator.js";
import { PluginDistribution } from "../../../src/domain/models/plugin-distribution.js";
import { cursor } from "../../../src/domain/tools/ai/cursor.js";
import { opencode } from "../../../src/domain/tools/ai/opencode.js";

const stubHasher = { hash: (_content: string) => new FileHash("a".repeat(32)) };
const translator = new PluginContentTranslator(stubHasher);

const HOOKS_CONTENT = JSON.stringify({
  hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "node ./hooks/pre.js" }] }] },
});

function buildDistWithNoHooksMcp(name = "test-plugin"): PluginDistribution {
  return new PluginDistribution({
    manifest: { name, version: "1.0.0" },
    format: "claude",
    files: [
      { relativePath: "commands/greet.md", content: "---\nname: aidd:01:greet\n---\n# Greet" },
    ],
    components: {
      commands: [
        { relativePath: "commands/greet.md", content: "---\nname: aidd:01:greet\n---\n# Greet" },
      ],
      agents: [],
      rules: [],
      skills: [],
      hooks: [],
      mcp: [],
    },
  });
}

function buildDistWithHooks(name = "test-plugin"): PluginDistribution {
  return new PluginDistribution({
    manifest: { name, version: "1.0.0" },
    format: "claude",
    files: [
      { relativePath: "hooks/hooks.json", content: HOOKS_CONTENT },
      { relativePath: "hooks/pre.js", content: "module.exports = () => {};" },
    ],
    components: {
      commands: [],
      agents: [],
      rules: [],
      skills: [],
      hooks: [
        { relativePath: "hooks/hooks.json", content: HOOKS_CONTENT },
        { relativePath: "hooks/pre.js", content: "module.exports = () => {};" },
      ],
      mcp: [],
    },
  });
}

describe("PluginContentTranslator skip list", () => {
  describe("flat mode (opencode)", () => {
    it("returns empty skipped list when plugin has no hooks or mcp", () => {
      const dist = buildDistWithNoHooksMcp();
      const result = translator.translateWithComponentPaths(dist, opencode, "docs");
      expect(result.skipped).toEqual([]);
    });

    it("returns no skip entry when plugin has hooks — OpenCode now accepts them", () => {
      const dist = buildDistWithHooks("aidd-pm");
      const result = translator.translateWithComponentPaths(dist, opencode, "docs");
      expect(result.skipped).toEqual([]);
    });

    it("delivers every hooks/ file but hooks.json under the tool's flatHooksDir", () => {
      const dist = buildDistWithHooks("aidd-pm");
      const result = translator.translateWithComponentPaths(dist, opencode, "docs");
      const paths = result.files.map((f) => f.relativePath);
      expect(paths).toContain(".opencode/plugin/pre.js");
      expect(paths).not.toContain(".opencode/plugin/hooks.json");
    });
  });

  describe("native mode (cursor)", () => {
    it("returns empty skipped list when plugin has no hooks or mcp", () => {
      const dist = buildDistWithNoHooksMcp();
      const result = translator.translateWithComponentPaths(dist, cursor, "docs");
      expect(result.skipped).toEqual([]);
    });

    it("returns empty skipped list when plugin has hooks (cursor acceptsHooks: true)", () => {
      const dist = buildDistWithHooks("test-plugin");
      const result = translator.translateWithComponentPaths(dist, cursor, "docs");
      expect(result.skipped).toEqual([]);
    });
  });
});
