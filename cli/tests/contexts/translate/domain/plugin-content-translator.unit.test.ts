import { describe, expect, it } from "vitest";
import { PluginsCapability } from "../../../../src/contexts/tools/domain/capabilities/plugins-capability.js";
import { claude } from "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { codex } from "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { copilot } from "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { cursor } from "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { opencode } from "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { vscodeToolConfig } from "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import type { ToolConfig } from "../../../../src/contexts/tools/domain/registry.js";
import { PluginContentTranslator } from "../../../../src/contexts/translate/domain/content-translator.js";
import {
  type PluginComponentFile,
  type PluginComponents,
  PluginDistribution,
} from "../../../../src/contexts/translate/domain/plugin-distribution.js";
import { FileHash } from "../../../../src/kernel/file.js";
import { parseFrontmatter } from "../../../../src/kernel/markdown.js";

const stubHasher = { hash: (_content: string) => new FileHash("a".repeat(32)) };
const translator = new PluginContentTranslator(stubHasher);

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
  return translator.translate(dist, tool).map((f) => f.relativePath);
}

describe("PluginContentTranslator.translate()", () => {
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
      const files = translator.translate(makeDist(), claude);
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

    it("keeps a hook script's own directories, which its requires resolve against", () => {
      const hooksFiles = [
        makeFile("hooks/hooks.json", hooksJsonContent),
        makeFile("hooks/journal.cjs", 'require("./lib/repo.js");'),
        makeFile("hooks/lib/repo.cjs", "module.exports = {};"),
      ];
      const dist = makeDist({
        files: [...hooksFiles, makeFile(".claude-plugin/plugin.json", claudeManifestContent)],
        components: {
          skills: [],
          commands: [],
          agents: [],
          rules: [],
          hooks: hooksFiles,
          mcp: [],
        },
      });
      const paths = pathsFor(claude, dist);
      expect(paths).toContain(".claude/plugins/sample-plugin/hooks/journal.cjs");
      expect(paths).toContain(".claude/plugins/sample-plugin/hooks/lib/repo.cjs");
      expect(paths).not.toContain(".claude/plugins/sample-plugin/hooks/repo.cjs");
    });
  });

  describe("cursor target (Mode B — user-scope flat materialization)", () => {
    it("emits rules with .mdc extension under plugin-name-prefixed path", () => {
      expect(pathsFor(cursor)).toContain("sample-plugin/rules/standards.mdc");
    });

    it("emits cursor-format frontmatter on rules (globs key)", () => {
      const files = translator.translate(makeDist(), cursor);
      const rule = files.find((f) => f.relativePath.endsWith("standards.mdc"));
      expect(rule?.content).toContain("globs:");
    });

    it("does not emit plugin.json (pluginManifestRelativePath is null)", () => {
      const files = translator.translate(makeDist(), cursor);
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
      const files = translator.translate(makeDist(), codex);
      const agent = files.find((f) => f.relativePath.endsWith("reviewer.toml"));
      expect(agent?.content).toContain("name =");
      expect(agent?.content).toContain("description =");
      expect(agent?.content).toContain("developer_instructions =");
    });

    it("emits native plugin manifest at plugin.json", () => {
      const files = translator.translate(makeDist(), codex);
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
      const files = translator.translate(makeDist(), opencode);
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
      expect(translator.translate(makeDist(), vscodeToolConfig)).toEqual([]);
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
          const files = translator.translate(dist, target.tool);
          expect(files.map((f) => f.relativePath)).not.toContain(
            expect.stringMatching(/plugin\.json$/)
          );
        });
      } else {
        it(`${source.format} source → ${target.name} target: emits manifest at ${target.manifestExpected}`, () => {
          const dist = makeSourceDist(source);
          const files = translator.translate(dist, target.tool);
          const expected = `${target.tool.capabilities.plugins.pluginsDir}sample-plugin/${target.manifestExpected}`;
          expect(files.map((f) => f.relativePath)).toContain(expected);
        });
      }
    }
  }
});

