import { describe, expect, it } from "vitest";
import type {
  ArtifactContract,
  ArtifactSource,
} from "../../../../../../src/contexts/tools/domain/build-contract.js";
import {
  buildClaudeContract,
  buildClaudeFlatContract,
} from "../../../../../../src/contexts/tools/domain/profiles/claude/build.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";

// Built, not written literally: biome reads a string holding "${...}" as a lost template.
const ROOT = "$" + "{CLAUDE_PLUGIN_ROOT}";

const AGENT_SOURCE = [
  "---",
  "name: planner",
  "description: Plans the work",
  "model: opus",
  "---",
  `Read @${ROOT}/skills/01-plan/SKILL.md`,
  `Ask @${ROOT}/agents/reviewer.md`,
  `Run @${ROOT}/hooks/journal.cjs`,
  "",
].join("\n");

const HOOKS_JSON = JSON.stringify({
  hooks: { Stop: [{ hooks: [{ type: "command", command: "node journal.cjs" }] }] },
});

function supported(artifact: ArtifactContract): Extract<ArtifactContract, { supported: true }> {
  if (!artifact.supported) throw new Error("artifact is declared unsupported");
  return artifact;
}

function sourceOf(artifact: ArtifactContract): ArtifactSource | null {
  return artifact.supported ? artifact.source : null;
}

describe("buildClaudeContract()", () => {
  it("declares Claude's own plugin manifest path, schema and root token", () => {
    const contract = buildClaudeContract();

    expect({
      pluginRootToken: contract.pluginRootToken,
      manifestFileRelative: contract.manifestFileRelative,
      manifestSchemaName: contract.manifestSchemaName,
    }).toStrictEqual({
      pluginRootToken: ROOT,
      manifestFileRelative: ".claude-plugin/plugin.json",
      manifestSchemaName: "plugin-manifest",
    });
  });

  it("synthesizes a manifest naming the agents and skills, and never the hooks file Claude finds itself", () => {
    const manifest = buildClaudeContract().synthesizeManifest?.(
      { name: "aidd-dev", description: "Development loop", version: "1.2.3" },
      {
        hasAgents: true,
        agentsList: ["planner.md"],
        skillsList: ["01-plan"],
        hasHooksJson: true,
        hasMcpJson: true,
      }
    );

    expect(manifest).toStrictEqual({
      name: "aidd-dev",
      description: "Development loop",
      version: "1.2.3",
      agents: ["./agents/planner.md"],
      skills: ["./skills/01-plan"],
      mcpServers: "./.mcp.json",
    });
  });

  it("sources skills, agents, mcp and hooks from the plugin tree, and neither rules nor commands", () => {
    const { artifacts } = buildClaudeContract();

    expect({
      skills: sourceOf(artifacts.skills),
      agents: sourceOf(artifacts.agents),
      mcp: sourceOf(artifacts.mcp),
      hooks: sourceOf(artifacts.hooks),
      rules: artifacts.rules,
      commands: artifacts.commands,
    }).toStrictEqual({
      skills: { kind: "fullTree", srcDir: "skills" },
      agents: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
      mcp: { kind: "configFile", srcPath: ".mcp.json" },
      hooks: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
      rules: { supported: false },
      commands: { supported: false },
    });
  });

  it("keeps every artifact at the plugin-relative path it came from", () => {
    const { artifacts } = buildClaudeContract();

    expect({
      skill: supported(artifacts.skills).path("aidd-dev", "skills/01-plan/SKILL.md"),
      agent: supported(artifacts.agents).path("aidd-dev", "agents/planner.md"),
      mcp: supported(artifacts.mcp).path("aidd-dev", ".mcp.json"),
      hook: supported(artifacts.hooks).path("aidd-dev", "hooks/journal.cjs"),
    }).toStrictEqual({
      skill: "skills/01-plan/SKILL.md",
      agent: "agents/planner.md",
      mcp: ".mcp.json",
      hook: "hooks/journal.cjs",
    });
  });

  it("keeps an agent's whole frontmatter and links its plugin-root references from agents/", () => {
    const transform = supported(buildClaudeContract().artifacts.agents).transform;

    expect(transform?.(AGENT_SOURCE, "aidd-dev", "planner.md")).toBe(
      [
        "---",
        "name: 'planner'",
        "description: 'Plans the work'",
        "model: 'opus'",
        "---",
        "Read [SKILL.md](../skills/01-plan/SKILL.md)",
        "Ask [reviewer.md](./reviewer.md)",
        "Run [journal.cjs](../hooks/journal.cjs)",
        "",
      ].join("\n")
    );
  });

  it("builds the catalog Claude reads, at .claude-plugin/marketplace.json", async () => {
    const built = await buildClaudeContract().buildMarketplaceCatalog?.(
      {
        name: "aidd",
        version: "1.0.0",
        description: "AI Driven Dev",
        owner: { name: "AIDD" },
        plugins: [],
      },
      [{ name: "aidd-dev", source: "./plugins/aidd-dev" }],
      new InMemoryFileAdapter()
    );

    expect(built).toStrictEqual({
      catalog: {
        name: "aidd",
        version: "1.0.0",
        description: "AI Driven Dev",
        owner: { name: "AIDD" },
        plugins: [{ name: "aidd-dev", source: "./plugins/aidd-dev" }],
      },
      schemaName: "claude-marketplace",
      destRelPath: ".claude-plugin/marketplace.json",
    });
  });

  it("builds a catalog entry from the plugin manifest already written to the output tree", async () => {
    const fs = new InMemoryFileAdapter({
      "/out/plugins/aidd-dev/.claude-plugin/plugin.json": JSON.stringify({
        version: "1.2.3",
        description: "Development loop",
      }),
    });

    const entry = await buildClaudeContract().buildMarketplaceEntry?.(
      "aidd-dev",
      "/src/plugins/aidd-dev",
      "/out",
      undefined,
      fs
    );

    expect(entry).toStrictEqual({
      name: "aidd-dev",
      source: "./plugins/aidd-dev",
      description: "Development loop",
      version: "1.2.3",
    });
  });
});

