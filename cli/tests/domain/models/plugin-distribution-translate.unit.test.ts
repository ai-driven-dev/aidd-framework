import { describe, expect, it } from "vitest";
import { FileHash } from "../../../src/domain/models/file.js";
import {
  type PluginComponentFile,
  PluginDistribution,
} from "../../../src/domain/models/plugin-distribution.js";
import { PluginTranslator } from "../../../src/domain/models/plugin-translator.js";
import { claude } from "../../../src/domain/tools/ai/claude.js";
import { codex } from "../../../src/domain/tools/ai/codex.js";
import { copilot } from "../../../src/domain/tools/ai/copilot.js";
import { cursor } from "../../../src/domain/tools/ai/cursor.js";
import { opencode } from "../../../src/domain/tools/ai/opencode.js";
import { vscodeToolConfig } from "../../../src/domain/tools/ide/vscode.js";
import type { ToolConfig } from "../../../src/domain/tools/registry.js";

const stubHasher = { hash: (_content: string) => new FileHash("a".repeat(32)) };
const translator = new PluginTranslator(stubHasher);

const greetContent = `---
name: aidd:04:greet
description: Greet command
---

Greet from sample-plugin.
`;

const skillContent = `---
name: hello
description: Hello skill
---

Hello from sample-plugin skill.
`;

const agentContent = `---
name: reviewer
description: Reviewer agent
---

Reviewer agent from sample-plugin.
`;

const ruleContent = `---
description: Coding standards rule
paths:
  - "**/*.ts"
---

Use strict types.
`;

const hooksJsonContent = `{ "hooks": [] }`;
const mcpJsonContent = `{ "mcpServers": {} }`;
const claudeManifestContent = `{ "name": "sample-plugin", "version": "1.0.0" }`;

function makeFile(relativePath: string, content: string): PluginComponentFile {
  return { relativePath, content };
}

function makeDist(
  overrides: Partial<ConstructorParameters<typeof PluginDistribution>[0]> = {}
): PluginDistribution {
  const commands = [makeFile("commands/greet.md", greetContent)];
  const skills = [makeFile("skills/hello/SKILL.md", skillContent)];
  const agents = [makeFile("agents/reviewer.md", agentContent)];
  const rules = [makeFile("rules/standards.md", ruleContent)];
  const hooks = [makeFile("hooks/hooks.json", hooksJsonContent)];
  const mcp = [makeFile(".mcp.json", mcpJsonContent)];
  const manifest = makeFile(".claude-plugin/plugin.json", claudeManifestContent);
  return new PluginDistribution({
    manifest: { name: "sample-plugin", version: "1.0.0" },
    format: "claude",
    files: [...skills, ...commands, ...agents, ...rules, ...hooks, ...mcp, manifest],
    components: { skills, commands, agents, rules, hooks, mcp },
    ...overrides,
  });
}

function pathsFor(tool: ToolConfig, dist = makeDist()): string[] {
  return translator.translate(dist, tool, "").map((f) => f.relativePath);
}

