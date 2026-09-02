import { describe, expect, it } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../../src/kernel/markdown.js";

describe("parseFrontmatter()", () => {
  it("parses frontmatter and body from a well-formed file", () => {
    const content = "---\nname: my-agent\ndescription: A test agent\n---\nBody text here.";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({ name: "my-agent", description: "A test agent" });
    expect(body).toBe("Body text here.");
  });

  it("returns empty frontmatter and full content when no delimiter", () => {
    const content = "Just a plain body with no frontmatter.";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it("returns empty frontmatter when closing delimiter is missing", () => {
    const content = "---\nname: broken\nno closing delimiter";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it("parses boolean values correctly", () => {
    const content = "---\nalwaysApply: false\nenabled: true\n---\nbody";
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.alwaysApply).toBe(false);
    expect(frontmatter.enabled).toBe(true);
  });

  it("parses array values correctly", () => {
    const content = "---\npaths:\n  - src/**/*.ts\n  - tests/**/*.ts\n---\nbody";
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.paths).toEqual(["src/**/*.ts", "tests/**/*.ts"]);
  });

  it("parses quoted string values", () => {
    const content = "---\nname: 'my agent'\n---\nbody";
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.name).toBe("my agent");
  });
});

describe("serializeFrontmatter()", () => {
  it("serializes frontmatter and body into delimited format", () => {
    const result = serializeFrontmatter({ name: "my-agent", description: "A test" }, "Body text.");
    expect(result).toContain("---");
    expect(result).toContain("name: 'my-agent'");
    expect(result).toContain("description: 'A test'");
    expect(result).toContain("Body text.");
  });

  it("returns body only (without leading newline) when frontmatter is empty", () => {
    const result = serializeFrontmatter({}, "\nBody only.");
    expect(result).toBe("Body only.");
  });

  it("serializes array values as YAML lists", () => {
    const result = serializeFrontmatter({ paths: ["src/**/*.ts"] }, "body");
    expect(result).toContain("paths:");
    expect(result).toContain('  - "src/**/*.ts"');
  });

  it("serializes boolean values without quotes", () => {
    const result = serializeFrontmatter({ alwaysApply: false }, "body");
    expect(result).toContain("alwaysApply: false");
  });

  it("round-trips: parse then serialize preserves content", () => {
    const original = "---\nname: 'my-agent'\ndescription: 'A test'\n---\nBody text.";
    const { frontmatter, body } = parseFrontmatter(original);
    const result = serializeFrontmatter(frontmatter, body);
    const reparsed = parseFrontmatter(result);
    expect(reparsed.frontmatter).toEqual(frontmatter);
    expect(reparsed.body).toBe(body);
  });
});

describe("parseFrontmatter() — block scalars", () => {
  it("parses literal block scalar (|) preserving newlines", () => {
    const content = "---\ndescription: |\n  line one\n  line two\n---\nbody";
    const { frontmatter } = parseFrontmatter(content);
    expect(typeof frontmatter.description).toBe("string");
    expect(frontmatter.description as string).toContain("line one");
    expect(frontmatter.description as string).toContain("line two");
  });

  it("parses folded block scalar (>) joining lines with space", () => {
    const content = "---\ndescription: >\n  folded line one\n  folded line two\n---\nbody";
    const { frontmatter } = parseFrontmatter(content);
    expect(typeof frontmatter.description).toBe("string");
    expect((frontmatter.description as string).trim()).toContain("folded line one");
  });

  it("parses null scalar value", () => {
    const content = "---\nvalue: null\n---\nbody";
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.value).toBeNull();
  });

  it("parses inline JSON array string as array", () => {
    const content = '---\ntools: ["read","write"]\n---\nbody';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.tools).toEqual(["read", "write"]);
  });

  it("falls back to string for malformed inline JSON array", () => {
    const content = "---\ntools: [invalid json}\n---\nbody";
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.tools).toBe("[invalid json}");
  });
});

/**
 * The branches mutation found unguarded.
 *
 * Frontmatter is where every tool profile meets the content it rewrites, so a change
 * here is a change everywhere. Sixty of the kernel's surviving mutants were in this
 * module, and the clusters below are what they pointed at: the quoting decisions, the
 * delimiter checks, and the shape of an empty document.
 */
describe("frontmatter, at the edges", () => {
  it("keeps a glob quoted so YAML cannot read it as a pattern", () => {
    const out = serializeFrontmatter({ globs: ["*.ts", "a?b", "{x,y}"] }, "body");
    expect(out).toContain('  - "*.ts"');
    expect(out).toContain('  - "a?b"');
    expect(out).toContain('  - "{x,y}"');
  });

  it("leaves an ordinary list item unquoted", () => {
    expect(serializeFrontmatter({ tags: ["plain"] }, "body")).toContain("  - plain");
  });

  it("emits a JSON-array string raw, so it stays an inline YAML array", () => {
    expect(serializeFrontmatter({ globs: '["a","b"]' }, "body")).toContain('globs: ["a","b"]');
  });

  it("doubles an apostrophe rather than ending the quoted string early", () => {
    expect(serializeFrontmatter({ name: "it's" }, "body")).toContain("name: 'it''s'");
  });

  it("writes a boolean bare, not quoted", () => {
    expect(serializeFrontmatter({ enabled: true }, "body")).toContain("enabled: true");
    expect(serializeFrontmatter({ enabled: false }, "body")).toContain("enabled: false");
  });

  it("returns the body untouched when there is no frontmatter to write", () => {
    expect(serializeFrontmatter({}, "just a body")).toBe("just a body");
  });

  it("drops one leading newline, and only one, when there is no frontmatter", () => {
    expect(serializeFrontmatter({}, "\n\nbody")).toBe("\nbody");
  });

  it("treats a document whose first line is not the delimiter as all body", () => {
    const { frontmatter, body } = parseFrontmatter("no delimiter\n---\nlate");
    expect(frontmatter).toEqual({});
    expect(body).toBe("no delimiter\n---\nlate");
  });

  it("treats an unterminated frontmatter block as all body", () => {
    const content = "---\nname: x\nstill open";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it("accepts a delimiter carrying trailing spaces", () => {
    const { frontmatter, body } = parseFrontmatter("---  \nname: x\n---  \nbody");
    expect(frontmatter.name).toBe("x");
    expect(body).toBe("body");
  });

  it("reads an empty frontmatter block and keeps the body", () => {
    const { frontmatter, body } = parseFrontmatter("---\n---\nbody");
    expect(frontmatter).toEqual({});
    expect(body).toBe("body");
  });
});