describe("buildClaudeFlatContract()", () => {
  it("sources the same trees as the plugin contract, and neither rules nor commands", () => {
    const { artifacts } = buildClaudeFlatContract();

    expect({
      skills: sourceOf(artifacts.skills),
      agents: sourceOf(artifacts.agents),
      mcp: sourceOf(artifacts.mcp),
      hooks: sourceOf(artifacts.hooks),
      rules: artifacts.rules,
      commands: artifacts.commands,
    }).toStrictEqual({
      skills: { kind: "fullTree", srcDir: "skills" },
      agents: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
      mcp: { kind: "configFile", srcPath: ".mcp.json" },
      hooks: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
      rules: { supported: false },
      commands: { supported: false },
    });
  });

  it("prefixes a flat skill's own folder with the plugin name, and renames the skill itself", () => {
    const skills = supported(buildClaudeFlatContract().artifacts.skills);

    expect({
      path: skills.path("aidd-dev", "skills/01-plan/SKILL.md"),
      rewriteSkillName: skills.rewriteSkillName,
    }).toStrictEqual({
      path: ".claude/skills/aidd-dev-01-plan/SKILL.md",
      rewriteSkillName: true,
    });
  });

  it("prefixes a flat agent's file with the plugin name and keeps it markdown", () => {
    const agents = supported(buildClaudeFlatContract().artifacts.agents);

    expect(agents.path("aidd-dev", "agents/planner.md")).toBe(".claude/agents/aidd-dev-planner.md");
  });

  it("lands a plugin's hooks declaration beside Claude's hooks and its scripts under the plugin's own folder", () => {
    const hooks = supported(buildClaudeFlatContract().artifacts.hooks);

    expect({
      declaration: hooks.path("aidd-dev", "hooks/aidd-dev.hooks.json"),
      script: hooks.path("aidd-dev", "hooks/journal.cjs"),
      mergeDest: hooks.hooksMergeDest?.("/out"),
    }).toStrictEqual({
      declaration: ".claude/hooks/aidd-dev.hooks.json",
      script: ".claude/hooks/aidd-dev/journal.cjs",
      mergeDest: "/out/.claude/settings.json",
    });
  });

  it("appends a plugin's hooks to the settings file, leaving every other setting alone", () => {
    const hooks = supported(buildClaudeFlatContract().artifacts.hooks);

    expect(hooks.hooksMerge?.(JSON.stringify({ model: "opus" }), HOOKS_JSON)).toStrictEqual({
      content: `${JSON.stringify(
        {
          model: "opus",
          hooks: { Stop: [{ hooks: [{ type: "command", command: "node journal.cjs" }] }] },
        },
        null,
        2
      )}\n`,
      warnings: [],
    });
  });

  it("adds a plugin's mcp servers to the workspace .mcp.json under mcpServers", () => {
    const mcp = supported(buildClaudeFlatContract().artifacts.mcp);

    expect({
      path: mcp.path("aidd-dev", ".mcp.json"),
      mcpServersKey: mcp.mcpServersKey,
      mergeDest: mcp.mergeDest?.("/out"),
      merged: mcp.merge?.(null, { "aidd-dev-context": { command: "node" } }, false),
    }).toStrictEqual({
      path: ".mcp.json",
      mcpServersKey: "mcpServers",
      mergeDest: "/out/.mcp.json",
      merged: {
        mergedContent:
          '{\n  "mcpServers": {\n    "aidd-dev-context": {\n      "command": "node"\n    }\n  }\n}\n',
        collisions: [],
      },
    });
  });

  it("renames a flat agent after its plugin and points its references at their flat destinations", () => {
    const transform = supported(buildClaudeFlatContract().artifacts.agents).transform;

    expect(transform?.(AGENT_SOURCE, "aidd-dev", "planner.md")).toBe(
      [
        "---",
        "name: 'aidd-dev-planner'",
        "description: 'Plans the work'",
        "model: 'opus'",
        "---",
        "Read [SKILL.md](../skills/aidd-dev-01-plan/SKILL.md)",
        "Ask [reviewer.md](./aidd-dev-reviewer.md)",
        "Run [journal.cjs](../../hooks/journal.cjs)",
        "",
      ].join("\n")
    );
  });
});
