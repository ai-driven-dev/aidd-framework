import { describe, expect, it } from "vitest";
import { pathContainsOrEquals, pathsOverlap } from "../../../../src/kernel/paths.js";

// A build refuses to write into the tree it reads from, and the cache-rebuild path takes a
// temp-dir detour when the two overlap. Both questions are asked here, so both are pinned
// here - with backslash-spelled paths, which is what a Windows run actually passes and
// what the two hardcoded "/" comparisons this replaced never recognised (#707).
describe("pathContainsOrEquals()", () => {
  it("sees the same directory spelled either way", () => {
    expect(pathContainsOrEquals("/a/b", "/a/b")).toBe(true);
    expect(pathContainsOrEquals("C:\\a\\b", "C:\\a\\b")).toBe(true);
  });

  it("sees a directory inside another, with either separator", () => {
    expect(pathContainsOrEquals("/a", "/a/b/c")).toBe(true);
    expect(pathContainsOrEquals("C:\\a", "C:\\a\\b\\c")).toBe(true);
  });

  it("does not mistake a shared name prefix for containment", () => {
    expect(pathContainsOrEquals("/a/build", "/a/build-cache")).toBe(false);
    expect(pathContainsOrEquals("C:\\a\\build", "C:\\a\\build-cache")).toBe(false);
  });

  it("answers in one direction only", () => {
    expect(pathContainsOrEquals("/a/b/c", "/a")).toBe(false);
    expect(pathContainsOrEquals("C:\\a\\b\\c", "C:\\a")).toBe(false);
  });

  it("separates unrelated directories", () => {
    expect(pathContainsOrEquals("/a", "/b")).toBe(false);
    expect(pathContainsOrEquals("C:\\a", "D:\\a")).toBe(false);
  });
});

describe("pathsOverlap()", () => {
  it("answers in both directions, with either separator", () => {
    expect(pathsOverlap("/a", "/a/b")).toBe(true);
    expect(pathsOverlap("/a/b", "/a")).toBe(true);
    expect(pathsOverlap("C:\\a", "C:\\a\\b")).toBe(true);
    expect(pathsOverlap("C:\\a\\b", "C:\\a")).toBe(true);
  });

  it("leaves genuinely separate trees alone", () => {
    expect(pathsOverlap("/a", "/b")).toBe(false);
    expect(pathsOverlap("C:\\src", "C:\\out")).toBe(false);
  });
});
