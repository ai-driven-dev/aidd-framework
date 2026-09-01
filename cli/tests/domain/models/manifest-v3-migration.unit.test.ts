import { describe, expect, it } from "vitest";
import { Manifest } from "../../../src/domain/models/manifest.js";
import { Plugin } from "../../../src/domain/models/plugin.js";
import { DuplicatePluginError, PluginNotFoundError } from "../../../src/kernel/errors.js";
import type { ToolId } from "../../../src/kernel/tool.js";

const CLAUDE = "claude" as ToolId;
const CURSOR = "cursor" as ToolId;

const makeV2Manifest = () => ({
  version: 2,
  docsDir: "aidd_docs",
  repo: "owner/repo",
  tools: {
    claude: {
      toolId: "claude",
      version: "3.0.0",
      files: [{ relativePath: ".claude/CLAUDE.md", hash: "a".repeat(32) }],
      mergeFiles: [],
    },
    cursor: {
      toolId: "cursor",
      version: "1.0.0",
      files: [{ relativePath: ".cursor/rules/naming.md", hash: "b".repeat(32) }],
    },
  },
  docs: null,
  scripts: null,
});

const makePlugin = (name = "my-plugin") =>
  Plugin.fromJSON({
    name,
    source: { kind: "github", repo: "owner/my-plugin" },
    version: "1.0.0",
    strict: false,
    files: { [`.claude/plugins/${name}/README.md`]: "c".repeat(32) },
  });

describe("Manifest v2 → v3 migration", () => {
  it("migrates v2 manifest with multiple tools: each tool has plugins: []", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    expect(manifest.getPlugins(CLAUDE)).toHaveLength(0);
    expect(manifest.getPlugins(CURSOR)).toHaveLength(0);
  });

  it("migrated manifest serializes with version 6", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    expect(manifest.toJSON().version).toBe(6);
  });
});

describe("Manifest v1 → v3 chain", () => {
  it("migrates v1 manifest preserving non-vscode copilot files and adding plugins: []", () => {
    const v1 = {
      version: 1,
      docsDir: "aidd_docs",
      tools: {
        copilot: {
          toolId: "copilot",
          version: "1.0.0",
          files: [
            { relativePath: ".github/agents/alexia.agent.md", hash: "d".repeat(32) },
            { relativePath: ".vscode/settings.json", hash: "e".repeat(32) },
          ],
        },
      },
      docs: null,
      scripts: null,
    };
    const manifest = Manifest.fromJSON(v1);
    const copilotFiles = manifest.getToolFiles("copilot" as ToolId);
    expect(copilotFiles.some((f) => f.relativePath === ".github/agents/alexia.agent.md")).toBe(
      true
    );
    expect(copilotFiles.some((f) => f.relativePath === ".vscode/settings.json")).toBe(false);
    expect(manifest.getPlugins("copilot" as ToolId)).toHaveLength(0);
    expect(manifest.toJSON().version).toBe(6);
  });
});

describe("Manifest v3 round-trip", () => {
  it("serializes and re-parses a v3 manifest with plugins", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    manifest.addPlugin(CLAUDE, makePlugin("cool-plugin"));
    const serialized = manifest.toJSON();
    const reparsed = Manifest.fromJSON(serialized);
    const plugins = reparsed.getPlugins(CLAUDE);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("cool-plugin");
    expect(plugins[0].version).toBe("1.0.0");
  });

  it("round-trips a manifest with no plugins identically to one without plugin field", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    const json = manifest.toJSON();
    expect(json.tools.claude.plugins).toBeUndefined();
    expect(json.tools.cursor.plugins).toBeUndefined();
  });
});

describe("addPlugin()", () => {
  it("adds a plugin to the specified tool", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    manifest.addPlugin(CLAUDE, makePlugin());
    expect(manifest.getPlugins(CLAUDE)).toHaveLength(1);
  });

  it("throws DuplicatePluginError when adding a plugin with the same name", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    manifest.addPlugin(CLAUDE, makePlugin("dup"));
    expect(() => manifest.addPlugin(CLAUDE, makePlugin("dup"))).toThrow(DuplicatePluginError);
  });

  it("does not affect other tools", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    manifest.addPlugin(CLAUDE, makePlugin());
    expect(manifest.getPlugins(CURSOR)).toHaveLength(0);
  });
});

describe("removePlugin()", () => {
  it("removes a plugin by name", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    manifest.addPlugin(CLAUDE, makePlugin("to-remove"));
    manifest.removePlugin(CLAUDE, "to-remove");
    expect(manifest.getPlugins(CLAUDE)).toHaveLength(0);
  });

  it("throws PluginNotFoundError when plugin does not exist", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    expect(() => manifest.removePlugin(CLAUDE, "ghost")).toThrow(PluginNotFoundError);
  });

  it("does not remove a plugin from the wrong tool", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    manifest.addPlugin(CLAUDE, makePlugin("shared-name"));
    expect(() => manifest.removePlugin(CURSOR, "shared-name")).toThrow(PluginNotFoundError);
  });
});

describe("isFileTracked() with plugins", () => {
  it("returns true for a file tracked inside a plugin", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    manifest.addPlugin(CLAUDE, makePlugin("my-plugin"));
    expect(manifest.isFileTracked(".claude/plugins/my-plugin/README.md")).toBe(true);
  });

  it("returns false for an untracked file not in any plugin", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    expect(manifest.isFileTracked(".claude/plugins/unknown/README.md")).toBe(false);
  });
});

describe("addTool() preserves existing plugins on re-add", () => {
  it("keeps plugins when addTool is called again", () => {
    const manifest = Manifest.fromJSON(makeV2Manifest());
    manifest.addPlugin(CLAUDE, makePlugin("keep-me"));
    manifest.addTool(CLAUDE, "4.0.0", []);
    expect(manifest.getPlugins(CLAUDE)).toHaveLength(1);
    expect(manifest.getPlugins(CLAUDE)[0].name).toBe("keep-me");
  });
});
