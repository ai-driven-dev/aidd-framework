import { describe, expect, it } from "vitest";
import type { PluginPresence } from "../../../../src/contexts/tools/domain/build-contract.js";
import {
  buildClaudeStyleCatalogEntry,
  buildClaudeStyleEntry,
  buildClaudeStyleMarketplace,
  buildCodexMarketplace,
  buildCodexMarketplaceEntry,
  resolveDescription,
  resolveVersion,
  synthesizeClaudeStyleManifest,
} from "../../../../src/contexts/tools/domain/marketplace-catalog.js";
import { InvalidSourceMarketplaceError } from "../../../../src/kernel/errors.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/index.js";

const EMPTY_PRESENCE: PluginPresence = {
  hasAgents: false,
  agentsList: [],
  skillsList: [],
  hasHooksJson: false,
  hasMcpJson: false,
};

const FULL_PRESENCE: PluginPresence = {
  hasAgents: true,
  agentsList: ["implementer.md", "planner.md", "reviewer.md"],
  skillsList: ["commit", "plan"],
  hasHooksJson: true,
  hasMcpJson: true,
};

const BASE_SOURCE = {
  name: "aidd-dev",
  description: "AI Driven Dev plugin",
  version: "1.2.3",
  author: "Baptiste",
  homepage: "https://example.com",
  repository: "https://github.com/ai-driven-dev/aidd",
  license: "MIT",
  keywords: ["ai", "dev"],
};

describe("synthesizeClaudeStyleManifest", () => {
  describe("passthrough fields", () => {
    it("preserves name, description, version, author, homepage, repository, license, keywords", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, EMPTY_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.name).toBe("aidd-dev");
      expect(result.description).toBe("AI Driven Dev plugin");
      expect(result.version).toBe("1.2.3");
      expect(result.author).toBe("Baptiste");
      expect(result.homepage).toBe("https://example.com");
      expect(result.repository).toBe("https://github.com/ai-driven-dev/aidd");
      expect(result.license).toBe("MIT");
      expect(result.keywords).toEqual(["ai", "dev"]);
    });

    it("omits fields absent from source", () => {
      const result = synthesizeClaudeStyleManifest({ name: "test" }, EMPTY_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.description).toBeUndefined();
      expect(result.version).toBeUndefined();
      expect(result.author).toBeUndefined();
    });
  });

  describe("agents field", () => {
    it("includes agents as ./agents/*.md file paths when agentsField:true and agents present", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.agents).toEqual([
        "./agents/implementer.md",
        "./agents/planner.md",
        "./agents/reviewer.md",
      ]);
    });

    it("omits agents when agentsField:true but no agents present", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, EMPTY_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.agents).toBeUndefined();
    });

    it("omits agents when agentsField:false even if hasAgents:true", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        agentsField: false,
        hooksField: true,
      });
      expect(result.agents).toBeUndefined();
    });
  });

  describe("conditional fields", () => {
    it("includes skills array when skillsList is non-empty", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.skills).toEqual(["./skills/commit", "./skills/plan"]);
    });

    it("omits skills when skillsList is empty", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, EMPTY_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.skills).toBeUndefined();
    });

    it("includes hooks when hasHooksJson:true", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.hooks).toBe("./hooks/hooks.json");
    });

    it("omits hooks when hasHooksJson:false", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, EMPTY_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.hooks).toBeUndefined();
    });

    it("omits hooks when the tool loads that path by convention and refuses a manifest naming it", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        agentsField: true,
        hooksField: false,
      });

      expect(result.hooks).toBeUndefined();
    });

    it("includes mcpServers when hasMcpJson:true", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.mcpServers).toBe("./.mcp.json");
    });

    it("omits mcpServers when hasMcpJson:false", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, EMPTY_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.mcpServers).toBeUndefined();
    });
  });

  describe("manifestDir variants", () => {
    it("accepts .cursor-plugin as manifestDir (field set unchanged)", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.agents).toEqual([
        "./agents/implementer.md",
        "./agents/planner.md",
        "./agents/reviewer.md",
      ]);
      expect(result.name).toBe("aidd-dev");
    });

    it("accepts .plugin as manifestDir (field set unchanged)", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      expect(result.agents).toEqual([
        "./agents/implementer.md",
        "./agents/planner.md",
        "./agents/reviewer.md",
      ]);
    });
  });

  describe("key insertion order", () => {
    it("emits keys in deterministic order: name, description, version, author, ..., agents, skills, hooks, mcpServers", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        agentsField: true,
        hooksField: true,
      });
      const keys = Object.keys(result);
      const agentsIdx = keys.indexOf("agents");
      const skillsIdx = keys.indexOf("skills");
      const hooksIdx = keys.indexOf("hooks");
      const mcpIdx = keys.indexOf("mcpServers");
      expect(agentsIdx).toBeLessThan(skillsIdx);
      expect(skillsIdx).toBeLessThan(hooksIdx);
      expect(hooksIdx).toBeLessThan(mcpIdx);
      expect(keys.indexOf("name")).toBe(0);
    });
  });
});