describe("PluginContentTranslator.detectFlatCollisions()", () => {
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

/** The path a plugin's own content takes on its way to disk: the chain `aidd plugin install`
 * follows, and the one the golden suite cannot see, since `aidd translate` never calls
 * `rewriteContent` at all. */
describe("a plugin whose content references the framework", () => {
  const withPlaceholder = () => {
    const skills = [
      makeFile(
        "skills/hello/SKILL.md",
        `---\nname: hello\ndescription: Hello skill\n---\n\nSee \`{{TOOLS}}/plugins/aidd-pm/x.yml\` and @{{DOCS}}/memory/testing.md\n`
      ),
    ];
    // `files` and `components` both, or the override keeps the default skill content and
    // the assertion passes on a file that never carried a placeholder.
    return makeDist({
      files: skills,
      components: { skills, commands: [], agents: [], rules: [], hooks: [], mcp: [] },
    });
  };

  it("resolves the reference for the tool being installed into", () => {
    const file = translator
      .translate(withPlaceholder(), copilot)
      .find((f) => f.relativePath.endsWith("SKILL.md"));

    expect(file?.content).toContain(".github/plugins/aidd-pm/x.yml");
    expect(file?.content).toContain(
      "[aidd_docs/memory/testing.md](../../aidd_docs/memory/testing.md)"
    );
    expect(file?.content).not.toContain("{{TOOLS}}");
    expect(file?.content).not.toContain("{{DOCS}}");
  });
});

const CLAUDE_ROOT_TOKEN = "$" + "{CLAUDE_PLUGIN_ROOT}";
const CODEX_ROOT_TOKEN = "$" + "{PLUGIN_ROOT}";

const skillEntryContent = `---
name: hello
description: Hello skill
---

Hello body.
`;

const skillActionContent = `---
name: run
description: Run action
---

Run body.
`;

const skillAssetContent = `{ "entry": "${CLAUDE_ROOT_TOKEN}/skills/hello/run.sh" }\n`;
const hookScriptContent = `#!/bin/sh\nexec "${CLAUDE_ROOT_TOKEN}/hooks/lib/check.sh"\n`;

function hooksManifestFor(token: string): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: `${token}/hooks/check.sh` }] },
      ],
    },
  });
}

function distOf(files: PluginComponentFile[], components: Partial<PluginComponents>) {
  return new PluginDistribution({
    manifest: { name: "sample-plugin", version: "1.0.0" },
    format: "claude",
    files: [...files, makeFile(".claude-plugin/plugin.json", claudeManifestContent)],
    components: {
      skills: [],
      commands: [],
      agents: [],
      rules: [],
      hooks: [],
      mcp: [],
      ...components,
    },
  });
}

function skillDist(): PluginDistribution {
  const skills = [
    makeFile("skills/hello/SKILL.md", skillEntryContent),
    makeFile("skills/hello/actions/run.md", skillActionContent),
    makeFile("skills/hello/reference.json", skillAssetContent),
  ];
  return distOf([...skills], { skills });
}

function hooksDist(extra: PluginComponentFile[] = []): PluginDistribution {
  const hooks = [
    makeFile("hooks/hooks.json", hooksManifestFor(CLAUDE_ROOT_TOKEN)),
    makeFile("hooks/lib/check.sh", hookScriptContent),
    ...extra,
  ];
  return distOf([...hooks], { hooks });
}

function treeOf(tool: ToolConfig, dist: PluginDistribution): Record<string, string> {
  return Object.fromEntries(
    translator.translate(dist, tool).map((f) => [f.relativePath, f.content])
  );
}

function installedPathsOf(tool: ToolConfig, dist: PluginDistribution): string[] {
  return Object.keys(treeOf(tool, dist)).sort();
}

