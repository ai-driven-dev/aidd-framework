import { describe, expect, it } from "vitest";
import { claude } from "../../../../src/domain/tools/ai/claude.js";

describe("claude", () => {
  describe("capabilities.mcp", () => {
    it("outputs to .mcp.json", () => {
      expect(claude.capabilities.mcp.params.outputPath).toBe(".mcp.json");
    });

    it("consumes the mcp config name", () => {
      expect(claude.capabilities.mcp.consumes).toContain("mcp");
    });

    it("does not consume unknown config names", () => {
      expect(claude.capabilities.mcp.consumes).not.toContain("vscodeDir");
    });

    it("mcp config preserves user customizations during update", () => {
      expect(claude.capabilities.mcp.params.mergeStrategy ?? "user-prime").toBe("user-prime");
    });
  });

  describe("capabilities.rules.convertFrontmatter()", () => {
    it("preserves paths: list when already in Claude format", () => {
      const fm = { paths: ["src/**/*.ts"] };
      const result = claude.capabilities.rules?.convertFrontmatter(fm);
      expect(result).toEqual({ paths: ["src/**/*.ts"] });
    });

    it("strips extra fields when paths key is present", () => {
      const fm = { paths: ["src/**/*.ts"], description: "extra", alwaysApply: false };
      const result = claude.capabilities.rules?.convertFrontmatter(fm);
      expect(result).toEqual({ paths: ["src/**/*.ts"] });
    });

    it("converts cursor-style globs to paths", () => {
      const fm = { globs: ["src/**/*.ts"], alwaysApply: false, description: "desc" };
      const result = claude.capabilities.rules?.convertFrontmatter(fm);
      expect(result).toEqual({ paths: ["src/**/*.ts"] });
    });

    it("returns empty frontmatter for always-apply rules (no paths field = unconditional load)", () => {
      const fm = { description: "desc", alwaysApply: true };
      const result = claude.capabilities.rules?.convertFrontmatter(fm);
      expect(result).toEqual({});
    });

    it("keeps description when alwaysApply is false and no paths are specified", () => {
      const fm = { description: "Apply when editing command files.", alwaysApply: false };
      const result = claude.capabilities.rules?.convertFrontmatter(fm);
      expect(result).toEqual({ description: "Apply when editing command files." });
    });
  });

  describe("capabilities.agents.convertFrontmatter()", () => {
    it("strips extra fields for agents sections — only name and description", () => {
      const fm = { name: "alexia", description: "Agent", model: "opus" };
      const result = claude.capabilities.agents.convertFrontmatter(fm);
      expect(result).toEqual({ name: "alexia", description: "Agent" });
    });
  });

  describe("capabilities.commands.convertFrontmatter()", () => {
    it("prefixes name with aidd:{phase}:", () => {
      const fm = { name: "implement", description: "Implement a plan" };
      const result = claude.capabilities.commands?.convertFrontmatter(fm, "04_code/implement.md");
      expect(result).toEqual({ name: "aidd:04:implement", description: "Implement a plan" });
    });

    it("preserves argument-hint when present", () => {
      const fm = { name: "implement", description: "Implement a plan", "argument-hint": "task" };
      const result = claude.capabilities.commands?.convertFrontmatter(fm, "04_code/implement.md");
      expect(result).toEqual({
        name: "aidd:04:implement",
        description: "Implement a plan",
        "argument-hint": "task",
      });
    });
  });

  describe("capabilities.agents.buildInstallPath()", () => {
    it("builds path for agents section", () => {
      const path = claude.capabilities.agents.buildInstallPath("code-reviewer.md");
      expect(path).toBe(".claude/agents/code-reviewer.md");
    });
  });

  describe("capabilities.rules.buildInstallPath()", () => {
    it("builds path for rules section with subdirectory", () => {
      const path = claude.capabilities.rules?.buildInstallPath("01-standards/naming.md");
      expect(path).toBe(".claude/rules/01-standards/naming.md");
    });
  });

  describe("capabilities.commands.buildInstallPath()", () => {
    it("builds commands path with aidd brand prefix and phase number", () => {
      const path = claude.capabilities.commands?.buildInstallPath("04_code/implement.md");
      expect(path).toBe(".claude/commands/aidd/04/implement.md");
    });

    it("handles two-digit phase in commands", () => {
      const path = claude.capabilities.commands?.buildInstallPath(
        "02_context/create_user_stories.md"
      );
      expect(path).toBe(".claude/commands/aidd/02/create_user_stories.md");
    });
  });

  describe("capabilities.plugins", () => {
    it("has a plugins capability", () => {
      expect("plugins" in claude.capabilities).toBe(true);
    });

    it("is native mode", () => {
      expect(claude.capabilities.plugins.mode).toBe("native");
    });

    it("uses .claude/plugins/ as plugins directory", () => {
      expect(claude.capabilities.plugins.pluginsDir).toBe(".claude/plugins/");
    });

    it("uses plugin.json as plugin manifest path", () => {
      expect(claude.capabilities.plugins.pluginManifestRelativePath).toBe("plugin.json");
    });

    it("pluginOutputDir returns correct path for a plugin name", () => {
      expect(claude.capabilities.plugins.pluginOutputDir("my-plugin")).toBe(
        ".claude/plugins/my-plugin/"
      );
    });
  });
});
