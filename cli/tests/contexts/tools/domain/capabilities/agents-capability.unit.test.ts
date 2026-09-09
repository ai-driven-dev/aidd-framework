import { describe, expect, it } from "vitest";
import { AgentsCapability } from "../../../../../src/contexts/tools/domain/capabilities/agents-capability.js";

describe("AgentsCapability", () => {
  const markdownParams = {
    directory: ".claude/",
    toolSuffix: ".claude.md",
    format: "markdown" as const,
  };

  const tomlParams = {
    directory: ".codex/",
    toolSuffix: ".codex.md",
    format: "toml" as const,
  };

  describe("buildOutputPath", () => {
    it("combines directory, agents folder, name, and tool suffix", () => {
      const cap = new AgentsCapability(markdownParams);
      expect(cap.buildOutputPath("my-agent")).toBe(".claude/agents/my-agent.claude.md");
    });

    it("uses toml params when format is toml", () => {
      const cap = new AgentsCapability(tomlParams);
      expect(cap.buildOutputPath("my-agent")).toBe(".codex/agents/my-agent.codex.md");
    });
  });

  describe("accepts", () => {
    it("returns true when path starts with directory", () => {
      const cap = new AgentsCapability(markdownParams);
      expect(cap.accepts(".claude/agents/foo.md")).toBe(true);
    });

    it("returns false when path does not start with directory", () => {
      const cap = new AgentsCapability(markdownParams);
      expect(cap.accepts(".cursor/agents/foo.md")).toBe(false);
    });
  });

  describe("serialize (markdown)", () => {
    it("produces frontmatter-delimited markdown content", () => {
      const cap = new AgentsCapability(markdownParams);
      const result = cap.serialize({ name: "my-agent", description: "A test" }, "Body text.");
      expect(result).toContain("---");
      expect(result).toContain("name: 'my-agent'");
      expect(result).toContain("Body text.");
    });
  });

  describe("serialize (toml)", () => {
    it("produces TOML format with name, description, and developer_instructions", () => {
      const cap = new AgentsCapability(tomlParams);
      const result = cap.serialize({ name: "my-agent", description: "A test" }, "Body text.");
      expect(result).toContain('name = "my-agent"');
      expect(result).toContain('description = "A test"');
      expect(result).toContain("developer_instructions");
      expect(result).toContain("Body text.");
    });

    it("includes model field when provided", () => {
      const cap = new AgentsCapability(tomlParams);
      const result = cap.serialize(
        { name: "agent", description: "desc", model: "claude-3" },
        "body"
      );
      expect(result).toContain('model = "claude-3"');
    });
  });

  describe("deserialize", () => {
    it("parses frontmatter and body from markdown content", () => {
      const cap = new AgentsCapability(markdownParams);
      const content = "---\nname: my-agent\ndescription: A test\n---\nBody text.";
      const { frontmatter, body } = cap.deserialize(content);
      expect(frontmatter).toEqual({ name: "my-agent", description: "A test" });
      expect(body).toBe("Body text.");
    });

    it("returns empty frontmatter when no delimiter present", () => {
      const cap = new AgentsCapability(markdownParams);
      const { frontmatter, body } = cap.deserialize("plain body");
      expect(frontmatter).toEqual({});
      expect(body).toBe("plain body");
    });
  });

  describe("equals", () => {
    it("returns true for identical params", () => {
      const a = new AgentsCapability(markdownParams);
      const b = new AgentsCapability({ ...markdownParams });
      expect(a.equals(b)).toBe(true);
    });

    it("returns false when directory differs", () => {
      const a = new AgentsCapability(markdownParams);
      const b = new AgentsCapability({ ...markdownParams, directory: ".cursor/" });
      expect(a.equals(b)).toBe(false);
    });

    it("returns false when format differs", () => {
      const a = new AgentsCapability(markdownParams);
      const b = new AgentsCapability({ ...markdownParams, format: "toml" });
      expect(a.equals(b)).toBe(false);
    });
  });
});

describe("AgentsCapability install paths", () => {
  const markdown = new AgentsCapability({
    directory: ".claude/",
    toolSuffix: ".claude.md",
    format: "markdown",
  });
  const toml = new AgentsCapability({
    directory: ".codex/",
    toolSuffix: ".codex.md",
    format: "toml",
  });

  it("installs a markdown agent under agents/ by its file name alone, the tool suffix dropped", () => {
    expect(markdown.buildInstallPath("a/b/planner.claude.md")).toBe(".claude/agents/planner.md");
  });

  it("leaves a markdown file carrying another tool's suffix as it is named", () => {
    expect(markdown.buildInstallPath("planner.cursor.md")).toBe(".claude/agents/planner.cursor.md");
  });

  it("installs a toml agent as .toml whether the source carried the tool suffix, .md, or neither", () => {
    expect(toml.buildInstallPath("sub/planner.codex.md")).toBe(".codex/agents/planner.toml");
    expect(toml.buildInstallPath("planner.md")).toBe(".codex/agents/planner.toml");
    expect(toml.buildInstallPath("planner.txt")).toBe(".codex/agents/planner.txt.toml");
  });

  it("asks the installer the tool declares before deriving a path itself", () => {
    const delegating = new AgentsCapability({
      directory: ".x/",
      toolSuffix: ".x.md",
      format: "markdown",
      buildInstallPath: (fileName) => `custom/${fileName}`,
    });

    expect(delegating.buildInstallPath("planner.x.md")).toBe("custom/planner.x.md");
  });
});

