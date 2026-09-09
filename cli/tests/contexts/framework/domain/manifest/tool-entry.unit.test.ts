import { describe, expect, it } from "vitest";
import {
  createToolEntry,
  isFileTrackedInEntry,
  parseToolEntry,
  removePluginFromEntry,
  serializeToolEntry,
  type ToolEntry,
  updatePluginInEntry,
} from "../../../../../src/contexts/framework/domain/manifest/tool-entry.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { PluginNotFoundError } from "../../../../../src/kernel/errors.js";
import { FileHash, InstallationFile } from "../../../../../src/kernel/file.js";

const makePlugin = (name: string, version = "1.0.0"): InstalledPlugin =>
  InstalledPlugin.fromJSON({
    name,
    source: { kind: "github", repo: `owner/${name}` },
    version,
    strict: false,
    files: { [`.claude/plugins/${name}/README.md`]: "c".repeat(32) },
    scope: "project",
  });

const makeEntry = (plugins: InstalledPlugin[]): ToolEntry =>
  createToolEntry({
    toolId: "claude",
    version: "3.0.0",
    files: [
      new InstallationFile({
        relativePath: ".claude/CLAUDE.md",
        content: "content",
        hash: new FileHash("a".repeat(32)),
      }),
    ],
    mergeFiles: [{ relativePath: ".mcp.json", sectionKey: "mcpServers", entries: {} }],
    excludedMcp: [],
    existingPlugins: plugins,
  });

describe("a tool's manifest entry", () => {
  describe("removing a plugin", () => {
    it("keeps every other plugin", () => {
      const entry = makeEntry([makePlugin("keep-a"), makePlugin("drop"), makePlugin("keep-b")]);

      const updated = removePluginFromEntry(entry, "drop");

      expect(updated.plugins.map((p) => p.name)).toStrictEqual(["keep-a", "keep-b"]);
    });

    it("refuses a plugin that is not installed even while others are", () => {
      const entry = makeEntry([makePlugin("installed")]);

      expect(() => removePluginFromEntry(entry, "ghost")).toThrow(PluginNotFoundError);
    });
  });

  describe("updating a plugin", () => {
    it("replaces only the plugin of that name", () => {
      const entry = makeEntry([makePlugin("other"), makePlugin("target")]);

      const updated = updatePluginInEntry(entry, makePlugin("target", "2.0.0"));

      expect(updated.plugins.map((p) => [p.name, p.version])).toStrictEqual([
        ["other", "1.0.0"],
        ["target", "2.0.0"],
      ]);
    });

    it("refuses a plugin that is not installed", () => {
      const entry = makeEntry([makePlugin("installed")]);

      expect(() => updatePluginInEntry(entry, makePlugin("ghost"))).toThrow(PluginNotFoundError);
    });
  });

  describe("tracking a file", () => {
    it("does not count a path as tracked because some merge file exists", () => {
      const entry = makeEntry([]);

      expect(isFileTrackedInEntry(entry, ".claude/settings.json")).toBe(false);
    });
  });

  describe("serialized", () => {
    it("carries what the tool's own CLI was asked to register through a round trip", () => {
      const entry: ToolEntry = {
        ...makeEntry([]),
        nativeRegistrations: {
          binary: "claude",
          marketplaces: [{ alias: "aidd-framework", hostName: "ai-driven-dev" }],
          pluginRefs: ["aidd-context@ai-driven-dev"],
        },
      };

      const data = serializeToolEntry(entry);

      expect(data.nativeRegistrations).toStrictEqual({
        binary: "claude",
        marketplaces: [{ alias: "aidd-framework", hostName: "ai-driven-dev" }],
        pluginRefs: ["aidd-context@ai-driven-dev"],
      });
      expect(parseToolEntry("claude", data).nativeRegistrations).toStrictEqual(
        entry.nativeRegistrations
      );
    });
  });
});
