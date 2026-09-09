import { describe, expect, it } from "vitest";
import type {
  ArtifactContract,
  ArtifactSource,
} from "../../../../../../src/contexts/tools/domain/build-contract.js";
import {
  buildCopilotFlatContract,
  buildCopilotMarketplaceContract,
} from "../../../../../../src/contexts/tools/domain/profiles/copilot/build.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";

// Built, not written literally: biome reads a string holding "${...}" as a lost template.
const ROOT = "$" + "{CLAUDE_PLUGIN_ROOT}";

const AGENT_SOURCE = [
  "---",
  "name: planner",
  "description: Plans the work",
  "model: opus",
  "color: blue",
  "---",
  `Read @${ROOT}/skills/01-plan/SKILL.md`,
  `Ask @${ROOT}/agents/reviewer.md`,
  `Run @${ROOT}/hooks/journal.cjs`,
  "",
].join("\n");

const HOOKS_JSON = JSON.stringify({
  hooks: {
    SessionStart: [{ hooks: [{ type: "command", command: "node journal.cjs", timeout: 30 }] }],
  },
});

function supported(artifact: ArtifactContract): Extract<ArtifactContract, { supported: true }> {
  if (!artifact.supported) throw new Error("artifact is declared unsupported");
  return artifact;
}

function sourceOf(artifact: ArtifactContract): ArtifactSource | null {
  return artifact.supported ? artifact.source : null;
}

describe("buildCopilotMarketplaceContract()", () => {
  it("declares Copilot's own plugin manifest path and root token, and validates it against no schema", () => {
    const contract = buildCopilotMarketplaceContract();

    expect({
      pluginRootToken: contract.pluginRootToken,
      manifestFileRelative: contract.manifestFileRelative,
      manifestSchemaName: contract.manifestSchemaName,
    }).toStrictEqual({
      pluginRootToken: "$" + "{PLUGIN_ROOT}",
      manifestFileRelative: ".plugin/plugin.json",
      manifestSchemaName: null,
    });
  });

  it("synthesizes a manifest naming the agents, skills, hooks file and mcp servers a plugin ships", () => {
    const manifest = buildCopilotMarketplaceContract().synthesizeManifest?.(
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
      hooks: "./hooks/hooks.json",
      mcpServers: "./.mcp.json",
    });
  });

  it("sources skills, agents, mcp and hooks from the plugin tree, and neither rules nor commands", () => {
    const { artifacts } = buildCopilotMarketplaceContract();

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
    const { artifacts } = buildCopilotMarketplaceContract();

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
    const transform = supported(buildCopilotMarketplaceContract().artifacts.agents).transform;

    expect(transform?.(AGENT_SOURCE, "aidd-dev", "planner.md")).toBe(
      [
        "---",
        "name: 'planner'",
        "description: 'Plans the work'",
        "model: 'opus'",
        "color: 'blue'",
        "---",
        "Read [SKILL.md](../skills/01-plan/SKILL.md)",
        "Ask [reviewer.md](./reviewer.md)",
        "Run [journal.cjs](../hooks/journal.cjs)",
        "",
      ].join("\n")
    );
  });

  it("builds the OpenPlugin catalog, at .plugin/marketplace.json, with the plugin root beside it", async () => {
    const built = await buildCopilotMarketplaceContract().buildMarketplaceCatalog?.(
      {
        name: "aidd",
        version: "1.0.0",
        description: "AI Driven Dev",
        owner: { name: "AIDD" },
        plugins: [],
      },
      [{ name: "aidd-dev", source: "aidd-dev" }],
      new InMemoryFileAdapter()
    );

    expect(built).toStrictEqual({
      catalog: {
        name: "aidd",
        metadata: {
          description: "AI Driven Dev",
          version: "1.0.0",
          pluginRoot: "./plugins",
        },
        owner: { name: "AIDD" },
        plugins: [{ name: "aidd-dev", source: "aidd-dev" }],
      },
      schemaName: "marketplace",
      destRelPath: ".plugin/marketplace.json",
    });
  });

  it("builds a catalog entry naming the plugin as its own source, from the manifest already written", async () => {
    const fs = new InMemoryFileAdapter({
      "/out/plugins/aidd-dev/.plugin/plugin.json": JSON.stringify({
        version: "1.2.3",
        description: "Development loop",
      }),
    });

    const entry = await buildCopilotMarketplaceContract().buildMarketplaceEntry?.(
      "aidd-dev",
      "/src/plugins/aidd-dev",
      "/out",
      undefined,
      fs
    );

    expect(entry).toStrictEqual({
      name: "aidd-dev",
      source: "aidd-dev",
      description: "Development loop",
      version: "1.2.3",
    });
  });
});