describe("AgentsCapability file acceptance", () => {
  const cap = new AgentsCapability({
    directory: ".claude/",
    toolSuffix: ".claude.md",
    format: "markdown",
  });
  const suffixes = [".claude.md", ".cursor.md", ".codex.md"];

  it("accepts its own suffix and a suffix belonging to no tool", () => {
    expect(cap.acceptsFileName("planner.claude.md", suffixes)).toBe(true);
    expect(cap.acceptsFileName("planner.md", suffixes)).toBe(true);
  });

  it("refuses another tool's suffix wherever the file sits", () => {
    expect(cap.acceptsFileName("a/b/planner.cursor.md", suffixes)).toBe(false);
  });
});

describe("AgentsCapability frontmatter conversion", () => {
  const markdown = new AgentsCapability({
    directory: ".claude/",
    toolSuffix: ".claude.md",
    format: "markdown",
  });
  const toml = new AgentsCapability({
    directory: ".codex/",
    toolSuffix: ".codex.md",
    format: "toml",
  });

  it("keeps the declared name and description, nothing else", () => {
    expect(
      markdown.convertFrontmatter({ name: "planner", description: "d", tools: ["x"] })
    ).toStrictEqual({ name: "planner", description: "d" });
  });

  it("derives the name from the file's own base name when the frontmatter declares none", () => {
    expect(
      markdown.convertFrontmatter({ description: "d" }, "agents/sub/planner.md")
    ).toStrictEqual({ name: "planner", description: "d" });
  });

  it("leaves the name undefined when neither the frontmatter nor a file name gives one", () => {
    expect(markdown.convertFrontmatter({ description: "d" })).toStrictEqual({
      name: undefined,
      description: "d",
    });
  });

  it("refuses a declared name that is not a string", () => {
    expect(markdown.convertFrontmatter({ name: 7, description: "d" })).toStrictEqual({
      name: undefined,
      description: "d",
    });
  });

  it("carries the model into a toml agent only when one is declared", () => {
    expect(toml.convertFrontmatter({ name: "p", description: "d", model: "m" })).toStrictEqual({
      name: "p",
      description: "d",
      model: "m",
    });
    expect(toml.convertFrontmatter({ name: "p", description: "d" })).toStrictEqual({
      name: "p",
      description: "d",
    });
  });

  it("asks the converter the tool declares before converting itself", () => {
    const delegating = new AgentsCapability({
      directory: ".x/",
      toolSuffix: ".x.md",
      format: "markdown",
      convertFrontmatter: (fm, fileName) => ({ file: fileName, keys: Object.keys(fm) }),
    });

    expect(delegating.convertFrontmatter({ name: "p" }, "p.md")).toStrictEqual({
      file: "p.md",
      keys: ["name"],
    });
  });
});

describe("AgentsCapability toml serialization", () => {
  const toml = new AgentsCapability({
    directory: ".codex/",
    toolSuffix: ".codex.md",
    format: "toml",
  });

  it("writes name, description and the body as developer instructions, one key per line", () => {
    expect(toml.serialize({ name: "p", description: "d" }, "body")).toBe(
      'name = "p"\ndescription = "d"\ndeveloper_instructions = """\nbody\n"""\n'
    );
  });

  it("writes an empty name and description when the frontmatter declares none", () => {
    expect(toml.serialize({}, "body")).toBe(
      'name = ""\ndescription = ""\ndeveloper_instructions = """\nbody\n"""\n'
    );
  });

  it("escapes a quote and a backslash inside a value", () => {
    expect(toml.serialize({ name: 'a"b\\c', description: "d" }, "body")).toBe(
      'name = "a\\"b\\\\c"\ndescription = "d"\ndeveloper_instructions = """\nbody\n"""\n'
    );
  });
});

describe("AgentsCapability equality", () => {
  const base = { directory: ".claude/", toolSuffix: ".claude.md", format: "markdown" as const };

  it("differs on the tool suffix", () => {
    expect(
      new AgentsCapability(base).equals(new AgentsCapability({ ...base, toolSuffix: ".x.md" }))
    ).toBe(false);
  });

  it("differs on the user file extension", () => {
    expect(
      new AgentsCapability({ ...base, userFileExt: ".md" }).equals(
        new AgentsCapability({ ...base, userFileExt: ".toml" })
      )
    ).toBe(false);
  });
});