describe("PluginTranslator.translate()", () => {
  describe("claude target", () => {
    it("emits all components claude supports under .claude/plugins/sample-plugin/", () => {
      const paths = pathsFor(claude);
      expect(paths).toContain(".claude/plugins/sample-plugin/commands/greet.md");
      expect(paths).toContain(".claude/plugins/sample-plugin/agents/reviewer.md");
      expect(paths).toContain(".claude/plugins/sample-plugin/skills/hello/SKILL.md");
      expect(paths).toContain(".claude/plugins/sample-plugin/rules/standards.md");
      expect(paths).toContain(".claude/plugins/sample-plugin/hooks/hooks.json");
      expect(paths).toContain(".claude/plugins/sample-plugin/.mcp.json");
    });

    it("emits native plugin manifest at plugin.json", () => {
      const files = translator.translate(makeDist(), claude, "");
      const manifest = files.find(
        (f) => f.relativePath === ".claude/plugins/sample-plugin/plugin.json"
      );
      expect(manifest).toBeDefined();
      expect(manifest?.content).toContain("sample-plugin");
    });

    it("emits hooks companion scripts alongside hooks.json", () => {
      const scriptFile = makeFile("hooks/update_memory.js", "console.log('updated');");
      const hooksFiles = [makeFile("hooks/hooks.json", hooksJsonContent), scriptFile];
      const dist = makeDist({
        files: [
          makeFile("skills/hello/SKILL.md", skillContent),
          makeFile("commands/greet.md", greetContent),
          makeFile("agents/reviewer.md", agentContent),
          makeFile("rules/standards.md", ruleContent),
          ...hooksFiles,
          makeFile(".mcp.json", mcpJsonContent),
          makeFile(".claude-plugin/plugin.json", claudeManifestContent),
        ],
        components: {
          skills: [makeFile("skills/hello/SKILL.md", skillContent)],
          commands: [makeFile("commands/greet.md", greetContent)],
          agents: [makeFile("agents/reviewer.md", agentContent)],
          rules: [makeFile("rules/standards.md", ruleContent)],
          hooks: hooksFiles,
          mcp: [makeFile(".mcp.json", mcpJsonContent)],
        },
      });
      const paths = pathsFor(claude, dist);
      expect(paths).toContain(".claude/plugins/sample-plugin/hooks/hooks.json");
      expect(paths).toContain(".claude/plugins/sample-plugin/hooks/update_memory.js");
    });
  });

  describe("cursor target (Mode B — user-scope flat materialization)", () => {
    it("emits rules with .mdc extension under plugin-name-prefixed path", () => {
      expect(pathsFor(cursor)).toContain("sample-plugin/rules/standards.mdc");
    });

    it("emits cursor-format frontmatter on rules (globs key)", () => {
      const files = translator.translate(makeDist(), cursor, "");
      const rule = files.find((f) => f.relativePath.endsWith("standards.mdc"));
      expect(rule?.content).toContain("globs:");
    });

    it("does not emit plugin.json (pluginManifestRelativePath is null)", () => {
      const files = translator.translate(makeDist(), cursor, "");
      const manifest = files.find((f) => f.relativePath.endsWith("plugin.json"));
      expect(manifest).toBeUndefined();
    });

    it("does not emit hooks (acceptsHooks is false)", () => {
      expect(pathsFor(cursor)).not.toContain(expect.stringContaining("hooks/hooks.json"));
    });

    it("does not emit mcp (acceptsMcp is false)", () => {
      expect(pathsFor(cursor)).not.toContain(expect.stringContaining("mcp.json"));
    });

    it("emits commands under plugin-name-prefixed path", () => {
      // greet.md → buildInstallPath yields ".cursor/commands/aidd/greet.md"
      // toPluginRelativePath strips ".cursor/" then removes /aidd/ → "commands/greet.md"
      // pluginRoot prepend → "sample-plugin/commands/greet.md"
      expect(pathsFor(cursor)).toContain("sample-plugin/commands/greet.md");
    });

    it("file paths are base-relative (no .cursor/ prefix — base resolved at install time)", () => {
      const paths = pathsFor(cursor);
      expect(paths.every((p) => !p.startsWith(".cursor/"))).toBe(true);
    });
  });

  describe("codex target", () => {
    it("emits agents as TOML", () => {
      expect(pathsFor(codex)).toContain(".codex/plugins/sample-plugin/agents/reviewer.toml");
    });

    it("agent content is TOML format", () => {
      const files = translator.translate(makeDist(), codex, "");
      const agent = files.find((f) => f.relativePath.endsWith("reviewer.toml"));
      expect(agent?.content).toContain("name =");
      expect(agent?.content).toContain("description =");
      expect(agent?.content).toContain("developer_instructions =");
    });

    it("emits native plugin manifest at plugin.json", () => {
      const files = translator.translate(makeDist(), codex, "");
      const manifest = files.find(
        (f) => f.relativePath === ".codex/plugins/sample-plugin/plugin.json"
      );
      expect(manifest).toBeDefined();
    });
  });

  describe("copilot target", () => {
    it("emits commands as prompts with .prompt.md extension", () => {
      expect(pathsFor(copilot)).toContain(".github/plugins/sample-plugin/prompts/greet.prompt.md");
    });

    it("emits agents with .agent.md extension", () => {
      expect(pathsFor(copilot)).toContain(".github/plugins/sample-plugin/agents/reviewer.agent.md");
    });

    it("emits rules as instructions with .instructions.md extension", () => {
      expect(pathsFor(copilot)).toContain(
        ".github/plugins/sample-plugin/instructions/standards.instructions.md"
      );
    });
  });

  describe("opencode target (flat mode)", () => {
    it("emits commands under .opencode/commands/sample-plugin/ with name prefix", () => {
      const files = translator.translate(makeDist(), opencode, "");
      const greet = files.find(
        (f) => f.relativePath === ".opencode/commands/sample-plugin/greet.md"
      );
      expect(greet).toBeDefined();
      expect(greet?.content).toContain("name: 'aidd-sample-plugin:greet'");
    });

    it("emits agents under .opencode/agents/sample-plugin/", () => {
      expect(pathsFor(opencode)).toContain(".opencode/agents/sample-plugin/reviewer.md");
    });

    it("emits skills under .opencode/skills/sample-plugin/", () => {
      expect(pathsFor(opencode)).toContain(".opencode/skills/sample-plugin/hello/SKILL.md");
    });

    it("emits rules under .opencode/rules/sample-plugin/", () => {
      expect(pathsFor(opencode)).toContain(".opencode/rules/sample-plugin/standards.md");
    });
  });

  describe("vscode (IDE tool)", () => {
    it("returns empty array", () => {
      expect(translator.translate(makeDist(), vscodeToolConfig, "")).toEqual([]);
    });
  });
});

