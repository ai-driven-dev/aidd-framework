import { describe, expect, it } from "vitest";
import { cursor } from "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";

describe("cursor", () => {
  describe("capabilities.rules.convertFrontmatter()", () => {
    it("converts paths: to globs: as JSON inline string and adds alwaysApply: false", () => {
      const result = cursor.capabilities.rules?.convertFrontmatter({
        paths: ["src/**/*.ts"],
      });
      expect(result).toEqual({ globs: '["src/**/*.ts"]', alwaysApply: false });
    });

    it("returns empty frontmatter for rules without paths (always apply)", () => {
      const result = cursor.capabilities.rules?.convertFrontmatter({
        description: "desc",
        alwaysApply: true,
      });
      expect(result).toEqual({});
    });

    it("keeps description and alwaysApply false when no globs are specified", () => {
      const result = cursor.capabilities.rules?.convertFrontmatter({
        description: "Apply when editing command files.",
        alwaysApply: false,
      });
      expect(result).toEqual({
        description: "Apply when editing command files.",
        alwaysApply: false,
      });
    });
  });

  describe("capabilities.agents.convertFrontmatter()", () => {
    it("strips extra fields for agents sections — only name and description", () => {
      const fm = { name: "alexia", description: "Agent", model: "opus" };
      const result = cursor.capabilities.agents.convertFrontmatter(fm);
      expect(result).toEqual({ name: "alexia", description: "Agent" });
    });
  });

  describe("capabilities.commands.convertFrontmatter()", () => {
    it("prefixes name with aidd:<phase>: and strips extra fields", () => {
      const fm = { name: "implement", description: "Implement", model: "sonnet" };
      const result = cursor.capabilities.commands?.convertFrontmatter(fm, "04_code/implement.md");
      expect(result).toEqual({ name: "aidd:04:implement", description: "Implement" });
    });
  });

  describe("capabilities.commands.buildInstallPath()", () => {
    it("maps phase-prefixed path to aidd/<phase>/ subfolder", () => {
      const path = cursor.capabilities.commands?.buildInstallPath("04_code/implement.md");
      expect(path).toBe(".cursor/commands/aidd/04/implement.md");
    });

    it("maps top-level file to aidd/ subfolder without phase", () => {
      const path = cursor.capabilities.commands?.buildInstallPath("commit.md");
      expect(path).toBe(".cursor/commands/aidd/commit.md");
    });
  });

  describe("capabilities.commands.reverseConvertFrontmatter()", () => {
    it("strips aidd:<phase>: prefix from name", () => {
      const result = cursor.capabilities.commands?.reverseConvertFrontmatter({
        name: "aidd:04:implement",
        description: "Impl",
      });
      expect(result).toEqual({ name: "implement", description: "Impl" });
    });
  });

  describe("capabilities.rules.buildInstallPath()", () => {
    it("builds path for rules section with .mdc extension", () => {
      const path = cursor.capabilities.rules?.buildInstallPath("01-standards/naming.md");
      expect(path).toBe(".cursor/rules/01-standards/naming.mdc");
    });
  });

  describe("capabilities.agents.buildInstallPath()", () => {
    it("keeps .md extension for agents", () => {
      const path = cursor.capabilities.agents.buildInstallPath("code-reviewer.md");
      expect(path).toBe(".cursor/agents/code-reviewer.md");
    });
  });

  describe("capabilities.skills.buildInstallPath()", () => {
    it("builds path under .cursor/skills/ without tool suffix", () => {
      const path = cursor.capabilities.skills.buildInstallPath("commit/SKILL.md");
      expect(path).toBe(".cursor/skills/commit/SKILL.md");
    });

    it("strips .cursor.md tool suffix from skill name", () => {
      const path = cursor.capabilities.skills.buildInstallPath("commit.cursor.md");
      expect(path).toBe(".cursor/skills/commit.md");
    });
  });

  describe("capabilities.rules.reverseConvertFrontmatter()", () => {
    it("reverses globs string back to paths array", () => {
      const result = cursor.capabilities.rules?.reverseConvertFrontmatter({
        globs: '["src/**/*.ts"]',
        alwaysApply: false,
      });
      expect(result).toEqual({ paths: ["src/**/*.ts"] });
    });

    it("returns empty object when globs is absent (always apply)", () => {
      const result = cursor.capabilities.rules?.reverseConvertFrontmatter({});
      expect(result).toEqual({});
    });
  });

  describe("detectUserFileSectionKey()", () => {
    it("detects agents section for .cursor/agents/ paths", () => {
      const key = cursor.detectUserFileSectionKey(".cursor/agents/alexia.md");
      expect(key).toEqual({ section: "agents", key: "alexia.md" });
    });

    it("detects commands section for .cursor/commands/aidd/ paths", () => {
      const key = cursor.detectUserFileSectionKey(".cursor/commands/aidd/04/implement.md");
      expect(key).toEqual({ section: "commands", key: "04/implement.md" });
    });

    it("detects skills section for .cursor/skills/ paths", () => {
      const key = cursor.detectUserFileSectionKey(".cursor/skills/commit/SKILL.md");
      expect(key).toEqual({ section: "skills", key: "commit/SKILL.md" });
    });

    it("detects rules section for .cursor/rules/ paths and normalises .mdc to .md", () => {
      const key = cursor.detectUserFileSectionKey(".cursor/rules/01-standards/naming.mdc");
      expect(key).toEqual({ section: "rules", key: "01-standards/naming.md" });
    });

    it("returns null for unrecognised paths", () => {
      expect(cursor.detectUserFileSectionKey(".cursor/settings.json")).toBeNull();
      expect(cursor.detectUserFileSectionKey("unknown.md")).toBeNull();
    });
  });

  describe("capabilities.plugins", () => {
    it("has a plugins capability", () => {
      expect("plugins" in cursor.capabilities).toBe(true);
    });

    it("is native mode", () => {
      expect(cursor.capabilities.plugins.mode).toBe("native");
    });

    it("pluginsDir is empty string (base-relative path prefix)", () => {
      expect(cursor.capabilities.plugins.pluginsDir).toBe("");
    });

    it("pluginManifestRelativePath is null (no manifest file written into plugin dir)", () => {
      expect(cursor.capabilities.plugins.pluginManifestRelativePath).toBeNull();
    });

    it("installScope is user", () => {
      expect(cursor.capabilities.plugins.installScope).toBe("user");
    });

    it("acceptsHooks is true (Cursor auto-discovers hooks.json at plugin root)", () => {
      expect(cursor.capabilities.plugins.acceptsHooks).toBe(true);
    });

    it("acceptsMcp is true (Cursor auto-discovers mcp.json at plugin root)", () => {
      expect(cursor.capabilities.plugins.acceptsMcp).toBe(true);
    });

    it("marketplaceSettings is null", () => {
      expect(cursor.capabilities.plugins.marketplaceSettings).toBeNull();
    });

    it("resolvePluginsBaseDir returns ~/.cursor/plugins/local resolved from given homedir", () => {
      const result = cursor.capabilities.plugins.resolvePluginsBaseDir("/proj", "/home/user");
      expect(result).toBe("/home/user/.cursor/plugins/local");
    });
  });
});
