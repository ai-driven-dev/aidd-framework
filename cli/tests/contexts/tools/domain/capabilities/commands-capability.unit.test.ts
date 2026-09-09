import { describe, expect, it } from "vitest";
import { CommandsCapability } from "../../../../../src/contexts/tools/domain/capabilities/commands-capability.js";

const stubParams = {
  buildInstallPath: (fileName: string): string | null => `stub/${fileName}`,
  convertFrontmatter: (fm: Record<string, unknown>): Record<string, unknown> => fm,
  reverseConvertFrontmatter: (fm: Record<string, unknown>): Record<string, unknown> => fm,
};

describe("CommandsCapability", () => {
  const params = { directory: ".claude/", toolSuffix: ".claude.md", ...stubParams };

  describe("buildOutputPath", () => {
    it("combines directory, commands folder, name, and tool suffix", () => {
      const cap = new CommandsCapability(params);
      expect(cap.buildOutputPath("my-command")).toBe(".claude/commands/my-command.claude.md");
    });
  });

  describe("accepts", () => {
    it("returns true when path starts with directory", () => {
      const cap = new CommandsCapability(params);
      expect(cap.accepts(".claude/commands/foo.md")).toBe(true);
    });

    it("returns false when path does not start with directory", () => {
      const cap = new CommandsCapability(params);
      expect(cap.accepts(".cursor/commands/foo.md")).toBe(false);
    });
  });

  describe("equals", () => {
    it("returns true for identical params", () => {
      const a = new CommandsCapability(params);
      const b = new CommandsCapability({ ...params });
      expect(a.equals(b)).toBe(true);
    });

    it("returns false when directory differs", () => {
      const a = new CommandsCapability(params);
      const b = new CommandsCapability({ ...params, directory: ".cursor/" });
      expect(a.equals(b)).toBe(false);
    });

    it("returns false when toolSuffix differs", () => {
      const a = new CommandsCapability(params);
      const b = new CommandsCapability({ ...params, toolSuffix: ".cursor.md" });
      expect(a.equals(b)).toBe(false);
    });
  });
});

describe("CommandsCapability file acceptance", () => {
  const cap = new CommandsCapability({
    directory: ".claude/",
    toolSuffix: ".claude.md",
    buildInstallPath: (fileName) => fileName,
    convertFrontmatter: (fm) => fm,
  });

  it("accepts its own suffix and a suffix belonging to no tool", () => {
    expect(cap.acceptsFileName("01-plan/plan.claude.md")).toBe(true);
    expect(cap.acceptsFileName("01-plan/plan.md")).toBe(true);
  });

  it("refuses another tool's suffix wherever the file sits", () => {
    expect(cap.acceptsFileName("a/b/plan.cursor.md")).toBe(false);
  });
});