describe("a plugin of one skill, its action and its asset", () => {
  it("lays the whole skill tree under the plugin directory claude expands, beside the manifest", () => {
    expect(installedPathsOf(claude, skillDist())).toEqual([
      ".claude/plugins/sample-plugin/plugin.json",
      ".claude/plugins/sample-plugin/skills/hello/SKILL.md",
      ".claude/plugins/sample-plugin/skills/hello/actions/run.md",
      ".claude/plugins/sample-plugin/skills/hello/reference.json",
    ]);
  });

  it("carries the skill's asset byte for byte, its plugin-root variable untranslated", () => {
    const tree = treeOf(codex, skillDist());
    expect(tree[".codex/plugins/sample-plugin/skills/hello/reference.json"]).toBe(
      skillAssetContent
    );
  });

  it("lays the tree at the project root, and no manifest, for a target whose plugins have no directory of their own", () => {
    expect(installedPathsOf(cursor, skillDist())).toEqual([
      "sample-plugin/skills/hello/SKILL.md",
      "sample-plugin/skills/hello/actions/run.md",
      "sample-plugin/skills/hello/reference.json",
    ]);
  });

  it("namespaces every skill file per plugin, prose and asset alike, for a flat target", () => {
    expect(treeOf(opencode, skillDist())).toEqual({
      ".opencode/skills/sample-plugin/hello/SKILL.md": skillEntryContent,
      ".opencode/skills/sample-plugin/hello/actions/run.md": skillActionContent,
      ".opencode/skills/sample-plugin/hello/reference.json": skillAssetContent,
    });
  });
});

describe("a plugin's hooks", () => {
  it("puts the manifest where codex reads it, rewrites its plugin root, and keeps each script's own bytes", () => {
    expect(treeOf(codex, hooksDist())).toEqual({
      ".codex/plugins/sample-plugin/hooks/hooks.json": hooksManifestFor(CODEX_ROOT_TOKEN),
      ".codex/plugins/sample-plugin/hooks/lib/check.sh": hookScriptContent,
      ".codex/plugins/sample-plugin/plugin.json": claudeManifestContent,
    });
  });

  it("flattens the manifest into the shape cursor reads and keeps the scripts under hooks/", () => {
    expect(treeOf(cursor, hooksDist())).toEqual({
      "sample-plugin/hooks.json": JSON.stringify(
        { hooks: { preToolUse: [{ type: "command", command: "./hooks/check.sh" }] } },
        null,
        2
      ),
      "sample-plugin/hooks/lib/check.sh": hookScriptContent,
    });
  });

  it("delivers a flat target's scripts per plugin and no manifest", () => {
    expect(treeOf(opencode, hooksDist())).toEqual({
      ".opencode/hooks/sample-plugin/lib/check.sh": hookScriptContent,
    });
  });

  it("renames the loader's own module to the plugin, carrying its bytes", () => {
    const loaderModule = "export const plugin = () => {};\n";
    const tree = treeOf(opencode, hooksDist([makeFile("hooks/opencode-plugin.js", loaderModule)]));
    expect(tree).toEqual({
      ".opencode/hooks/sample-plugin/lib/check.sh": hookScriptContent,
      ".opencode/plugin/sample-plugin.js": loaderModule,
    });
  });
});

describe("a flat target that rewrites what it hosts", () => {
  const rewriting = {
    ...opencode,
    rewriteContent: (content: string) => content.replace("SOURCE", "REWRITTEN"),
  };

  it("rewrites a skill's prose and carries its asset as it is", () => {
    const skills = [
      makeFile("skills/hello/SKILL.md", "Read SOURCE.\n"),
      makeFile("skills/hello/reference.json", '{ "from": "SOURCE" }\n'),
    ];
    expect(treeOf(rewriting, distOf([...skills], { skills }))).toEqual({
      ".opencode/skills/sample-plugin/hello/SKILL.md": "Read REWRITTEN.\n",
      ".opencode/skills/sample-plugin/hello/reference.json": '{ "from": "SOURCE" }\n',
    });
  });
});

