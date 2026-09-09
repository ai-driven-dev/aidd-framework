import "../../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { CursorProjectScopeUnsupportedError } from "../../../../../../src/kernel/errors.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import {
  errnoError,
  FaultingFileAdapter,
} from "../../../../../helpers/ports/faulting-file-adapter.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";

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
        undefined
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
        undefined
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
        undefined
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
          undefined
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
        undefined
      );
      expect(fs.listAll().length).toBe(0);
      const plugins = manifest.getPlugins("opencode");
      expect(plugins.find((p) => p.name === "mcp-plugin")).toBeUndefined();
    });
  });

  describe("when the tool's MCP config merges the plugin's servers", () => {
    function mcpDist(mcpServers: Record<string, unknown>): PluginDistribution {
      const content = JSON.stringify({ mcpServers });
      return new PluginDistribution({
        manifest: { name: "mcp-plugin", version: "1.0.0" },
        format: "claude",
        files: [{ relativePath: ".mcp.json", content }],
        components: {
          commands: [],
          agents: [],
          rules: [],
          skills: [],
          hooks: [],
          mcp: [{ relativePath: ".mcp.json", content }],
        },
      });
    }

    it("drops the servers a previous version contributed even when the new version contributes none", async () => {
      const { adapter, fs } = buildAdapter();
      const configPath = join(PROJECT_ROOT, "opencode.json");
      fs.setFile(configPath, JSON.stringify({ mcp: { "old-tool": { type: "local" } } }));
      const manifest = Manifest.create();
      manifest.addTool("opencode", "test", []);

      await adapter.addPlugin(
        mcpDist({}),
        "opencode",
        { kind: "local", path: "/plugin-source" },
        PROJECT_ROOT,
        manifest,
        undefined,
        new Map([["old-tool", "digest-of-old-tool"]])
      );

      expect(JSON.parse(fs.getFile(configPath) ?? "null")).toStrictEqual({ mcp: {} });
    });

    it("propagates a failure to read the MCP config other than the file being absent", async () => {
      const fs = new FaultingFileAdapter();
      fs.failOn("readFile", join(PROJECT_ROOT, "opencode.json"), errnoError("EACCES"));
      const adapter = new ModeBFlatMaterializationTranslator(
        fs,
        new DeterministicHasher(),
        () => "/stub-home"
      );
      const manifest = Manifest.create();
      manifest.addTool("opencode", "test", []);

      await expect(
        adapter.addPlugin(
          mcpDist({ "local-tool": { command: "node", args: ["./server.js"] } }),
          "opencode",
          { kind: "local", path: "/plugin-source" },
          PROJECT_ROOT,
          manifest,
          undefined
        )
      ).rejects.toThrow("EACCES: planted by the test");
    });
  });
});
