import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeCodexConfigToml,
  stripCodexSkillFrontmatter,
} from "../../../../../src/contexts/tools/domain/profiles/codex/build.js";
import {
  codex,
  mergeCodexHooksJson,
  rewriteCodexContent,
} from "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
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

    it("keeps a skill name that carries no extension at all", () => {
      const path = codex.capabilities.skills.buildInstallPath("my-skill");
      expect(path).toBe(".agents/skills/aidd-my-skill/SKILL.md");
    });
  });

  it("names the one config file Codex reads, and where it goes", () => {
    expect(codex.configOutputPaths).toStrictEqual({ "config.toml": ".codex/config.toml" });
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

    it("writes its config in TOML", () => {
      expect(codex.capabilities.mcp.params.format).toBe("toml");
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
    it("declares native codex CLI activation, with the verbs codex uses, and nothing else", () => {
      const activation = codex.capabilities.plugins.nativeActivation;
      // Exhaustive, not `toMatchObject`: a field added by mistake must fail here rather than
      // escape. `pluginCacheDir` is `expect.any(Function)`, since a function matches no literal.
      expect(activation).toEqual({
        binary: "codex",
        upgradeVerb: "upgrade",
        enableVerb: "add",
        disableVerb: "remove",
        pluginCacheDir: expect.any(Function),
        userSettingsPath: expect.any(Function),
      });
    });

    it("declares its own plugin cache root, so clean can purge the empty shell codex leaves behind", () => {
      const pluginCacheDir = codex.capabilities.plugins.nativeActivation?.pluginCacheDir;
      expect(pluginCacheDir?.("/home/tester")).toBe(
        join("/home/tester", ".codex", "plugins", "cache")
      );
    });

    describe("nativeActivation.userSettingsPath()", () => {
      const environment = (vars: Record<string, string>) => (name: string) => vars[name];

      it("falls back to ~/.codex/config.toml when CODEX_HOME is unset", () => {
        const userSettingsPath = codex.capabilities.plugins.nativeActivation?.userSettingsPath;
        expect(userSettingsPath?.("/home/tester", environment({}))).toBe(
          join("/home/tester", ".codex", "config.toml")
        );
      });

      it("follows CODEX_HOME when a real machine has it set — the real codex binary reads there, not ~/.codex", () => {
        const userSettingsPath = codex.capabilities.plugins.nativeActivation?.userSettingsPath;
        expect(
          userSettingsPath?.("/home/tester", environment({ CODEX_HOME: "/somewhere/else" }))
        ).toBe(join("/somewhere/else", "config.toml"));
      });
    });

    it("does not write a project-local marketplace settings file", () => {
      expect(codex.capabilities.plugins.marketplaceSettings).toBeNull();
    });

    it("keeps the marketplace translation mode", () => {
      expect(codex.capabilities.plugins.translationMode).toBe("marketplace");
    });

    it("warns that Codex runs no hook it has not been told to trust, and how to tell it", () => {
      expect(codex.capabilities.plugins.hooksTrustNotice).toBe(
        "Codex will not run this plugin's hooks until each one is trusted — approve the prompt " +
          "once in an interactive session, or pass --dangerously-bypass-hook-trust to codex exec " +
          "for a headless run. Until then, a session leaves no run journal and nothing says why."
      );
    });
  });
});

describe("rewriteCodexContent()", () => {
  it("sends a skill reference to the agents directory Codex scans, under its aidd- prefix", () => {
    expect(rewriteCodexContent("Read .codex/skills/01-plan/SKILL.md\n")).toBe(
      "Read .agents/skills/aidd-01-plan/SKILL.md\n"
    );
  });

  it("routes a numbered command folder under commands/aidd/<phase>/, with or without the @ prefix", () => {
    expect(
      rewriteCodexContent(
        "Run .codex/commands/04_code/implement.md, then @.codex/commands/02-plan/plan.md.\n"
      )
    ).toBe("Run .codex/commands/aidd/04/implement.md, then @.codex/commands/aidd/02/plan.md.\n");
  });
});

describe("mergeCodexHooksJson()", () => {
  const AIDD_ENTRY = {
    matcher: "startup|resume",
    hooks: [
      {
        type: "command",
        command: "node .aidd/scripts/update_memory.cjs",
        statusMessage: "Syncing AIDD memory...",
        timeout: 30,
      },
    ],
  };

  it("subscribes the memory refresh to a fresh session, on startup and on resume", () => {
    expect(mergeCodexHooksJson("")).toBe(JSON.stringify({ SessionStart: [AIDD_ENTRY] }, null, 2));
  });

  it("keeps a user's own hooks and appends the memory refresh after them", () => {
    const existing = JSON.stringify({
      PreToolUse: [{ hooks: [{ type: "command", command: "user.sh" }] }],
      SessionStart: [{ hooks: [{ type: "command", command: "user-start.sh" }] }],
    });

    expect(mergeCodexHooksJson(existing)).toBe(
      JSON.stringify(
        {
          PreToolUse: [{ hooks: [{ type: "command", command: "user.sh" }] }],
          SessionStart: [{ hooks: [{ type: "command", command: "user-start.sh" }] }, AIDD_ENTRY],
        },
        null,
        2
      )
    );
  });

  it("adds nothing on a second run over its own output", () => {
    const once = mergeCodexHooksJson("");
    expect(mergeCodexHooksJson(once)).toBe(once);
  });

  it("starts over from a file it cannot read rather than failing the install", () => {
    expect(mergeCodexHooksJson("{ not json")).toBe(
      JSON.stringify({ SessionStart: [AIDD_ENTRY] }, null, 2)
    );
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
 * Codex is the only target that re-serialises skill frontmatter instead of passing the file
 * through, so these pin the transform itself rather than the golden that recorded its output.
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
    // Not cosmetic: a description containing ": " makes `js-yaml` refuse the source with "bad
    // indentation of a mapping entry". Re-serialising with quotes is what makes it parse.
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
