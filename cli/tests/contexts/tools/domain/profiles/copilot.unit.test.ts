import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copilot } from "../../../../../src/contexts/tools/domain/profiles/copilot/profile.js";

describe("copilot", () => {
  describe("capabilities.rules.convertFrontmatter()", () => {
    it("converts paths: list to applyTo: comma-joined string", () => {
      const result = copilot.capabilities.rules?.convertFrontmatter({
        paths: ["src/**/*.ts"],
      });
      expect(result).toHaveProperty("applyTo", "src/**/*.ts");
      expect(result).not.toHaveProperty("paths");
    });

    it("returns empty frontmatter when paths is empty", () => {
      const result = copilot.capabilities.rules?.convertFrontmatter({ paths: [] });
      expect(result).toEqual({});
    });

    it("returns empty frontmatter when no paths or globs (always apply)", () => {
      const result = copilot.capabilities.rules?.convertFrontmatter({});
      expect(result).toEqual({});
    });
  });

  describe("capabilities.agents.convertFrontmatter()", () => {
    it("strips extra fields for agents sections — only name and description", () => {
      const fm = { name: "alexia", description: "Agent", model: "opus" };
      const result = copilot.capabilities.agents.convertFrontmatter(fm);
      expect(result).toEqual({ name: "alexia", description: "Agent" });
    });
  });

  describe("capabilities.mcp", () => {
    it("maps mcp to .vscode/mcp.json", () => {
      expect(copilot.capabilities.mcp.params.outputPath).toBe(".vscode/mcp.json");
    });

    it("consumes the mcp config name", () => {
      expect(copilot.capabilities.mcp.consumes).toContain("mcp");
    });
  });

  describe("capabilities.settings", () => {
    const settings = Array.isArray(copilot.capabilities.settings)
      ? copilot.capabilities.settings[0]
      : copilot.capabilities.settings;

    it("writes to .vscode/settings.json", () => {
      expect(settings.params.outputPath).toBe(".vscode/settings.json");
    });

    it("uses framework-prime merge strategy", () => {
      expect(settings.getMergeStrategy()).toBe("framework-prime");
    });

    it("references vscode-settings.json asset file (not hardcoded staticContent)", () => {
      expect(settings.staticContentAssetFile).toBe("vscode-settings.json");
      expect(settings.staticContent).toBeUndefined();
    });

    it("does not consume framework signals (content is CLI-owned)", () => {
      expect(settings.consumes).toHaveLength(0);
    });

    it("declares requiresTool: vscode (gate merge to IDE-present context)", () => {
      expect(settings.requiresTool).toBe("vscode");
    });
  });

  describe("capabilities.commands.buildInstallPath()", () => {
    it("flattens commands: prefixes with phase number", () => {
      const path = copilot.capabilities.commands?.buildInstallPath("04_code/implement.md");
      expect(path).toBe(".github/prompts/04-implement.prompt.md");
    });

    it("flattens commands: converts underscores to hyphens in filename", () => {
      const path = copilot.capabilities.commands?.buildInstallPath("00_behavior/auto_accept.md");
      expect(path).toBe(".github/prompts/00-auto-accept.prompt.md");
    });

    it("handles top-level commands file without subdirectory", () => {
      const path = copilot.capabilities.commands?.buildInstallPath("commit.md");
      expect(path).toBe(".github/prompts/commit.prompt.md");
    });
  });

  describe("capabilities.rules.buildInstallPath()", () => {
    it("flattens rules: prefixes with category number, strips file numeric prefix", () => {
      const path = copilot.capabilities.rules?.buildInstallPath("01-standards/1-mermaid.md");
      expect(path).toBe(".github/instructions/01-mermaid.instructions.md");
    });

    it("flattens rules: no numeric prefix in filename — unchanged", () => {
      const path = copilot.capabilities.rules?.buildInstallPath("01-standards/naming.md");
      expect(path).toBe(".github/instructions/01-naming.instructions.md");
    });

    it("flattens rules: strips .copilot tool suffix from filename", () => {
      const path = copilot.capabilities.rules?.buildInstallPath(
        "04-tooling/ide-mapping.copilot.md"
      );
      expect(path).toBe(".github/instructions/04-ide-mapping.instructions.md");
    });

    it("returns null for .gitkeep files", () => {
      expect(copilot.capabilities.rules?.buildInstallPath("00-architecture/.gitkeep")).toBeNull();
    });
  });

  describe("capabilities.agents.buildInstallPath()", () => {
    it("adds .agent.md extension", () => {
      const path = copilot.capabilities.agents.buildInstallPath("code-reviewer.md");
      expect(path).toBe(".github/agents/code-reviewer.agent.md");
    });

    it("returns null for .gitkeep files", () => {
      expect(copilot.capabilities.agents.buildInstallPath(".gitkeep")).toBeNull();
    });
  });

  describe("capabilities.skills.buildInstallPath()", () => {
    it("preserves directory structure without flattening", () => {
      const path = copilot.capabilities.skills.buildInstallPath("commit/SKILL.md");
      expect(path).toBe(".github/skills/commit/SKILL.md");
    });
  });

  describe("capabilities.rules.convertFrontmatter() — alwaysApply", () => {
    it("returns empty frontmatter when alwaysApply is false without patterns and no description", () => {
      expect(copilot.capabilities.rules?.convertFrontmatter({ alwaysApply: false })).toEqual({});
    });

    it("keeps description when alwaysApply is false and no patterns are specified", () => {
      expect(
        copilot.capabilities.rules?.convertFrontmatter({
          description: "Apply when editing command files.",
          alwaysApply: false,
        })
      ).toEqual({ description: "Apply when editing command files." });
    });

    it("converts globs + alwaysApply: false from framework to applyTo", () => {
      expect(
        copilot.capabilities.rules?.convertFrontmatter({
          globs: ["{{TOOLS}}/rules/**/*.md"],
          alwaysApply: false,
        })
      ).toEqual({ applyTo: "{{TOOLS}}/rules/**/*.md" });
    });
  });

  describe("capabilities.plugins", () => {
    it("has a plugins capability", () => {
      expect("plugins" in copilot.capabilities).toBe(true);
    });

    it("is native mode", () => {
      expect(copilot.capabilities.plugins.mode).toBe("native");
    });

    it("uses .github/plugins/ as plugins directory", () => {
      expect(copilot.capabilities.plugins.pluginsDir).toBe(".github/plugins/");
    });

    it("uses plugin.json as plugin manifest path", () => {
      expect(copilot.capabilities.plugins.pluginManifestRelativePath).toBe("plugin.json");
    });

    it("pluginOutputDir returns correct path for a plugin name", () => {
      expect(copilot.capabilities.plugins.pluginOutputDir("my-plugin")).toBe(
        ".github/plugins/my-plugin/"
      );
    });
  });

  describe("capabilities.plugins.marketplaceSettings", () => {
    const ms = copilot.capabilities.plugins.marketplaceSettings;

    it("has marketplaceSettings configured", () => {
      expect(ms).not.toBeNull();
    });

    it("writes to .github/copilot/settings.json", () => {
      expect(ms?.settingsPath).toBe(".github/copilot/settings.json");
    });

    it("uses extraKnownMarketplaces as settings key", () => {
      expect(ms?.settingsKey).toBe("extraKnownMarketplaces");
    });

    it("uses enabledPlugins as enabled plugins key", () => {
      expect(ms?.enabledPluginsKey).toBe("enabledPlugins");
    });

    describe("the key a marketplace is recorded under", () => {
      it("keys a github marketplace by its name", () => {
        expect(
          ms?.toEntryKey({
            name: "aidd-framework",
            source: { kind: "github", repo: "ai-driven-dev/framework" },
          })
        ).toBe("aidd-framework");
      });

      it("keys a local marketplace by its name too — the source decides only whether there is a key", () => {
        expect(
          ms?.toEntryKey({ name: "my-marketplace", source: { kind: "local", path: "/dev/aidd" } })
        ).toBe("my-marketplace");
      });

      it("returns null for unsupported source kind (npm)", () => {
        const result = ms?.toEntryKey({
          name: "my-plugin",
          source: { kind: "npm", package: "my-plugin" },
        });
        expect(result).toBeNull();
      });

      it("returns null for unsupported source kind (url)", () => {
        const result = ms?.toEntryKey({
          name: "my-plugin",
          source: { kind: "url", url: "https://example.com/plugin.zip" },
        });
        expect(result).toBeNull();
      });
    });
  });
});

