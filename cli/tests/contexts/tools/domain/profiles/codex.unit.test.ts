import { describe, expect, it } from "vitest";
import {
  mergeCodexConfigToml,
  stripCodexSkillFrontmatter,
} from "../../../../../src/contexts/tools/domain/profiles/codex/build.js";
import { codex } from "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { getToolConfig } from "../../../../../src/contexts/tools/domain/registry.js";
import { serializeFrontmatter } from "../../../../../src/kernel/markdown.js";

describe("codex", () => {
  it("has toolId codex", () => {
    expect(codex.toolId).toBe("codex");
  });

  it("has .codex/ directory", () => {
    expect(codex.directory).toBe(".codex/");
  });

  it("has .codex.md tool suffix", () => {
    expect(codex.toolSuffix).toBe(".codex.md");
  });

  it("has signalDir pointing at .codex/commands", () => {
    expect(codex.signalDir).toBe(".codex/commands");
  });

  it("is registered in the tool registry", () => {
    const config = getToolConfig("codex");
    expect(config.toolId).toBe("codex");
  });

  describe("capabilities.skills.buildInstallPath()", () => {
    it("builds path under .agents/skills/aidd-{name}/SKILL.md", () => {
      const path = codex.capabilities.skills.buildInstallPath("my-skill/SKILL.md");
      expect(path).toBe(".agents/skills/aidd-my-skill/SKILL.md");
    });

    it("strips .codex.md tool suffix", () => {
      const path = codex.capabilities.skills.buildInstallPath("my-skill.codex.md");
      expect(path).toBe(".agents/skills/aidd-my-skill/SKILL.md");
    });

    it("strips plain .md suffix from skill name", () => {
      const path = codex.capabilities.skills.buildInstallPath("my-skill.md");
      expect(path).toBe(".agents/skills/aidd-my-skill/SKILL.md");
    });
  });

  describe("capabilities.agents.buildInstallPath()", () => {
    it("builds .toml path under .codex/agents/", () => {
      const path = codex.capabilities.agents.buildInstallPath("alexia.md");
      expect(path).toBe(".codex/agents/alexia.toml");
    });
  });

  describe("capabilities.mcp", () => {
    it("outputs to .codex/config.toml", () => {
      expect(codex.capabilities.mcp.params.outputPath).toBe(".codex/config.toml");
    });

    it("consumes the mcp config name", () => {
      expect(codex.capabilities.mcp.consumes).toContain("mcp");
    });

    it("uses user-prime merge strategy", () => {
      expect(codex.capabilities.mcp.params.mergeStrategy ?? "user-prime").toBe("user-prime");
    });

    it("uses mcp_servers as entry section", () => {
      expect(codex.capabilities.mcp.params.entrySection).toBe("mcp_servers");
    });
  });

  describe("capabilities.hooks", () => {
    it("outputs to .codex/hooks.json", () => {
      expect(codex.capabilities.hooks.buildOutputPath()).toBe(".codex/hooks.json");
    });

    it("consumes the codex-hooks config name", () => {
      expect(codex.capabilities.hooks.consumes).toContain("codex-hooks");
    });

    it("uses user-prime merge strategy", () => {
      expect(codex.capabilities.hooks.getMergeStrategy()).toBe("user-prime");
    });

    it("uses SessionStart as entry section", () => {
      expect(codex.capabilities.hooks.getEntrySection()).toBe("SessionStart");
    });

    it("returns null entry section for unknown config names", () => {
      const cap = [codex.capabilities.mcp, codex.capabilities.hooks].find((c) =>
        c.consumes.includes("unknown")
      );
      expect(cap).toBeUndefined();
    });
  });

  describe("capabilities.commands.buildInstallPath()", () => {
    it("maps phase-prefixed path to .codex/commands/aidd/<phase>/ subfolder", () => {
      const path = codex.capabilities.commands.buildInstallPath("04_code/implement.md");
      expect(path).toBe(".codex/commands/aidd/04/implement.md");
    });

    it("maps top-level file to .codex/commands/aidd/ without phase", () => {
      const path = codex.capabilities.commands.buildInstallPath("commit.md");
      expect(path).toBe(".codex/commands/aidd/commit.md");
    });
  });

  describe("capabilities.commands.convertFrontmatter()", () => {
    it("prefixes name with aidd:<phase>: and strips extra fields", () => {
      const fm = { name: "implement", description: "Implement", model: "sonnet" };
      const result = codex.capabilities.commands.convertFrontmatter(fm, "04_code/implement.md");
      expect(result).toEqual({ name: "aidd:04:implement", description: "Implement" });
    });
  });

  describe("capabilities.rules.buildInstallPath()", () => {
    it("builds path for rules under .codex/rules/", () => {
      const path = codex.capabilities.rules.buildInstallPath("01-standards/naming.md");
      expect(path).toBe(".codex/rules/01-standards/naming.md");
    });

    it("strips .codex.md tool suffix from rules path", () => {
      const path = codex.capabilities.rules.buildInstallPath("01-standards/naming.codex.md");
      expect(path).toBe(".codex/rules/01-standards/naming.md");
    });
  });

  describe("capabilities.rules.convertFrontmatter()", () => {
    it("passes frontmatter through unchanged", () => {
      const fm = { paths: ["src/**/*.ts"], description: "TS rules" };
      const result = codex.capabilities.rules.convertFrontmatter(fm);
      expect(result).toEqual(fm);
    });
  });

  describe("capabilities.plugins", () => {
    it("declares native codex CLI activation, with the verbs codex uses", () => {
      expect(codex.capabilities.plugins.nativeActivation).toEqual({
        binary: "codex",
        upgradeVerb: "upgrade",
        enableVerb: "add",
      });
    });

    it("does not write a project-local marketplace settings file", () => {
      expect(codex.capabilities.plugins.marketplaceSettings).toBeNull();
    });

    it("keeps the marketplace translation mode", () => {
      expect(codex.capabilities.plugins.translationMode).toBe("marketplace");
    });
  });
});