describe("a flat target whose loader is triggered by a generated bridge", () => {
  const bridged = {
    ...opencode,
    capabilities: {
      ...opencode.capabilities,
      plugins: new PluginsCapability({
        mode: "flat",
        flatNamespacePrefix: "aidd-",
        acceptsHooks: true,
        flatHooksDir: ".stub/hooks/",
        flatHooksBridge: {
          generate: (raw: string, plugin: string) =>
            raw.includes("PreToolUse") ? `bridge(${plugin}):${raw}` : null,
          path: (plugin: string) => `.stub/plugin/${plugin}.js`,
          skipIfSourceHas: "own-plugin.js",
        },
      }),
    },
  };

  it("generates the bridge from the plugin's own hooks manifest", () => {
    expect(treeOf(bridged, hooksDist())).toEqual({
      ".stub/hooks/sample-plugin/lib/check.sh": hookScriptContent,
      ".stub/plugin/sample-plugin.js": `bridge(sample-plugin):${hooksManifestFor(CLAUDE_ROOT_TOKEN)}`,
    });
  });

  it("generates none for a plugin shipping its own", () => {
    const withOwn = hooksDist([
      makeFile("hooks/own-plugin.js", "export const plugin = () => {};\n"),
    ]);
    expect(Object.keys(treeOf(bridged, withOwn)).sort()).toEqual([
      ".stub/hooks/sample-plugin/lib/check.sh",
      ".stub/hooks/sample-plugin/own-plugin.js",
    ]);
  });

  it("generates none where the manifest names nothing the bridge maps", () => {
    const hooks = [
      makeFile("hooks/hooks.json", '{ "hooks": {} }'),
      makeFile("hooks/lib/check.sh", hookScriptContent),
    ];
    expect(treeOf(bridged, distOf([...hooks], { hooks }))).toEqual({
      ".stub/hooks/sample-plugin/lib/check.sh": hookScriptContent,
    });
  });

  it("generates none for a plugin shipping no hooks manifest at all", () => {
    const hooks = [makeFile("hooks/lib/check.sh", hookScriptContent)];
    expect(treeOf(bridged, distOf([...hooks], { hooks }))).toEqual({
      ".stub/hooks/sample-plugin/lib/check.sh": hookScriptContent,
    });
  });
});

describe("a plugin's mcp declaration", () => {
  it("lands at the name cursor reads it under", () => {
    const mcp = [makeFile(".mcp.json", mcpJsonContent)];
    expect(treeOf(cursor, distOf([...mcp], { mcp }))).toEqual({
      "sample-plugin/mcp.json": mcpJsonContent,
    });
  });

  it("is dropped by a target that hosts none", () => {
    const refusingMcp = {
      ...claude,
      capabilities: {
        ...claude.capabilities,
        plugins: new PluginsCapability({
          mode: "native",
          pluginsDir: ".claude/plugins/",
          pluginManifestRelativePath: null,
          acceptsHooks: true,
          acceptsMcp: false,
        }),
      },
    };
    const mcp = [makeFile(".mcp.json", mcpJsonContent)];
    expect(treeOf(refusingMcp, distOf([...mcp], { mcp }))).toEqual({});
  });
});

describe("what an installed file came from", () => {
  it("maps back only the components, never the manifest, the hooks or the mcp declaration", () => {
    const { componentPaths } = translator.translateWithComponentPaths(makeDist(), claude);
    expect(Object.fromEntries(componentPaths)).toEqual({
      ".claude/plugins/sample-plugin/skills/hello/SKILL.md": "skills/hello/SKILL.md",
      ".claude/plugins/sample-plugin/commands/greet.md": "commands/greet.md",
      ".claude/plugins/sample-plugin/agents/reviewer.md": "agents/reviewer.md",
      ".claude/plugins/sample-plugin/rules/standards.md": "rules/standards.md",
    });
  });
});

