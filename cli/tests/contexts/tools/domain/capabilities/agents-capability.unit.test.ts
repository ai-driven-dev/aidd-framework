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
