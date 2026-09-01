import { describe, expect, it } from "vitest";
import { isPerKeyMergeStrategy } from "../../src/kernel/merge.js";

describe("isPerKeyMergeStrategy", () => {
  it("returns true for PerKeyMergeStrategy objects", () => {
    expect(isPerKeyMergeStrategy({ default: "user-prime", frameworkOverrideKeys: [] })).toBe(true);
  });

  it("returns false for string strategies", () => {
    expect(isPerKeyMergeStrategy("none")).toBe(false);
    expect(isPerKeyMergeStrategy("framework-prime")).toBe(false);
    expect(isPerKeyMergeStrategy("user-prime")).toBe(false);
  });
});
