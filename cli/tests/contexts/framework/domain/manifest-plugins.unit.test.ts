import { describe, expect, it } from "vitest";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { DuplicatePluginError, PluginNotFoundError } from "../../../../src/kernel/errors.js";
import { FileHash, InstallationFile } from "../../../../src/kernel/file.js";
import type { ToolId } from "../../../../src/kernel/tool.js";

const CLAUDE = "claude" as ToolId;
const CURSOR = "cursor" as ToolId;

const makeFile = (relativePath: string, hashHex: string): InstallationFile =>
  new InstallationFile({ relativePath, content: "content", hash: new FileHash(hashHex) });

const makeManifest = (): Manifest => {
  const manifest = Manifest.create();
  manifest.addTool(CLAUDE, "3.0.0", [makeFile(".claude/CLAUDE.md", "a".repeat(32))]);
  manifest.addTool(CURSOR, "1.0.0", [makeFile(".cursor/rules/naming.md", "b".repeat(32))]);
  return manifest;
};

const makePlugin = (name = "my-plugin") =>
  InstalledPlugin.fromJSON({
    name,
    source: { kind: "github", repo: "owner/my-plugin" },
    version: "1.0.0",
    strict: false,
    files: { [`.claude/plugins/${name}/README.md`]: "c".repeat(32) },
    scope: "project",
  });

describe("plugin serialization round-trip", () => {
  it("serializes and re-parses a manifest with plugins", () => {
    const manifest = makeManifest();
    manifest.addPlugin(CLAUDE, makePlugin("cool-plugin"));
    const serialized = manifest.toJSON();
    const reparsed = Manifest.fromJSON(serialized);
    const plugins = reparsed.getPlugins(CLAUDE);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("cool-plugin");
    expect(plugins[0].version).toBe("1.0.0");
  });

  it("round-trips a manifest with no plugins identically to one without plugin field", () => {
    const manifest = makeManifest();
    const json = manifest.toJSON();
    expect(json.tools.claude.plugins).toBeUndefined();
    expect(json.tools.cursor.plugins).toBeUndefined();
  });
});

describe("addPlugin()", () => {
  it("adds a plugin to the specified tool", () => {
    const manifest = makeManifest();
    manifest.addPlugin(CLAUDE, makePlugin());
    expect(manifest.getPlugins(CLAUDE)).toHaveLength(1);
  });

  it("throws DuplicatePluginError when adding a plugin with the same name", () => {
    const manifest = makeManifest();
    manifest.addPlugin(CLAUDE, makePlugin("dup"));
    expect(() => manifest.addPlugin(CLAUDE, makePlugin("dup"))).toThrow(DuplicatePluginError);
  });

  it("does not affect other tools", () => {
    const manifest = makeManifest();
    manifest.addPlugin(CLAUDE, makePlugin());
    expect(manifest.getPlugins(CURSOR)).toHaveLength(0);
  });
});

describe("removePlugin()", () => {
  it("removes a plugin by name", () => {
    const manifest = makeManifest();
    manifest.addPlugin(CLAUDE, makePlugin("to-remove"));
    manifest.removePlugin(CLAUDE, "to-remove");
    expect(manifest.getPlugins(CLAUDE)).toHaveLength(0);
  });

  it("throws PluginNotFoundError when plugin does not exist", () => {
    const manifest = makeManifest();
    expect(() => manifest.removePlugin(CLAUDE, "ghost")).toThrow(PluginNotFoundError);
  });

  it("does not remove a plugin from the wrong tool", () => {
    const manifest = makeManifest();
    manifest.addPlugin(CLAUDE, makePlugin("shared-name"));
    expect(() => manifest.removePlugin(CURSOR, "shared-name")).toThrow(PluginNotFoundError);
  });
});

describe("isFileTracked() with plugins", () => {
  it("returns true for a file tracked inside a plugin", () => {
    const manifest = makeManifest();
    manifest.addPlugin(CLAUDE, makePlugin("my-plugin"));
    expect(manifest.isFileTracked(".claude/plugins/my-plugin/README.md")).toBe(true);
  });

  it("returns false for an untracked file not in any plugin", () => {
    const manifest = makeManifest();
    expect(manifest.isFileTracked(".claude/plugins/unknown/README.md")).toBe(false);
  });
});

describe("addTool() preserves existing plugins on re-add", () => {
  it("keeps plugins when addTool is called again", () => {
    const manifest = makeManifest();
    manifest.addPlugin(CLAUDE, makePlugin("keep-me"));
    manifest.addTool(CLAUDE, "4.0.0", []);
    expect(manifest.getPlugins(CLAUDE)).toHaveLength(1);
    expect(manifest.getPlugins(CLAUDE)[0].name).toBe("keep-me");
  });
});
