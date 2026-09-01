import { describe, expect, it } from "vitest";
import { HooksCapability } from "../../../../../src/contexts/tools/domain/capabilities/hooks-capability.js";

describe("HooksCapability", () => {
  const params = { outputPath: ".codex/hooks.json" };

  describe("buildOutputPath", () => {
    it("returns the configured output path", () => {
      const cap = new HooksCapability(params);
      expect(cap.buildOutputPath()).toBe(".codex/hooks.json");
    });
  });

  describe("accepts", () => {
    it("returns true for the exact output path", () => {
      const cap = new HooksCapability(params);
      expect(cap.accepts(".codex/hooks.json")).toBe(true);
    });

    it("returns false for any other path", () => {
      const cap = new HooksCapability(params);
      expect(cap.accepts(".codex/settings.json")).toBe(false);
    });
  });

  describe("equals", () => {
    it("returns true for identical params", () => {
      const a = new HooksCapability(params);
      const b = new HooksCapability({ ...params });
      expect(a.equals(b)).toBe(true);
    });

    it("returns false when outputPath differs", () => {
      const a = new HooksCapability(params);
      const b = new HooksCapability({ outputPath: ".other/hooks.json" });
      expect(a.equals(b)).toBe(false);
    });
  });
});