const MCP_PAYLOAD = `
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@anthropic-ai/mcp-playwright"]
`;

describe("mergeCodexConfigToml", () => {
  it("writes full payload into empty file", () => {
    const result = mergeCodexConfigToml("", MCP_PAYLOAD);
    expect(result).toContain("mcp_servers");
    expect(result).toContain("playwright");
    expect(result).toContain("project_doc_max_bytes = 262144");
    expect(result).toContain("hooks = true");
  });

  it("preserves user keys not managed by AIDD", () => {
    const existing = `
[user_section]
custom_key = "user value"
`;
    const result = mergeCodexConfigToml(existing, MCP_PAYLOAD);
    expect(result).toContain('custom_key = "user value"');
    expect(result).toContain("playwright");
  });

  it("is idempotent on second run", () => {
    const first = mergeCodexConfigToml("", MCP_PAYLOAD);
    const second = mergeCodexConfigToml(first, MCP_PAYLOAD);
    expect(second).toContain("playwright");
    const mcpCount = (second.match(/\[mcp_servers\.playwright\]/g) ?? []).length;
    expect(mcpCount).toBe(1);
  });

  it("existing MCP server wins on conflict (user-prime)", () => {
    const existing = `
[mcp_servers.playwright]
command = "user-command"
`;
    const result = mergeCodexConfigToml(existing, MCP_PAYLOAD);
    expect(result).toContain('command = "user-command"');
    expect(result).not.toContain('"npx"');
  });

  it("preserves user project_doc_max_bytes when above minimum", () => {
    const existing = `project_doc_max_bytes = 999999`;
    const result = mergeCodexConfigToml(existing, MCP_PAYLOAD);
    expect(result).toContain("project_doc_max_bytes = 999999");
    expect(result).not.toContain("262144");
  });

  it("sets minimum project_doc_max_bytes when absent", () => {
    const result = mergeCodexConfigToml("", MCP_PAYLOAD);
    expect(result).toContain("project_doc_max_bytes = 262144");
  });

  it("ensures hooks feature when absent", () => {
    const result = mergeCodexConfigToml("", MCP_PAYLOAD);
    expect(result).toContain("hooks = true");
  });

  it("preserves user codex_hooks value when already set", () => {
    const existing = `
[features]
codex_hooks = false
`;
    const result = mergeCodexConfigToml(existing, MCP_PAYLOAD);
    expect(result).toContain("codex_hooks = false");
    expect(result).not.toContain("hooks = true");
  });

  it("does NOT emit [[skills.config]] — discovery is by placement", () => {
    const result = mergeCodexConfigToml("", MCP_PAYLOAD);
    expect(result).not.toContain(".agents/skills");
    expect(result).not.toContain("skills.config");
  });

  it("preserves existing skills.config if user has one", () => {
    const existing = `
[skills.config]
path = ".agents/skills"
enabled = true
`;
    const result = mergeCodexConfigToml(existing, MCP_PAYLOAD);
    expect(result).toContain(".agents/skills");
  });
});

/**
 * What a skill's frontmatter becomes on its way to Codex.
 *
 * Codex is the only target that re-serialises skill frontmatter instead of passing the
 * file through, so its output diverges from the source bytes by design. That divergence
 * went unrecorded for a month: the golden's codex cell still held the source hashes, and
 * nothing compared it, because only `claude` was frozen. Freezing the nine surfaced it.
 *
 * These pin the transform itself, so those thirty golden hashes are not guarded solely by
 * the snapshot that recorded them.
 */
describe("a skill's frontmatter, rewritten for Codex", () => {
  const rebuild = (fm: Record<string, unknown>) =>
    serializeFrontmatter(stripCodexSkillFrontmatter(fm), "body\n");

  it("keeps the three fields Codex reads", () => {
    expect(
      stripCodexSkillFrontmatter({
        name: "aidd-dev:01:plan",
        description: "Plan things",
        allowed_tools: ["Read"],
      })
    ).toEqual({ name: "aidd-dev:01:plan", description: "Plan things", allowed_tools: ["Read"] });
  });

  it("drops the fields it does not, rather than passing them through", () => {
    // `model` is the one the framework ships and Codex has no use for.
    expect(stripCodexSkillFrontmatter({ name: "n", description: "d", model: "opus" })).toEqual({
      name: "n",
      description: "d",
    });
  });

  it("omits a field the source never set", () => {
    expect(stripCodexSkillFrontmatter({ description: "d" })).toEqual({ description: "d" });
  });

  it("quotes a value whose colon would otherwise make the frontmatter unreadable", () => {
    // This is not cosmetic. Two skills shipped in the pinned release carry a description
    // containing ": " — `js-yaml` refuses the source outright with "bad indentation of a
    // mapping entry". Re-serialising with quotes is what makes the installed file parse.
    expect(rebuild({ name: "aidd-context:03:context-generate", description: "Do a: thing" })).toBe(
      "---\nname: 'aidd-context:03:context-generate'\ndescription: 'Do a: thing'\n---\nbody\n"
    );
  });

  it("escapes a quote in the value rather than closing the string early", () => {
    expect(rebuild({ description: "it's here" })).toBe(
      "---\ndescription: 'it''s here'\n---\nbody\n"
    );
  });
});
