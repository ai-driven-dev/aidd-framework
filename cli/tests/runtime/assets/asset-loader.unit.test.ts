import { describe, expect, it } from "vitest";
import { parseToml } from "../../../src/contexts/tools/domain/profiles/codex/toml.js";
import { BundledAssetProviderAdapter } from "../../../src/runtime/assets/asset-loader.js";

const provider = new BundledAssetProviderAdapter();

describe("BundledAssetProviderAdapter.loadConfigAsset", () => {
  describe("claude", () => {
    it("returns parsed settings.json with permissions", () => {
      const asset = provider.loadConfigAsset("claude", "settings.json") as Record<string, unknown>;
      expect(asset).toHaveProperty("permissions");
    });
  });

  describe("opencode", () => {
    it("returns parsed opencode.json with instructions array", () => {
      const asset = provider.loadConfigAsset("opencode", "opencode.json") as Record<
        string,
        unknown
      >;
      expect(asset).toHaveProperty("instructions");
    });
  });

  describe("codex", () => {
    it("returns config.toml as raw string", () => {
      const asset = provider.loadConfigAsset("codex", "config.toml");
      expect(typeof asset).toBe("string");
    });

    // Model choice is owned by the account, not this repo: a pinned "gpt-5" is rejected by
    // ChatGPT-account Codex sessions, so Codex's own default applies.
    it("writes no model — the account decides which one it can use", () => {
      const asset = provider.loadConfigAsset("codex", "config.toml") as string;
      const parsed = parseToml(asset);
      expect(parsed).not.toHaveProperty("model");
    });
  });

  describe("copilot", () => {
    it("returns merged vscode-settings.json with ≥26 keys including both asset origins", () => {
      const asset = provider.loadConfigAsset("copilot", "vscode-settings.json") as Record<
        string,
        unknown
      >;
      expect(Object.keys(asset).length).toBeGreaterThanOrEqual(26);
      expect(asset).toHaveProperty("chat.plugins.enabled", true);
      expect(asset).toHaveProperty("chat.useAgentSkills", true);
      expect(asset).toHaveProperty("chat.tools.urls.autoApprove");
      expect(asset).toHaveProperty("github.copilot.chat.agent.autoFix", true);
    });
  });

  describe("vscode", () => {
    it("returns settings.json as object", () => {
      const asset = provider.loadConfigAsset("vscode", "settings.json") as Record<string, unknown>;
      expect(asset).toHaveProperty("editor.formatOnSave");
    });

    it("returns keybindings.json as array", () => {
      const asset = provider.loadConfigAsset("vscode", "keybindings.json");
      expect(Array.isArray(asset)).toBe(true);
    });

    it("returns extensions.json with recommendations", () => {
      const asset = provider.loadConfigAsset("vscode", "extensions.json") as Record<
        string,
        unknown
      >;
      expect(asset).toHaveProperty("recommendations");
    });
  });

  it("throws for an unknown file name", () => {
    expect(() => provider.loadConfigAsset("claude", "missing.json")).toThrow(
      "Bundled asset not found: 'claude/missing.json'"
    );
  });
});

describe("BundledAssetProviderAdapter.loadSchema — marketplace", () => {
  it("returns a Copilot-native schema with required fields including metadata", () => {
    const schema = provider.loadSchema("marketplace") as Record<string, unknown>;
    expect(schema).toHaveProperty("required");
    expect(schema).toHaveProperty("properties");
    const required = schema.required as string[];
    expect(required).toContain("name");
    expect(required).toContain("metadata");
    expect(required).toContain("owner");
    expect(required).toContain("plugins");
  });

  it("requires metadata.pluginRoot in the schema properties", () => {
    const schema = provider.loadSchema("marketplace") as {
      properties: { metadata: { properties: { pluginRoot: unknown } } };
    };
    expect(schema.properties.metadata.properties.pluginRoot).toBeDefined();
  });

  it("documents the awesome-copilot empirical source in $comment", () => {
    const schema = provider.loadSchema("marketplace") as Record<string, unknown>;
    const comment = schema.$comment as string;
    expect(typeof comment).toBe("string");
    expect(comment.toLowerCase()).toContain("awesome-copilot");
  });

  it("returns the same object on a second call (memoized)", () => {
    const first = provider.loadSchema("marketplace");
    const second = provider.loadSchema("marketplace");
    expect(first).toBe(second);
  });
});