describe("what a person still has to do before a hook runs", () => {
  it("names codex's trust step once for a plugin that ships hooks", () => {
    const { notices } = translator.translateWithComponentPaths(hooksDist(), codex);
    expect(notices).toEqual([
      {
        pluginName: "sample-plugin",
        component: "hooks",
        toolId: "codex",
        message: codex.capabilities.plugins.hooksTrustNotice,
      },
    ]);
  });

  it("says nothing for a plugin that ships no hook", () => {
    expect(translator.translateWithComponentPaths(skillDist(), codex).notices).toEqual([]);
  });

  it("says nothing for a target that asks for no trust", () => {
    expect(translator.translateWithComponentPaths(hooksDist(), claude).notices).toEqual([]);
  });
});

describe("a target that runs no hook a plugin ships", () => {
  const refusingHooks = {
    ...opencode,
    capabilities: {
      ...opencode.capabilities,
      plugins: new PluginsCapability({
        mode: "flat",
        flatNamespacePrefix: "aidd-",
        acceptsHooks: false,
        hooksUnsupportedReason: "OpenCode runs no hook a plugin ships.",
      }),
    },
  };

  it("records the refusal against the plugin and the target", () => {
    expect(translator.translateWithComponentPaths(hooksDist(), refusingHooks).skipped).toEqual([
      {
        pluginName: "sample-plugin",
        component: "hooks",
        toolId: "opencode",
        reason: "OpenCode runs no hook a plugin ships.",
      },
    ]);
  });

  it("records nothing for a plugin that ships no hook", () => {
    expect(translator.translateWithComponentPaths(skillDist(), refusingHooks).skipped).toEqual([]);
  });
});

describe("a command a flat target installs", () => {
  const cases = [
    { authored: "aidd:04:sub:greet", installed: "aidd-sample-plugin:sub:greet" },
    { authored: "team:greet", installed: "aidd-sample-plugin:greet" },
    { authored: "greet", installed: "aidd-sample-plugin:greet" },
  ];

  for (const { authored, installed } of cases) {
    it(`names '${authored}' as '${installed}'`, () => {
      const commands = [
        makeFile(
          "commands/greet.md",
          `---\nname: ${authored}\ndescription: Greet command\n---\n\nGreet.\n`
        ),
      ];
      const content = treeOf(opencode, distOf([...commands], { commands }))[
        ".opencode/commands/sample-plugin/greet.md"
      ];
      expect(parseFrontmatter(content).frontmatter).toEqual({
        name: installed,
        description: "Greet command",
      });
    });
  }

  it("falls back to the file's own name when the command declares none", () => {
    const commands = [
      makeFile("commands/greet.md", "---\ndescription: Greet command\n---\n\nGreet.\n"),
    ];
    const content = treeOf(opencode, distOf([...commands], { commands }))[
      ".opencode/commands/sample-plugin/greet.md"
    ];
    expect(parseFrontmatter(content).frontmatter).toEqual({
      description: "Greet command",
      name: "aidd-sample-plugin:greet.md",
    });
  });
});

describe("a target that hosts no plugin", () => {
  const emptyResult = { files: [], componentPaths: new Map(), skipped: [], notices: [] };

  it("produces nothing for an IDE", () => {
    expect(translator.translateWithComponentPaths(makeDist(), vscodeToolConfig)).toEqual(
      emptyResult
    );
  });

  it("produces nothing for a tool declaring plugins unsupported", () => {
    const unsupported = {
      ...claude,
      capabilities: {
        ...claude.capabilities,
        plugins: new PluginsCapability({
          mode: "unsupported",
          hooksUnsupportedReason: "Claude hosts no plugin here.",
        }),
      },
    };
    expect(translator.translateWithComponentPaths(makeDist(), unsupported)).toEqual(emptyResult);
  });
});
