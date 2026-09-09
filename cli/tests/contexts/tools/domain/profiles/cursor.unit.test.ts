import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cursor } from "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";

describe("cursor", () => {
  describe("capabilities.rules.convertFrontmatter()", () => {
    it("converts paths: to globs: as a JSON inline string and adds alwaysApply: false", () => {
      const result = cursor.capabilities.rules?.convertFrontmatter({
        paths: ["src/**/*.ts", "tests/**/*.ts"],
      });
      expect(result).toStrictEqual({
        globs: '["src/**/*.ts", "tests/**/*.ts"]',
        alwaysApply: false,
      });
    });

    it("keeps the description ahead of the globs it applies to", () => {
      const result = cursor.capabilities.rules?.convertFrontmatter({
        description: "Apply when editing sources.",
        paths: ["src/**/*.ts"],
      });
      expect(result).toStrictEqual({
        description: "Apply when editing sources.",
        globs: '["src/**/*.ts"]',
        alwaysApply: false,
      });
    });

    it("returns empty frontmatter for rules without paths (always apply)", () => {
      const result = cursor.capabilities.rules?.convertFrontmatter({
        description: "desc",
        alwaysApply: true,
      });
      expect(result).toStrictEqual({});
    });

    it("returns empty frontmatter for a rule whose paths list is empty", () => {
      const result = cursor.capabilities.rules?.convertFrontmatter({ paths: [] });
      expect(result).toStrictEqual({});
    });

    it("returns empty frontmatter for a rule that opts out of always-apply and names no description", () => {
      const result = cursor.capabilities.rules?.convertFrontmatter({ alwaysApply: false });
      expect(result).toStrictEqual({});
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

  describe("capabilities.rules.buildInstallPath()", () => {
    it("builds path for rules section with .mdc extension", () => {
      const path = cursor.capabilities.rules?.buildInstallPath("01-standards/naming.md");
      expect(path).toBe(".cursor/rules/01-standards/naming.mdc");
    });

    it("leaves a rule already written in Cursor's own extension untouched", () => {
      const path = cursor.capabilities.rules?.buildInstallPath("01-standards/naming.mdc");
      expect(path).toBe(".cursor/rules/01-standards/naming.mdc");
    });
  });

  describe("rewriteContent()", () => {
    it("routes a numbered command folder under commands/aidd/<phase>/, with or without the @ prefix", () => {
      const rewritten = cursor.rewriteContent?.(
        "Run .cursor/commands/04_code/implement.md, then @.cursor/commands/02-plan/plan.md.\n"
      );
      expect(rewritten).toBe(
        "Run .cursor/commands/aidd/04/implement.md, then @.cursor/commands/aidd/02/plan.md.\n"
      );
    });

    it("gives a referenced rule Cursor's .mdc extension", () => {
      const rewritten = cursor.rewriteContent?.("Read @.cursor/rules/01-standards/naming.md\n");
      expect(rewritten).toBe("Read @.cursor/rules/01-standards/naming.mdc\n");
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
      expect(result).toBe(join("/home/user", ".cursor", "plugins", "local"));
    });
  });
});
