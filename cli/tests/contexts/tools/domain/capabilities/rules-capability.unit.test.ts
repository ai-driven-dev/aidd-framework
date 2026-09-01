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
