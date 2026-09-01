import "../../../../../src/domain/tools/ai/claude.js";
import "../../../../../src/domain/tools/ai/opencode.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../src/application/use-cases/framework/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../src/domain/models/manifest.js";
import { PluginDistribution } from "../../../../../src/domain/models/plugin-distribution.js";
import { CursorProjectScopeUnsupportedError } from "../../../../../src/kernel/errors.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";

function buildDist(name = "test-plugin"): PluginDistribution {
  return new PluginDistribution({
    manifest: { name, version: "1.0.0" },
    format: "claude",
    files: [
      { relativePath: "commands/hello.md", content: "---\nname: aidd:01:hello\n---\n# Hello" },
    ],
    components: {
      commands: [
        { relativePath: "commands/hello.md", content: "---\nname: aidd:01:hello\n---\n# Hello" },
      ],
      agents: [],
      rules: [],
      skills: [],
      hooks: [],
      mcp: [],
    },
  });
}

function buildAdapter(homedir = "/stub-home") {
  const fs = new InMemoryFileAdapter();
  const hasher = new DeterministicHasher();
  return { adapter: new ModeBFlatMaterializationTranslator(fs, hasher, () => homedir), fs };
}

describe("ModeBFlatMaterializationTranslator", () => {
  describe("mode discriminant", () => {
    it("exposes mode as flat", () => {
      const { adapter } = buildAdapter();
      expect(adapter.mode).toBe("flat");
    });
  });

  describe("when tool is flat mode", () => {
    it("materializes plugin files in the correct output directory", async () => {
      const { adapter, fs } = buildAdapter();
      const manifest = Manifest.create();
      manifest.addTool("opencode", "test", []);
      const dist = buildDist("test-plugin");
      await adapter.addPlugin(
        dist,
        "opencode",
        { kind: "local", path: "/plugin-source" },
        PROJECT_ROOT,
        manifest,
        undefined,
        "docs"
      );
      const expectedPath = join(PROJECT_ROOT, ".opencode/commands/test-plugin/hello.md");
      expect(fs.has(expectedPath)).toBe(true);
    });

    it("registers plugin in manifest with non-empty files", async () => {
      const { adapter } = buildAdapter();
      const manifest = Manifest.create();
      manifest.addTool("opencode", "test", []);
      const dist = buildDist("test-plugin");
      await adapter.addPlugin(
        dist,
        "opencode",
        { kind: "local", path: "/plugin-source" },
        PROJECT_ROOT,
        manifest,
        undefined,
        "docs"
      );
      const plugins = manifest.getPlugins("opencode");
      const installed = plugins.find((p) => p.name === "test-plugin");
      expect(installed).toBeDefined();
      expect(installed?.files.size).toBeGreaterThan(0);
    });
  });

  describe("when plugin distribution produces no files for the tool", () => {
    it("writes no files and does not add plugin to manifest", async () => {
      const { adapter, fs } = buildAdapter();
      const manifest = Manifest.create();
      manifest.addTool("opencode", "test", []);
      const emptyDist = new PluginDistribution({
        manifest: { name: "empty-plugin", version: "1.0.0" },
        format: "claude",
        files: [],
        components: { commands: [], agents: [], rules: [], skills: [], hooks: [], mcp: [] },
      });
      await adapter.addPlugin(
        emptyDist,
        "opencode",
        { kind: "local", path: "/plugin-source" },
        PROJECT_ROOT,
        manifest,
        undefined,
        "docs"
      );
      expect(fs.listAll().length).toBe(0);
      const plugins = manifest.getPlugins("opencode");
      expect(plugins.find((p) => p.name === "empty-plugin")).toBeUndefined();
    });
  });

  describe("when tool has native mode and project-scope (not user-scope)", () => {
    it("throws CursorProjectScopeUnsupportedError", async () => {
      const { adapter } = buildAdapter();
      const manifest = Manifest.create();
      manifest.addTool("claude", "test", []);
      const dist = buildDist("test-plugin");
      await expect(
        adapter.addPlugin(
          dist,
          "claude",
          { kind: "local", path: "/plugin-source" },
          PROJECT_ROOT,
          manifest,
          undefined,
          "docs"
        )
      ).rejects.toThrow(CursorProjectScopeUnsupportedError);
    });
  });

  describe("when plugin distribution produces zero translated files", () => {
    it("does nothing for a tool that does not translate any files", async () => {
      const { adapter, fs } = buildAdapter();
      const manifest = Manifest.create();
      manifest.addTool("opencode", "test", []);
      // A distribution with mcp-only content which flat mode doesn't translate
      const mcpOnlyDist = new PluginDistribution({
        manifest: { name: "mcp-plugin", version: "1.0.0" },
        format: "claude",
        files: [{ relativePath: ".mcp.json", content: "{}" }],
        components: {
          commands: [],
          agents: [],
          rules: [],
          skills: [],
          hooks: [],
          mcp: [{ relativePath: ".mcp.json", content: "{}" }],
        },
      });
      await adapter.addPlugin(
        mcpOnlyDist,
        "opencode",
        { kind: "local", path: "/plugin-source" },
        PROJECT_ROOT,
        manifest,
        undefined,
        "docs"
      );
      expect(fs.listAll().length).toBe(0);
      const plugins = manifest.getPlugins("opencode");
      expect(plugins.find((p) => p.name === "mcp-plugin")).toBeUndefined();
    });
  });
});
