import { describe, expect, it } from "vitest";
import type {
  ArtifactContract,
  ArtifactSource,
} from "../../../../../../src/contexts/tools/domain/build-contract.js";
import {
  buildCodexContract,
  buildCodexFlatContract,
} from "../../../../../../src/contexts/tools/domain/profiles/codex/build.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";

const AGENT_SOURCE = [
  "---",
  "name: planner",
  "description: Plans the work",
  "model: opus",
  "---",
  "Plan before building.",
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

describe("buildCodexContract()", () => {
  it("declares Codex's own plugin manifest path, schema and root token", () => {
    const contract = buildCodexContract();

    expect({
      pluginRootToken: contract.pluginRootToken,
      manifestFileRelative: contract.manifestFileRelative,
      manifestSchemaName: contract.manifestSchemaName,
    }).toStrictEqual({
      pluginRootToken: "$" + "{PLUGIN_ROOT}",
      manifestFileRelative: ".codex-plugin/plugin.json",
      manifestSchemaName: "codex-plugin-manifest",
    });
  });

  it("synthesizes a manifest pointing skills at one directory, and naming no agents", () => {
    const manifest = buildCodexContract().synthesizeManifest?.(
      {
        name: "aidd-dev",
        description: "Development loop",
        version: "1.2.3",
        license: "MIT",
        keywords: ["aidd"],
      },
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
      license: "MIT",
      keywords: ["aidd"],
      skills: "./skills",
      hooks: "./hooks/hooks.json",
      mcpServers: "./.mcp.json",
    });
  });

  it("omits from the manifest every field the source plugin never declared", () => {
    const manifest = buildCodexContract().synthesizeManifest?.(
      { name: "aidd-dev" },
      {
        hasAgents: false,
        agentsList: [],
        skillsList: [],
        hasHooksJson: false,
        hasMcpJson: false,
      }
    );

    expect(manifest).toStrictEqual({ name: "aidd-dev" });
  });

  it("sources skills, agents, mcp and hooks from the plugin tree, and neither rules nor commands", () => {
    const { artifacts } = buildCodexContract();

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

  it("stages an agent as TOML beside the plugin tree and leaves every other artifact where it was", () => {
    const { artifacts } = buildCodexContract();

    expect({
      skill: supported(artifacts.skills).path("aidd-dev", "skills/01-plan/SKILL.md"),
      agent: supported(artifacts.agents).path("aidd-dev", "agents/planner.md"),
      mcp: supported(artifacts.mcp).path("aidd-dev", ".mcp.json"),
      hook: supported(artifacts.hooks).path("aidd-dev", "hooks/journal.cjs"),
    }).toStrictEqual({
      skill: "skills/01-plan/SKILL.md",
      agent: "codex-agents/planner.toml",
      mcp: ".mcp.json",
      hook: "hooks/journal.cjs",
    });
  });

  it("keeps only the three frontmatter fields Codex reads in a skill", () => {
    const transform = supported(buildCodexContract().artifacts.skills).transform;

    expect(
      transform?.(
        "---\nname: plan\ndescription: Plan it\nmodel: opus\n---\nBody.\n",
        "aidd-dev",
        "SKILL.md"
      )
    ).toBe("---\nname: 'plan'\ndescription: 'Plan it'\n---\nBody.\n");
  });

  it("names an agent after its own frontmatter when the plugin tree keeps them apart", () => {
    const transform = supported(buildCodexContract().artifacts.agents).transform;

    expect(transform?.(AGENT_SOURCE, "aidd-dev", "planner.md")).toBe(
      'name = "planner"\ndescription = "Plans the work"\ndeveloper_instructions = "Plan before building.\\n"\n'
    );
  });

  it("renames the events of a plugin's hooks declaration, and copies every other hook file byte for byte", () => {
    const transform = supported(buildCodexContract().artifacts.hooks).transform;

    expect({
      declaration: transform?.(HOOKS_JSON, "aidd-dev", "hooks.json"),
      script: transform?.("#!/usr/bin/env node\n", "aidd-dev", "journal.cjs"),
    }).toStrictEqual({
      declaration: `${JSON.stringify(
        { hooks: { SessionEnd: [{ hooks: [{ type: "command", command: "node journal.cjs" }] }] } },
        null,
        2
      )}\n`,
      script: "#!/usr/bin/env node\n",
    });
  });

  it("builds the catalog Codex discovers, at .agents/plugins/marketplace.json", async () => {
    const built = await buildCodexContract().buildMarketplaceCatalog?.(
      { name: "aidd", displayName: "AI Driven Dev", plugins: [] },
      [{ name: "aidd-dev" }],
      new InMemoryFileAdapter()
    );

    expect(built).toStrictEqual({
      catalog: {
        name: "aidd",
        interface: { displayName: "AI Driven Dev" },
        plugins: [{ name: "aidd-dev" }],
      },
      schemaName: "codex-marketplace",
      destRelPath: ".agents/plugins/marketplace.json",
    });
  });

  it("builds a catalog entry carrying the installation, authentication and category Codex requires", async () => {
    const entry = await buildCodexContract().buildMarketplaceEntry?.(
      "aidd-dev",
      "/src/plugins/aidd-dev",
      "/out",
      { name: "aidd-dev" },
      new InMemoryFileAdapter()
    );

    expect(entry).toStrictEqual({
      name: "aidd-dev",
      source: { source: "local", path: "./plugins/aidd-dev" },
      policy: { installation: "AVAILABLE", authentication: "ON_USE" },
      category: "Developer Tools",
    });
  });
});

describe("buildCodexFlatContract()", () => {
  it("writes no manifest and no marketplace of its own", () => {
    const contract = buildCodexFlatContract();

    expect({
      manifestFileRelative: contract.manifestFileRelative,
      synthesizeManifest: contract.synthesizeManifest,
      manifestSchemaName: contract.manifestSchemaName,
      buildMarketplaceCatalog: contract.buildMarketplaceCatalog,
      buildMarketplaceEntry: contract.buildMarketplaceEntry,
    }).toStrictEqual({
      manifestFileRelative: null,
      synthesizeManifest: null,
      manifestSchemaName: null,
      buildMarketplaceCatalog: null,
      buildMarketplaceEntry: null,
    });
  });

  it("sources skills, agents and hooks from the plugin tree, and leaves mcp to the config artifact", () => {
    const { artifacts } = buildCodexFlatContract();

    expect({
      skills: sourceOf(artifacts.skills),
      agents: sourceOf(artifacts.agents),
      hooks: sourceOf(artifacts.hooks),
      mcp: artifacts.mcp,
      rules: artifacts.rules,
      commands: artifacts.commands,
    }).toStrictEqual({
      skills: { kind: "fullTree", srcDir: "skills" },
      agents: { kind: "filteredTree", srcDir: "agents", inputExt: ".md" },
      hooks: { kind: "hooksBundle", jsonPath: "hooks/hooks.json", scriptDir: "hooks" },
      mcp: { supported: false },
      rules: { supported: false },
      commands: { supported: false },
    });
  });

  it("prefixes a flat skill's own folder with the plugin name, and renames the skill itself", () => {
    const skills = supported(buildCodexFlatContract().artifacts.skills);

    expect({
      path: skills.path("aidd-dev", "skills/01-plan/SKILL.md"),
      rewriteSkillName: skills.rewriteSkillName,
    }).toStrictEqual({
      path: ".agents/skills/aidd-dev-01-plan/SKILL.md",
      rewriteSkillName: true,
    });
  });

  it("prefixes a flat agent's TOML with the plugin name, in Codex's own agents directory", () => {
    const agents = supported(buildCodexFlatContract().artifacts.agents);

    expect(agents.path("aidd-dev", "agents/planner.md")).toBe(
      ".codex/agents/aidd-dev-planner.toml"
    );
  });

  it("names a flat agent after its plugin, whatever its own frontmatter says", () => {
    const transform = supported(buildCodexFlatContract().artifacts.agents).transform;

    expect(transform?.(AGENT_SOURCE, "aidd-dev", "planner.md")).toBe(
      'name = "aidd-dev-planner"\ndescription = "Plans the work"\ndeveloper_instructions = "Plan before building.\\n"\n'
    );
  });

  it("nests a plugin's hook scripts under its own folder and merges its declaration into .codex/hooks.json", () => {
    const hooks = supported(buildCodexFlatContract().artifacts.hooks);

    expect({
      script: hooks.path("aidd-dev", "hooks/journal.cjs"),
      mergeDest: hooks.hooksMergeDest?.("/out"),
      merged: hooks.hooksMerge?.(null, HOOKS_JSON),
    }).toStrictEqual({
      script: ".codex/hooks/aidd-dev/journal.cjs",
      mergeDest: "/out/.codex/hooks.json",
      merged: {
        content: `${JSON.stringify(
          {
            hooks: { SessionEnd: [{ hooks: [{ type: "command", command: "node journal.cjs" }] }] },
          },
          null,
          2
        )}\n`,
        warnings: [],
      },
    });
  });

  it("writes one config.toml holding every built plugin's mcp servers, under its plugin prefix", async () => {
    const fs = new InMemoryFileAdapter({
      "/src/plugins/aidd-dev/.mcp.json": JSON.stringify({
        mcpServers: { context: { command: "node" } },
      }),
    });

    const written = await buildCodexFlatContract().emitConfigArtifact?.(
      ["aidd-dev", "aidd-pm"],
      "/out",
      "/src",
      fs,
      { validate: () => undefined },
      { loadConfigAsset: () => ({}), loadSchema: () => ({}) }
    );

    expect({ written, config: fs.getFile("/out/.codex/config.toml") }).toStrictEqual({
      written: 1,
      config:
        'project_doc_max_bytes = 262144\n\n[mcp_servers.aidd-dev-context]\ncommand = "node"\n\n[features]\nhooks = true\n',
    });
  });
});