describe("buildClaudeStyleMarketplace", () => {
  const ENTRIES = [
    { name: "aidd-dev", source: "./plugins/aidd-dev", description: "Dev", version: "1.0.0" },
  ];

  it("emits name, plugins as required fields", () => {
    const result = buildClaudeStyleMarketplace(
      { name: "aidd-framework", owner: { name: "AIDD" } },
      ENTRIES
    );
    expect(result.name).toBe("aidd-framework");
    expect(result.plugins).toEqual(ENTRIES);
  });

  it("includes version and description when present", () => {
    const result = buildClaudeStyleMarketplace(
      { name: "aidd-fw", version: "2.0.0", description: "Full", owner: { name: "X" } },
      ENTRIES
    );
    expect(result.version).toBe("2.0.0");
    expect(result.description).toBe("Full");
  });

  it("omits version and description when absent", () => {
    const result = buildClaudeStyleMarketplace({ name: "fw", owner: { name: "X" } }, ENTRIES);
    expect(result.version).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it("includes owner when present", () => {
    const owner = { name: "AIDD" };
    const result = buildClaudeStyleMarketplace({ name: "fw", owner }, ENTRIES);
    expect(result.owner).toEqual(owner);
  });
});

describe("buildClaudeStyleCatalogEntry", () => {
  it("builds entry with name, source, description, version", () => {
    const entry = buildClaudeStyleCatalogEntry("aidd-dev", "AI Dev plugin", "1.0.0", undefined);
    expect(entry.name).toBe("aidd-dev");
    expect(entry.source).toBe("./plugins/aidd-dev");
    expect(entry.description).toBe("AI Dev plugin");
    expect(entry.version).toBe("1.0.0");
  });

  it("passes strict through, and recommended under metadata, where Claude Code does not warn", () => {
    const entry = buildClaudeStyleCatalogEntry("aidd-dev", "desc", "1.0.0", {
      strict: true,
      metadata: { recommended: false },
    });
    expect(entry.strict).toBe(true);
    expect(entry.metadata).toStrictEqual({ recommended: false });
    expect(entry).not.toHaveProperty("recommended");
  });

  it("omits strict and metadata when absent", () => {
    const entry = buildClaudeStyleCatalogEntry("aidd-dev", "desc", "1.0.0", undefined);
    expect(entry.strict).toBeUndefined();
    expect(entry.metadata).toBeUndefined();
  });

  it("only includes strict when it is boolean (not string/number)", () => {
    const entry = buildClaudeStyleCatalogEntry("aidd-dev", "desc", "1.0.0", { strict: true });
    expect(typeof entry.strict).toBe("boolean");
  });
});

describe("synthesizeClaudeStyleManifest, field by field", () => {
  const opts = { agentsField: true, hooksField: true };

  it("writes no key at all for a source declaring nothing", () => {
    expect(synthesizeClaudeStyleManifest({}, EMPTY_PRESENCE, opts)).toStrictEqual({});
  });

  it("keeps an author given as an object or a string, and drops one of any other type", () => {
    expect(
      synthesizeClaudeStyleManifest({ author: { name: "B" } }, EMPTY_PRESENCE, opts)
    ).toStrictEqual({ author: { name: "B" } });
    expect(synthesizeClaudeStyleManifest({ author: "B" }, EMPTY_PRESENCE, opts)).toStrictEqual({
      author: "B",
    });
    expect(synthesizeClaudeStyleManifest({ author: 7 }, EMPTY_PRESENCE, opts)).toStrictEqual({});
  });

  it("drops a name, description or version that is not a string", () => {
    expect(
      synthesizeClaudeStyleManifest({ name: 1, description: 2, version: 3 }, EMPTY_PRESENCE, opts)
    ).toStrictEqual({});
  });
});

describe("buildClaudeStyleMarketplace, field by field", () => {
  it("writes only the name and the plugins for a source declaring nothing else", () => {
    expect(buildClaudeStyleMarketplace({ name: "m" }, [])).toStrictEqual({
      name: "m",
      plugins: [],
    });
  });
});

describe("resolving a catalog entry's version and description", () => {
  const MANIFEST = "/out/plugins/p/.claude-plugin/plugin.json";

  it("takes the marketplace entry's own version and description without opening the manifest", async () => {
    const fs = new InMemoryFileAdapter();

    expect(
      await resolveVersion(fs, "p", { version: "9.9.9" }, "/out", ".claude-plugin/plugin.json")
    ).toBe("9.9.9");
    expect(
      await resolveDescription(
        fs,
        "p",
        { description: "from entry" },
        "/out",
        ".claude-plugin/plugin.json"
      )
    ).toBe("from entry");
  });

  it("falls back to the built manifest, and names what is missing when neither side has it", async () => {
    const fs = new InMemoryFileAdapter({
      [MANIFEST]: JSON.stringify({ version: "1.0.0", description: "" }),
    });

    expect(await resolveVersion(fs, "p", undefined, "/out", ".claude-plugin/plugin.json")).toBe(
      "1.0.0"
    );
    await expect(
      resolveDescription(fs, "p", {}, "/out", ".claude-plugin/plugin.json")
    ).rejects.toThrow(
      new InvalidSourceMarketplaceError(
        "plugin 'p' has no description in marketplace entry or plugin.json"
      )
    );
    await expect(
      resolveVersion(
        new InMemoryFileAdapter({ [MANIFEST]: "{}" }),
        "p",
        {},
        "/out",
        ".claude-plugin/plugin.json"
      )
    ).rejects.toThrow(
      new InvalidSourceMarketplaceError(
        "plugin 'p' has no version in marketplace entry or plugin.json"
      )
    );
  });

  it("shapes the whole entry from both resolutions", async () => {
    const fs = new InMemoryFileAdapter({
      [MANIFEST]: JSON.stringify({ version: "1.0.0", description: "built" }),
    });

    expect(
      await buildClaudeStyleEntry("p", "/out", { strict: true }, ".claude-plugin/plugin.json", fs)
    ).toStrictEqual({
      name: "p",
      source: "./plugins/p",
      description: "built",
      version: "1.0.0",
      strict: true,
    });
  });
});

describe("a Codex marketplace catalog", () => {
  it("falls back to the marketplace name as its display name", () => {
    expect(buildCodexMarketplace({ name: "m" }, [])).toStrictEqual({
      name: "m",
      interface: { displayName: "m" },
      plugins: [],
    });
    expect(buildCodexMarketplace({ name: "m", displayName: "Mine" }, []).interface).toStrictEqual({
      displayName: "Mine",
    });
  });

  it("defaults an entry's authentication and category, and takes a string override for each", () => {
    expect(buildCodexMarketplaceEntry("p", undefined)).toStrictEqual({
      name: "p",
      source: { source: "local", path: "./plugins/p" },
      policy: { installation: "AVAILABLE", authentication: "ON_USE" },
      category: "Developer Tools",
    });
    expect(
      buildCodexMarketplaceEntry("p", { authentication: "NEVER", category: "Testing" })
    ).toMatchObject({
      policy: { installation: "AVAILABLE", authentication: "NEVER" },
      category: "Testing",
    });
    expect(buildCodexMarketplaceEntry("p", { authentication: 1, category: null })).toMatchObject({
      policy: { authentication: "ON_USE" },
      category: "Developer Tools",
    });
  });
});