describe("buildCopilotFlatContract()", () => {
  it("sources the same trees as the plugin contract, and neither rules nor commands", () => {
    const { artifacts } = buildCopilotFlatContract();

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
    const skills = supported(buildCopilotFlatContract().artifacts.skills);

    expect({
      path: skills.path("aidd-dev", "skills/01-plan/SKILL.md"),
      rewriteSkillName: skills.rewriteSkillName,
    }).toStrictEqual({
      path: ".github/skills/aidd-dev-01-plan/SKILL.md",
      rewriteSkillName: true,
    });
  });

  it("gives a flat agent the plugin prefix and the .agent.md extension Copilot discovers", () => {
    const agents = supported(buildCopilotFlatContract().artifacts.agents);

    expect({ ext: agents.ext, path: agents.path("aidd-dev", "agents/planner.md") }).toStrictEqual({
      ext: ".agent.md",
      path: ".github/agents/aidd-dev-planner.agent.md",
    });
  });

  it("lands a plugin's hooks declaration beside the other hooks and its scripts under the plugin's own folder", () => {
    const hooks = supported(buildCopilotFlatContract().artifacts.hooks);

    expect({
      declaration: hooks.path("aidd-dev", "hooks/aidd-dev.hooks.json"),
      script: hooks.path("aidd-dev", "hooks/journal.cjs"),
    }).toStrictEqual({
      declaration: ".github/hooks/aidd-dev.hooks.json",
      script: ".github/hooks/aidd-dev/journal.cjs",
    });
  });

  it("flattens a plugin's hooks declaration into the one-entry-per-event shape Copilot reads", () => {
    const hooks = supported(buildCopilotFlatContract().artifacts.hooks);

    expect(hooks.hooksTransform?.(HOOKS_JSON)).toBe(
      `${JSON.stringify(
        {
          version: 1,
          hooks: {
            SessionStart: [{ type: "command", command: "node journal.cjs", timeout: 30 }],
          },
        },
        null,
        2
      )}\n`
    );
  });

  it("adds a plugin's mcp servers to the workspace .vscode/mcp.json under servers", () => {
    const mcp = supported(buildCopilotFlatContract().artifacts.mcp);

    expect({
      path: mcp.path("aidd-dev", ".mcp.json"),
      mcpServersKey: mcp.mcpServersKey,
      mergeDest: mcp.mergeDest?.("/out"),
      merged: mcp.merge?.(null, { "aidd-dev-context": { command: "node" } }, false),
    }).toStrictEqual({
      path: ".vscode/mcp.json",
      mcpServersKey: "servers",
      mergeDest: "/out/.vscode/mcp.json",
      merged: {
        mergedContent:
          '{\n  "servers": {\n    "aidd-dev-context": {\n      "command": "node"\n    }\n  }\n}\n',
        collisions: [],
      },
    });
  });

  it("renames a flat agent after its plugin, drops what Copilot cannot read, and points its references at their flat destinations", () => {
    const transform = supported(buildCopilotFlatContract().artifacts.agents).transform;

    expect(transform?.(AGENT_SOURCE, "aidd-dev", "planner.md")).toBe(
      [
        "---",
        "name: 'aidd-dev-planner'",
        "description: 'Plans the work'",
        "model: 'opus'",
        "---",
        "Read [SKILL.md](../skills/aidd-dev-01-plan/SKILL.md)",
        "Ask [reviewer.md](./aidd-dev-reviewer.agent.md)",
        "Run [journal.cjs](../../hooks/journal.cjs)",
        "",
      ].join("\n")
    );
  });
});
