import { describe, expect, it } from "vitest";
import { compareSemver, isSemver } from "../../src/kernel/semver.js";

describe("isSemver()", () => {
  it("accepts a plain release version", () => {
    expect(isSemver("5.3.0")).toBe(true);
    expect(isSemver("v5.3.0")).toBe(true);
  });

  it("accepts a pre-release version", () => {
    expect(isSemver("1.0.0-rc.1")).toBe(true);
  });

  it("accepts optional build metadata", () => {
    expect(isSemver("1.0.0+build.5")).toBe(true);
    expect(isSemver("1.0.0-rc.1+build.5")).toBe(true);
  });

  // Unanchored, `isSemver` matches trailing garbage after the three components, so a
  // hand-edited or corrupted version field reads as valid semver.
  it("rejects trailing garbage after the three numeric components", () => {
    expect(isSemver("1.2.3abc")).toBe(false);
    expect(isSemver("1.2.3.4")).toBe(false);
  });

  it("rejects a string with no version at all", () => {
    expect(isSemver("not-a-version")).toBe(false);
    expect(isSemver("")).toBe(false);
  });
});

describe("compareSemver()", () => {
  it("compares numerically, not lexically", () => {
    expect(compareSemver("5.10.0", "5.9.0")).toBe(1);
    expect(compareSemver("5.9.0", "5.10.0")).toBe(-1);
  });

  it("is 0 for two identical release versions", () => {
    expect(compareSemver("5.3.0", "5.3.0")).toBe(0);
  });

  // Compared equal, a host on the final release and a run on its own release candidate are
  // told "no drift", and the rollback refusal's equality gate lets a rollback through.
  it("orders a pre-release version below its own release", () => {
    expect(compareSemver("5.3.0-rc.1", "5.3.0")).toBe(-1);
    expect(compareSemver("5.3.0", "5.3.0-rc.1")).toBe(1);
  });

  it("orders two pre-release identifiers numerically when both are numeric", () => {
    expect(compareSemver("5.3.0-rc.2", "5.3.0-rc.10")).toBe(-1);
  });

  it("orders two pre-release identifiers lexically when not numeric", () => {
    expect(compareSemver("5.3.0-alpha", "5.3.0-beta")).toBe(-1);
  });

  it("treats two unparseable strings as equal rather than throwing", () => {
    expect(compareSemver("garbage", "also-garbage")).toBe(0);
  });
});
