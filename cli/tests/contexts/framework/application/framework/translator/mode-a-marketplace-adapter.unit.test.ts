// Idempotency and the empty-marketplace-list case live on MarketplaceSyncSettingsUseCase; this
// translator only registers the plugin reference in the manifest, with empty files.
import "../../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { describe, expect, it } from "vitest";
import { ModeAMarketplaceTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-a-marketplace-translator.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";

function buildDist(name = "test-plugin"): PluginDistribution {
  return new PluginDistribution({
    manifest: { name, version: "1.0.0" },
    format: "claude",
    files: [{ relativePath: "commands/hello.md", content: "# Hello" }],
    components: { commands: [], agents: [], rules: [], skills: [], hooks: [], mcp: [] },
  });
}

function buildAdapter() {
  const fs = new InMemoryFileAdapter();
  return { adapter: new ModeAMarketplaceTranslator(), fs };
}

describe("ModeAMarketplaceTranslator", () => {
  describe("mode discriminant", () => {
    it("exposes mode as marketplace", () => {
      const { adapter } = buildAdapter();
      expect(adapter.mode).toBe("marketplace");
    });
  });

  describe("when adding a plugin for a native tool with marketplace", () => {
    it("registers plugin in manifest with empty files (no materialization)", async () => {
      const { adapter } = buildAdapter();
      const manifest = Manifest.create();
      manifest.addTool("claude", "test", []);
      const dist = buildDist("aidd-context");
      await adapter.addPlugin(
        dist,
        "claude",
        { kind: "local", path: "/plugin-source" },
        "/project",
        manifest,
        "aidd-framework"
      );
      const plugins = manifest.getPlugins("claude");
      const installed = plugins.find((p) => p.name === "aidd-context");
      expect(installed).toBeDefined();
      expect(installed?.files.size).toBe(0);
      expect(installed?.marketplace).toBe("aidd-framework");
    });

    it("reports nothing skipped, since nothing was translated", async () => {
      const { adapter } = buildAdapter();
      const manifest = Manifest.create();
      manifest.addTool("claude", "test", []);

      const result = await adapter.addPlugin(
        buildDist("aidd-context"),
        "claude",
        { kind: "local", path: "/plugin-source" },
        "/project",
        manifest,
        "aidd-framework"
      );

      expect(result).toStrictEqual({ skipped: [] });
    });
  });

  describe("when adding a plugin without marketplace", () => {
    it("registers plugin in manifest with undefined marketplace", async () => {
      const { adapter } = buildAdapter();
      const manifest = Manifest.create();
      manifest.addTool("claude", "test", []);
      const dist = buildDist("test-plugin");
      await adapter.addPlugin(
        dist,
        "claude",
        { kind: "local", path: "/plugin-source" },
        "/project",
        manifest,
        undefined
      );
      const plugins = manifest.getPlugins("claude");
      const installed = plugins.find((p) => p.name === "test-plugin");
      expect(installed).toBeDefined();
      expect(installed?.marketplace).toBeUndefined();
      expect(installed?.files.size).toBe(0);
    });
  });

  describe("when filesystem is not written", () => {
    it("does not write any files to the filesystem", async () => {
      const { adapter, fs } = buildAdapter();
      const manifest = Manifest.create();
      manifest.addTool("claude", "test", []);
      const dist = buildDist("test-plugin");
      await adapter.addPlugin(
        dist,
        "claude",
        { kind: "local", path: "/plugin-source" },
        "/project",
        manifest,
        "aidd-framework"
      );
      expect(fs.has("/project/.claude/plugins/test-plugin/commands/hello.md")).toBe(false);
    });
  });
});
