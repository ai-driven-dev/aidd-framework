import { describe, expect, it } from "vitest";
import { RulesCapability } from "../../../src/domain/capabilities/rules-capability.js";

const stubParams = {
  buildInstallPath: (fileName: string): string | null => `stub/${fileName}`,
  convertFrontmatter: (fm: Record<string, unknown>): Record<string, unknown> => fm,
  reverseConvertFrontmatter: (fm: Record<string, unknown>): Record<string, unknown> => fm,
};

describe("RulesCapability", () => {
  const params = { directory: ".claude/", toolSuffix: ".claude.md", ...stubParams };

  describe("buildOutputPath", () => {
    it("combines directory, rules folder, name, and tool suffix", () => {
      const cap = new RulesCapability(params);
      expect(cap.buildOutputPath("my-rule")).toBe(".claude/rules/my-rule.claude.md");
    });
  });

  // Where a rule *lands* is not `buildOutputPath` — that answers where the framework's own
  // source form goes. An installed tree holds the converted file, and the one thing that
  // knows its shape is `buildInstallPath`, which is a closure per tool: a template for
  // three of them, `toMdc` for Cursor, a delegated handler for Copilot. Asking it with a
  // sentinel keeps the answer where the knowledge is, instead of a reader parsing a path
  // string back apart and becoming a second copy of it.
  describe("installedLocation", () => {
    it("answers the directory and the extension an installed rule actually carries", () => {
      const cap = new RulesCapability({
        ...params,
        buildInstallPath: (fileName) => `.claude/rules/${fileName.replace(".claude.md", ".md")}`,
      });

      expect(cap.installedLocation()).toEqual({ directory: ".claude/rules/", extension: ".md" });
    });

    it("reads an extension of several segments, which is what Copilot installs", () => {
      const cap = new RulesCapability({
        ...params,
        buildInstallPath: (fileName) =>
          `.github/instructions/${fileName.replace(".claude.md", ".instructions.md")}`,
      });

      expect(cap.installedLocation()).toEqual({
        directory: ".github/instructions/",
        extension: ".instructions.md",
      });
    });

    // A tool free to answer `null` for a name it will not install is free to answer `null`
    // here, and a caller scans nothing rather than guessing a directory.
    it("answers nothing when the tool installs no rule for the name it is asked about", () => {
      const cap = new RulesCapability({ ...params, buildInstallPath: () => null });

      expect(cap.installedLocation()).toBeNull();
    });
  });

  describe("accepts", () => {
    it("returns true when path starts with directory", () => {
      const cap = new RulesCapability(params);
      expect(cap.accepts(".claude/rules/foo.md")).toBe(true);
    });

    it("returns false when path does not start with directory", () => {
      const cap = new RulesCapability(params);
      expect(cap.accepts(".cursor/rules/foo.md")).toBe(false);
    });
  });

  describe("equals", () => {
    it("returns true for identical params", () => {
      const a = new RulesCapability(params);
      const b = new RulesCapability({ ...params });
      expect(a.equals(b)).toBe(true);
    });

    it("returns false when directory differs", () => {
      const a = new RulesCapability(params);
      const b = new RulesCapability({ ...params, directory: ".cursor/" });
      expect(a.equals(b)).toBe(false);
    });

    it("returns false when toolSuffix differs", () => {
      const a = new RulesCapability(params);
      const b = new RulesCapability({ ...params, toolSuffix: ".cursor.md" });
      expect(a.equals(b)).toBe(false);
    });
  });
});