/** What a reference to another framework file becomes once installed for Copilot. No other gate
 * sees it: `translate` never calls `rewriteContent`, and the byte-frozen golden cell is claude,
 * whose rewrite is the identity. The whole rewritten string is asserted, never a fragment. */
describe("a reference to another framework file, installed for Copilot", () => {
  const rewrite = (content: string) => copilot.rewriteContent(content);

  describe("an @-reference, which becomes a link", () => {
    it("points an agent reference at the installed .agent.md file", () => {
      expect(rewrite("See @{{TOOLS}}/agents/executor.md for details")).toBe(
        "See [.github/agents/executor.agent.md](../../.github/agents/executor.agent.md) for details"
      );
    });

    it("points a command reference at the flattened prompt file", () => {
      expect(rewrite("Run @{{TOOLS}}/commands/01-plan/02_step.md now")).toBe(
        "Run [.github/prompts/01-02-step.prompt.md](../../.github/prompts/01-02-step.prompt.md) now"
      );
    });

    it("points a rule reference at the instructions file, numeric prefix stripped", () => {
      expect(rewrite("Read @{{TOOLS}}/rules/1-style.md")).toBe(
        "Read [.github/instructions/style.instructions.md](../../.github/instructions/style.instructions.md)"
      );
    });

    it("keeps a skill reference's directory structure, which Copilot does not flatten", () => {
      expect(rewrite("Read @{{TOOLS}}/skills/01-plan/SKILL.md")).toBe(
        "Read [.github/skills/01-plan/SKILL.md](../../.github/skills/01-plan/SKILL.md)"
      );
    });

    it("points a docs reference into the project's docs directory", () => {
      expect(rewrite("Read @{{DOCS}}/memory/testing.md")).toBe(
        "Read [aidd_docs/memory/testing.md](../../aidd_docs/memory/testing.md)"
      );
    });

    it("gives a section nobody declared a prefixed path rather than dropping the link", () => {
      expect(rewrite("Unknown @{{TOOLS}}/hooks/thing.js")).toBe(
        "Unknown [.github/hooks/thing.js](../../.github/hooks/thing.js)"
      );
    });

    it("resolves a reference to a section directory to that directory", () => {
      expect(rewrite("Everything under @{{TOOLS}}/agents/ applies")).toBe(
        "Everything under [.github/agents/](../../.github/agents/) applies"
      );
    });
  });

  describe("a plain path reference, which stays plain text", () => {
    // Frontmatter cannot hold a markdown link, so the form without the @ replaces the
    // directory prefix and nothing else.
    it("replaces the agents prefix and leaves the filename alone", () => {
      expect(rewrite("Path: {{TOOLS}}/agents/executor.md")).toBe(
        "Path: .github/agents/executor.md"
      );
    });

    it("flattens a command path, because the installed file is flattened", () => {
      expect(rewrite("Path: {{TOOLS}}/commands/01-plan/02_step.md")).toBe(
        "Path: .github/prompts/01-02-step.prompt.md"
      );
    });

    it("replaces the rules and skills prefixes in one pass", () => {
      expect(rewrite("At {{TOOLS}}/rules/1-style.md and {{TOOLS}}/skills/x/SKILL.md")).toBe(
        "At .github/instructions/1-style.md and .github/skills/x/SKILL.md"
      );
    });

    it("replaces a bare tools or docs prefix for a section it does not know", () => {
      expect(rewrite("Bare {{TOOLS}}/other/thing.md and {{DOCS}}/x.md")).toBe(
        "Bare .github/other/thing.md and aidd_docs/x.md"
      );
    });

    it("resolves the plugins path a pinned release still ships", () => {
      // A real placeholder-carrying line, from framework-real's 00-sdlc skill.
      expect(rewrite("validator: `{{TOOLS}}/plugins/aidd-pm/skills/05-spec/x.yml`")).toBe(
        "validator: `.github/plugins/aidd-pm/skills/05-spec/x.yml`"
      );
    });
  });

  describe("content with nothing to rewrite", () => {
    it("is returned unchanged", () => {
      const content = "# A heading\n\nProse with a [link](https://example.com) and `code`.\n";
      expect(rewrite(content)).toBe(content);
    });
  });

  describe("capabilities.plugins", () => {
    it("declares where copilot's own user-scope settings file lives, for --scope user", () => {
      const activation = copilot.capabilities.plugins.nativeActivation;
      expect(activation?.userSettingsPath?.("/home/tester")).toBe(
        join("/home/tester", ".copilot", "settings.json")
      );
    });
  });
});
