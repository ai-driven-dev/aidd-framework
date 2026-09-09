import { describe, expect, it } from "vitest";
import { codexAgentMarkdownToToml } from "../../../../../../src/contexts/tools/domain/profiles/codex/codex-agent-toml.js";
import { parseToml } from "../../../../../../src/contexts/tools/domain/profiles/codex/toml.js";

describe("codexAgentMarkdownToToml()", () => {
  describe("name resolution (D-16)", () => {
    describe("marketplace mode (prefixName=false, default)", () => {
      it("uses frontmatter name when present", () => {
        const toml = codexAgentMarkdownToToml(
          "---\nname: planner\ndescription: A planner.\n---\n\nBody.",
          "aidd-dev",
          "planner.md"
        );
        const parsed = parseToml(toml);
        expect(parsed.name).toBe("planner");
      });

      it("falls back to plugin-prefixed basename when frontmatter name is absent", () => {
        const toml = codexAgentMarkdownToToml(
          "---\ndescription: A reviewer.\n---\n\nBody.",
          "aidd-dev",
          "reviewer.md"
        );
        const parsed = parseToml(toml);
        expect(parsed.name).toBe("aidd-dev-reviewer");
      });

      it("falls back to plugin-prefixed basename when frontmatter is empty", () => {
        const toml = codexAgentMarkdownToToml("No frontmatter here.", "aidd-dev", "implementer.md");
        const parsed = parseToml(toml);
        expect(parsed.name).toBe("aidd-dev-implementer");
      });
    });

    describe("flat mode (prefixName=true)", () => {
      it("always uses plugin-prefixed basename (ignores frontmatter name)", () => {
        const toml = codexAgentMarkdownToToml(
          "---\nname: planner\ndescription: A planner.\n---\n\nBody.",
          "aidd-dev",
          "planner.md",
          true
        );
        const parsed = parseToml(toml);
        expect(parsed.name).toBe("aidd-dev-planner");
      });

      it("uses plugin-prefix when frontmatter name is absent", () => {
        const toml = codexAgentMarkdownToToml(
          "---\ndescription: A reviewer.\n---\n\nBody.",
          "aidd-dev",
          "reviewer.md",
          true
        );
        const parsed = parseToml(toml);
        expect(parsed.name).toBe("aidd-dev-reviewer");
      });

      it("uses plugin-prefix when frontmatter is empty", () => {
        const toml = codexAgentMarkdownToToml(
          "No frontmatter here.",
          "aidd-dev",
          "implementer.md",
          true
        );
        const parsed = parseToml(toml);
        expect(parsed.name).toBe("aidd-dev-implementer");
      });
    });
  });

  describe("key order (D-15)", () => {
    it("emits name before description before developer_instructions", () => {
      const toml = codexAgentMarkdownToToml(
        "---\nname: planner\ndescription: A planner.\n---\n\nBody here.",
        "aidd-dev",
        "planner.md"
      );
      const nameIdx = toml.indexOf("name =");
      const descIdx = toml.indexOf("description =");
      const instrIdx = toml.indexOf("developer_instructions =");
      expect(nameIdx).toBeLessThan(descIdx);
      expect(descIdx).toBeLessThan(instrIdx);
    });

    it("emits name before developer_instructions when description absent", () => {
      const toml = codexAgentMarkdownToToml(
        "---\nname: planner\n---\n\nBody here.",
        "aidd-dev",
        "planner.md"
      );
      const nameIdx = toml.indexOf("name =");
      const instrIdx = toml.indexOf("developer_instructions =");
      expect(nameIdx).toBeLessThan(instrIdx);
    });
  });

  describe("model omission (D-5)", () => {
    it("omits model key when frontmatter has model: opus", () => {
      const toml = codexAgentMarkdownToToml(
        "---\nname: planner\ndescription: A planner.\nmodel: opus\n---\n\nBody.",
        "aidd-dev",
        "planner.md"
      );
      expect(toml).not.toContain("model");
    });

    it("omits model key when frontmatter has model: sonnet", () => {
      const toml = codexAgentMarkdownToToml(
        "---\nname: planner\nmodel: sonnet\n---\n\nBody.",
        "aidd-dev",
        "planner.md"
      );
      expect(toml).not.toContain("model");
    });

    it("omits model key for hypothetical Codex model id (MVP1 always omits)", () => {
      const toml = codexAgentMarkdownToToml(
        "---\nname: planner\nmodel: gpt-5-codex\n---\n\nBody.",
        "aidd-dev",
        "planner.md"
      );
      expect(toml).not.toContain("model");
    });
  });

  describe("verbatim body preservation (D-4)", () => {
    it("preserves @./ references untouched in developer_instructions", () => {
      const body = "See @./foo.md for details.";
      const toml = codexAgentMarkdownToToml(
        `---\nname: agent\n---\n\n${body}`,
        "aidd-dev",
        "agent.md"
      );
      const parsed = parseToml(toml);
      expect(parsed.developer_instructions).toContain("@./foo.md");
    });

    it("preserves @../ references untouched in developer_instructions", () => {
      const body = "See @../bar.md for details.";
      const toml = codexAgentMarkdownToToml(
        `---\nname: agent\n---\n\n${body}`,
        "aidd-dev",
        "agent.md"
      );
      const parsed = parseToml(toml);
      expect(parsed.developer_instructions).toContain("@../bar.md");
    });

    it("preserves @CLAUDE_PLUGIN_ROOT/ references untouched in developer_instructions", () => {
      // Use split literal to avoid biome noTemplateCurlyInString warning
      const claudeRootRef = "@$" + "{CLAUDE_PLUGIN_ROOT}/agents/planner.md";
      const toml = codexAgentMarkdownToToml(
        `---\nname: agent\n---\n\n${claudeRootRef}`,
        "aidd-dev",
        "agent.md"
      );
      const parsed = parseToml(toml);
      expect(typeof parsed.developer_instructions).toBe("string");
      const instr = parsed.developer_instructions as string;
      const claudeRoot = "$" + "{CLAUDE_PLUGIN_ROOT}";
      expect(instr).toContain(claudeRoot);
    });

    it("preserves all three reference forms together", () => {
      // Use split literals to avoid biome noTemplateCurlyInString warning
      const claudeRootRef = "@$" + "{CLAUDE_PLUGIN_ROOT}/baz.md";
      const body = `@./foo.md\n@../bar.md\n${claudeRootRef}`;
      const content = `---\nname: agent\n---\n\n${body}`;
      const toml = codexAgentMarkdownToToml(content, "aidd-dev", "agent.md");
      const parsed = parseToml(toml);
      const instr = parsed.developer_instructions as string;
      const claudeRoot = "$" + "{CLAUDE_PLUGIN_ROOT}";
      expect(instr).toContain("@./foo.md");
      expect(instr).toContain("@../bar.md");
      expect(instr).toContain(claudeRoot);
    });
  });

  describe("idempotency (AC #2, D-15)", () => {
    it("produces byte-identical output on two consecutive calls with identical input", () => {
      const content =
        "---\nname: planner\ndescription: A planner.\nmodel: opus\n---\n\nBody with code:\n```bash\necho hi\n```\n";
      const first = codexAgentMarkdownToToml(content, "aidd-dev", "planner.md");
      const second = codexAgentMarkdownToToml(content, "aidd-dev", "planner.md");
      expect(first).toBe(second);
    });
  });

  describe("TOML validity and round-trip", () => {
    it("produces valid TOML that parses successfully", () => {
      const content =
        "---\nname: implementer\ndescription: Implements code.\n---\n\n# Role\nYou implement code.";
      const toml = codexAgentMarkdownToToml(content, "aidd-dev", "implementer.md");
      expect(() => parseToml(toml)).not.toThrow();
    });

    it("round-trips body containing code fences, headings, and special chars", () => {
      const body = '# Heading\n\n```yaml\nkey: "value"\n```\n\nSome text with backslash: \\.';
      // parseFrontmatter includes the blank separator line as leading \n in body
      const content = `---\nname: agent\ndescription: Complex agent.\n---\n${body}`;
      const toml = codexAgentMarkdownToToml(content, "aidd-dev", "agent.md");
      const parsed = parseToml(toml);
      expect(parsed.developer_instructions).toBe(body);
    });

    it("round-trips name with quotes and special chars", () => {
      const content = "---\nname: 'my \"agent\"'\ndescription: Has quotes.\n---\n\nBody.";
      const toml = codexAgentMarkdownToToml(content, "aidd-dev", "agent.md");
      const parsed = parseToml(toml);
      expect(typeof parsed.name).toBe("string");
    });
  });

  describe("empty frontmatter", () => {
    it("always emits description (defaults to empty string when absent)", () => {
      const toml = codexAgentMarkdownToToml("No frontmatter.", "aidd-dev", "agent.md");
      const parsed = parseToml(toml);
      expect(parsed.developer_instructions).toBeDefined();
      // description is a required subagent key; always emitted even when absent in source.
      expect(parsed.description).toBe("");
    });
  });
});
