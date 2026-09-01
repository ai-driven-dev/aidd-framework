import { describe, expect, it } from "vitest";
import type { FileDiff, FileDiffKind } from "../../src/kernel/file.js";

describe("FileDiffKind", () => {
  it("accepts all valid kinds", () => {
    const kinds: FileDiffKind[] = ["added", "removed", "changed", "unchanged"];
    expect(kinds).toHaveLength(4);
  });

  it("narrowing: added kind", () => {
    const diff: FileDiff = { relativePath: "foo.md", kind: "added" };
    expect(diff.kind).toBe("added");
  });

  it("narrowing: removed kind", () => {
    const diff: FileDiff = { relativePath: "foo.md", kind: "removed" };
    expect(diff.kind).toBe("removed");
  });

  it("narrowing: changed kind", () => {
    const diff: FileDiff = { relativePath: "foo.md", kind: "changed" };
    expect(diff.kind).toBe("changed");
  });

  it("narrowing: unchanged kind", () => {
    const diff: FileDiff = { relativePath: "foo.md", kind: "unchanged" };
    expect(diff.kind).toBe("unchanged");
  });
});

describe("FileDiff", () => {
  it("conflict flag is optional", () => {
    const diff: FileDiff = { relativePath: "foo.md", kind: "changed" };
    expect(diff.conflict).toBeUndefined();
  });

  it("conflict flag can be true", () => {
    const diff: FileDiff = { relativePath: "foo.md", kind: "changed", conflict: true };
    expect(diff.conflict).toBe(true);
  });

  it("conflict flag can be false", () => {
    const diff: FileDiff = { relativePath: "foo.md", kind: "changed", conflict: false };
    expect(diff.conflict).toBe(false);
  });

  it("carries relativePath", () => {
    const diff: FileDiff = { relativePath: ".claude/CLAUDE.md", kind: "added" };
    expect(diff.relativePath).toBe(".claude/CLAUDE.md");
  });
});
