import { describe, expect, it } from "vitest";
import type { PluginPresenceFlags } from "../../../../src/application/use-cases/framework/strategies/marketplace-strategy-helpers.js";
import {
  buildClaudeStyleMarketplace,
  buildClaudeStyleMarketplaceEntry,
  synthesizeClaudeStyleManifest,
} from "../../../../src/application/use-cases/framework/strategies/marketplace-strategy-helpers.js";

const EMPTY_PRESENCE: PluginPresenceFlags = {
  hasAgents: false,
  agentsList: [],
  skillsList: [],
  hasHooksJson: false,
  hasMcpJson: false,
};

const FULL_PRESENCE: PluginPresenceFlags = {
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
        manifestDir: ".claude-plugin",
        agentsField: true,
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
        manifestDir: ".claude-plugin",
        agentsField: true,
      });
      expect(result.description).toBeUndefined();
      expect(result.version).toBeUndefined();
      expect(result.author).toBeUndefined();
    });
  });

  describe("agents field", () => {
    it("includes agents as ./agents/*.md file paths when agentsField:true and agents present", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        manifestDir: ".claude-plugin",
        agentsField: true,
      });
      expect(result.agents).toEqual([
        "./agents/implementer.md",
        "./agents/planner.md",
        "./agents/reviewer.md",
      ]);
    });

    it("omits agents when agentsField:true but no agents present", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, EMPTY_PRESENCE, {
        manifestDir: ".claude-plugin",
        agentsField: true,
      });
      expect(result.agents).toBeUndefined();
    });

    it("omits agents when agentsField:false even if hasAgents:true", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        manifestDir: ".codex-plugin",
        agentsField: false,
      });
      expect(result.agents).toBeUndefined();
    });
  });

  describe("conditional fields", () => {
    it("includes skills array when skillsList is non-empty", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        manifestDir: ".claude-plugin",
        agentsField: true,
      });
      expect(result.skills).toEqual(["./skills/commit", "./skills/plan"]);
    });

    it("omits skills when skillsList is empty", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, EMPTY_PRESENCE, {
        manifestDir: ".claude-plugin",
        agentsField: true,
      });
      expect(result.skills).toBeUndefined();
    });

    it("includes hooks when hasHooksJson:true", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        manifestDir: ".claude-plugin",
        agentsField: true,
      });
      expect(result.hooks).toBe("./hooks/hooks.json");
    });

    it("omits hooks when hasHooksJson:false", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, EMPTY_PRESENCE, {
        manifestDir: ".claude-plugin",
        agentsField: true,
      });
      expect(result.hooks).toBeUndefined();
    });

    it("includes mcpServers when hasMcpJson:true", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        manifestDir: ".claude-plugin",
        agentsField: true,
      });
      expect(result.mcpServers).toBe("./.mcp.json");
    });

    it("omits mcpServers when hasMcpJson:false", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, EMPTY_PRESENCE, {
        manifestDir: ".claude-plugin",
        agentsField: true,
      });
      expect(result.mcpServers).toBeUndefined();
    });
  });

  describe("manifestDir variants", () => {
    it("accepts .cursor-plugin as manifestDir (field set unchanged)", () => {
      const result = synthesizeClaudeStyleManifest(BASE_SOURCE, FULL_PRESENCE, {
        manifestDir: ".cursor-plugin",
        agentsField: true,
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
        manifestDir: ".plugin",
        agentsField: true,
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
        manifestDir: ".claude-plugin",
        agentsField: true,
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

describe("buildClaudeStyleMarketplaceEntry", () => {
  it("builds entry with name, source, description, version", () => {
    const entry = buildClaudeStyleMarketplaceEntry("aidd-dev", "AI Dev plugin", "1.0.0", undefined);
    expect(entry.name).toBe("aidd-dev");
    expect(entry.source).toBe("./plugins/aidd-dev");
    expect(entry.description).toBe("AI Dev plugin");
    expect(entry.version).toBe("1.0.0");
  });

  it("passes through strict and recommended when present", () => {
    const entry = buildClaudeStyleMarketplaceEntry("aidd-dev", "desc", "1.0.0", {
      strict: true,
      recommended: false,
    });
    expect(entry.strict).toBe(true);
    expect(entry.recommended).toBe(false);
  });

  it("omits strict and recommended when absent", () => {
    const entry = buildClaudeStyleMarketplaceEntry("aidd-dev", "desc", "1.0.0", undefined);
    expect(entry.strict).toBeUndefined();
    expect(entry.recommended).toBeUndefined();
  });

  it("only includes strict when it is boolean (not string/number)", () => {
    const entry = buildClaudeStyleMarketplaceEntry("aidd-dev", "desc", "1.0.0", { strict: true });
    expect(typeof entry.strict).toBe("boolean");
  });
});
