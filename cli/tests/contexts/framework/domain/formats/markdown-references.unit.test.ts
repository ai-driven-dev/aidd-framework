import { describe, expect, it } from "vitest";
import {
  extractAtReferences,
  extractMarkdownLinkTargets,
  isFileReference,
} from "../../../../../src/contexts/framework/domain/formats/markdown-references.js";

describe("isFileReference", () => {
  it("returns true for a path with a file extension", () => {
    expect(isFileReference("src/utils/helper.ts")).toBe(true);
    expect(isFileReference("README.md")).toBe(true);
    expect(isFileReference("docs/guide.md")).toBe(true);
  });

  it("returns false for directory paths (ending with /)", () => {
    expect(isFileReference("src/utils/")).toBe(false);
    expect(isFileReference("docs/")).toBe(false);
  });

  it("returns false for paths with no extension in last segment", () => {
    expect(isFileReference("src/utils/helper")).toBe(false);
    expect(isFileReference("justadirectory")).toBe(false);
  });
});

describe("extractAtReferences", () => {
  it("returns empty array when no @-references are present", () => {
    expect(extractAtReferences("# Heading\nSome content without references.")).toEqual([]);
  });

  it("extracts @-references from content", () => {
    const content = "Please read @docs/guide.md and @src/utils/helper.ts";
    const refs = extractAtReferences(content);
    expect(refs).toContain("docs/guide.md");
    expect(refs).toContain("src/utils/helper.ts");
  });

  it("deduplicates repeated references", () => {
    const content = "@docs/guide.md and @docs/guide.md again";
    const refs = extractAtReferences(content);
    expect(refs.filter((r) => r === "docs/guide.md")).toHaveLength(1);
  });

  it("does not extract references inside non-markdown code blocks", () => {
    const content = "```typescript\n// @docs/ignored.md\n```\n@docs/visible.md";
    const refs = extractAtReferences(content);
    expect(refs).not.toContain("docs/ignored.md");
    expect(refs).toContain("docs/visible.md");
  });
});

describe("extractMarkdownLinkTargets", () => {
  it("returns empty array when no links are present", () => {
    expect(extractMarkdownLinkTargets("Plain text content.")).toEqual([]);
  });

  it("extracts local link targets", () => {
    const content = "See [guide](docs/guide.md) and [README](README.md)";
    const refs = extractMarkdownLinkTargets(content);
    expect(refs).toContain("docs/guide.md");
    expect(refs).toContain("README.md");
  });

  it("ignores external HTTP links", () => {
    const content = "See [external](https://example.com) and [local](docs/local.md)";
    const refs = extractMarkdownLinkTargets(content);
    expect(refs).not.toContain("https://example.com");
    expect(refs).toContain("docs/local.md");
  });
});
