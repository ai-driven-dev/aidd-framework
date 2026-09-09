import { describe, expect, it } from "vitest";
import { RulesCapability } from "../../../../../src/contexts/tools/domain/capabilities/rules-capability.js";

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

  // Where a rule lands is `buildInstallPath`, not `buildOutputPath`, and it is a closure per tool.
  // Asking it with a sentinel keeps the answer where the knowledge is, not in a path parser here.
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

describe("RulesCapability installed location edge cases", () => {
  it("answers an empty directory for an installer that files a rule at the project root", () => {
    const cap = new RulesCapability({
      directory: ".x/",
      toolSuffix: ".x.md",
      buildInstallPath: (fileName) => fileName.replace(/\.x\.md$/, ".mdc"),
      convertFrontmatter: (fm) => fm,
    });

    expect(cap.installedLocation()).toStrictEqual({ directory: "", extension: ".mdc" });
  });

  it("reads the extension even when the installer prefixes the stem", () => {
    const cap = new RulesCapability({
      directory: ".x/",
      toolSuffix: ".x.md",
      buildInstallPath: (fileName) => `.x/rules/_${fileName.replace(/\.x\.md$/, ".mdc")}`,
      convertFrontmatter: (fm) => fm,
    });

    expect(cap.installedLocation()).toStrictEqual({ directory: ".x/rules/", extension: ".mdc" });
  });

  it("answers nothing when the installer rewrote the stem past recognition", () => {
    const cap = new RulesCapability({
      directory: ".x/",
      toolSuffix: ".x.md",
      buildInstallPath: () => ".x/rules/renamed.mdc",
      convertFrontmatter: (fm) => fm,
    });

    expect(cap.installedLocation()).toBeNull();
  });
});

describe("RulesCapability file acceptance", () => {
  const cap = new RulesCapability({
    directory: ".claude/",
    toolSuffix: ".claude.md",
    buildInstallPath: (fileName) => fileName,
    convertFrontmatter: (fm) => fm,
  });

  it("accepts its own suffix and a suffix belonging to no tool", () => {
    expect(cap.acceptsFileName("rules/a.claude.md")).toBe(true);
    expect(cap.acceptsFileName("rules/a.md")).toBe(true);
  });

  it("refuses another tool's suffix wherever the file sits", () => {
    expect(cap.acceptsFileName("a/b/c.cursor.md")).toBe(false);
  });

  it("reads the input suffix as its own when the tool declares one", () => {
    const mdc = new RulesCapability({
      directory: ".cursor/",
      toolSuffix: ".mdc",
      inputSuffix: ".cursor.md",
      buildInstallPath: (fileName) => fileName,
      convertFrontmatter: (fm) => fm,
    });

    expect(mdc.acceptsFileName("a.cursor.md")).toBe(true);
    expect(mdc.acceptsFileName("a.claude.md")).toBe(false);
  });
});
