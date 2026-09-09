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

describe("HooksCapability declarations", () => {
  it("consumes nothing unless told otherwise", () => {
    expect(new HooksCapability({ outputPath: "h.json" }).consumes).toStrictEqual([]);
    expect(
      new HooksCapability({ outputPath: "h.json", consumes: ["hooks"] }).consumes
    ).toStrictEqual(["hooks"]);
  });

  it("merges with the function the tool declares, and takes the incoming content whole without one", () => {
    expect(
      new HooksCapability({ outputPath: "h.json", mergeFn: (a, b) => `${a}+${b}` }).merge("x", "y")
    ).toBe("x+y");
    expect(new HooksCapability({ outputPath: "h.json" }).merge("x", "y")).toBe("y");
  });

  it("lets the user's file win unless the tool declares otherwise", () => {
    expect(new HooksCapability({ outputPath: "h.json" }).getMergeStrategy()).toBe("user-prime");
    expect(
      new HooksCapability({ outputPath: "h.json", mergeStrategy: "none" }).getMergeStrategy()
    ).toBe("none");
  });

  it("names its entry section only when one is declared", () => {
    expect(new HooksCapability({ outputPath: "h.json" }).getEntrySection()).toBeNull();
    expect(
      new HooksCapability({ outputPath: "h.json", entrySection: "hooks" }).getEntrySection()
    ).toBe("hooks");
  });

  it("differs on the merge strategy or the entry section alone", () => {
    const cap = new HooksCapability({
      outputPath: "h.json",
      mergeStrategy: "none",
      entrySection: "a",
    });

    expect(
      cap.equals(
        new HooksCapability({ outputPath: "h.json", mergeStrategy: "none", entrySection: "a" })
      )
    ).toBe(true);
    expect(
      cap.equals(
        new HooksCapability({
          outputPath: "h.json",
          mergeStrategy: "user-prime",
          entrySection: "a",
        })
      )
    ).toBe(false);
    expect(
      cap.equals(
        new HooksCapability({ outputPath: "h.json", mergeStrategy: "none", entrySection: "b" })
      )
    ).toBe(false);
  });
});