describe("cross-format matrix (source × target)", () => {
  const sourceFormats = [
    { format: "claude" as const, manifestPath: ".claude-plugin/plugin.json" },
    { format: "cursor" as const, manifestPath: ".cursor-plugin/plugin.json" },
    { format: "codex" as const, manifestPath: ".codex-plugin/plugin.json" },
    { format: "copilot" as const, manifestPath: "plugin.json" },
  ];

  const targets = [
    { name: "claude", tool: claude, manifestExpected: "plugin.json" },
    { name: "cursor", tool: cursor, manifestExpected: "plugin.json" },
    { name: "codex", tool: codex, manifestExpected: "plugin.json" },
    { name: "copilot", tool: copilot, manifestExpected: "plugin.json" },
  ];

  function makeSourceDist(format: (typeof sourceFormats)[number]): PluginDistribution {
    const commands = [makeFile("commands/greet.md", greetContent)];
    const agents = [makeFile("agents/reviewer.md", agentContent)];
    const skills = [makeFile("skills/hello/SKILL.md", skillContent)];
    const manifest = makeFile(format.manifestPath, claudeManifestContent);
    return new PluginDistribution({
      manifest: { name: "sample-plugin", version: "1.0.0" },
      format: format.format,
      files: [...commands, ...agents, ...skills, manifest],
      components: { commands, agents, skills, rules: [], hooks: [], mcp: [] },
    });
  }

  for (const source of sourceFormats) {
    for (const target of targets) {
      if (target.name === "cursor") {
        // Cursor Mode B: pluginManifestRelativePath is null — no manifest file written into plugin dir.
        it(`${source.format} source → ${target.name} target: does not emit manifest (Mode B, null pluginManifestRelativePath)`, () => {
          const dist = makeSourceDist(source);
          const files = translator.translate(dist, target.tool, "");
          expect(files.map((f) => f.relativePath)).not.toContain(
            expect.stringMatching(/plugin\.json$/)
          );
        });
      } else {
        it(`${source.format} source → ${target.name} target: emits manifest at ${target.manifestExpected}`, () => {
          const dist = makeSourceDist(source);
          const files = translator.translate(dist, target.tool, "");
          const expected = `${target.tool.capabilities.plugins.pluginsDir}sample-plugin/${target.manifestExpected}`;
          expect(files.map((f) => f.relativePath)).toContain(expected);
        });
      }
    }
  }
});

describe("PluginTranslator.detectFlatCollisions()", () => {
  it("reports no collision when plugins use different plugin names", () => {
    const dist1 = makeDist({ manifest: { name: "plugin-a", version: "1.0.0" } });
    const dist2 = makeDist({ manifest: { name: "plugin-b", version: "1.0.0" } });
    const collisions = translator.detectFlatCollisions([dist1, dist2], opencode);
    expect(collisions).toEqual([]);
  });

  it("reports collisions when same plugin name is used twice", () => {
    const dist1 = makeDist({ manifest: { name: "same-plugin", version: "1.0.0" } });
    const dist2 = makeDist({ manifest: { name: "same-plugin", version: "2.0.0" } });
    const collisions = translator.detectFlatCollisions([dist1, dist2], opencode);
    expect(collisions.length).toBeGreaterThan(0);
    expect(collisions[0].plugin).toBe("same-plugin");
  });

  it("returns empty array for native-mode tools", () => {
    expect(translator.detectFlatCollisions([makeDist()], claude)).toEqual([]);
  });
});
