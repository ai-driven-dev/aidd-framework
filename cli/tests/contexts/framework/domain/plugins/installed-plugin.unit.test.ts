import { describe, expect, it } from "vitest";
import {
  type ComponentPathMap,
  InstalledPlugin,
  type McpDigestMap,
  type PluginEntryData,
} from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import {
  InvalidPluginNameError,
  InvalidPluginVersionError,
} from "../../../../../src/kernel/errors.js";

const makePluginData = (overrides: Partial<PluginEntryData> = {}): PluginEntryData => ({
  name: "my-plugin",
  source: { kind: "github", repo: "owner/my-plugin" },
  version: "1.0.0",
  strict: false,
  files: { ".claude/plugins/my-plugin/CLAUDE.md": "abc123" },
  ...overrides,
});

describe("InstalledPlugin", () => {
  describe("fromJSON()", () => {
    it("creates a plugin from valid data", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData());
      expect(plugin.name).toBe("my-plugin");
      expect(plugin.version).toBe("1.0.0");
      expect(plugin.strict).toBe(false);
    });

    it("throws InvalidPluginNameError when name is invalid", () => {
      expect(() => InstalledPlugin.fromJSON(makePluginData({ name: "My Plugin!" }))).toThrow(
        InvalidPluginNameError
      );
    });

    it("throws InvalidPluginNameError for names with uppercase letters", () => {
      expect(() => InstalledPlugin.fromJSON(makePluginData({ name: "MyPlugin" }))).toThrow(
        InvalidPluginNameError
      );
    });

    it("throws InvalidPluginNameError for names with leading hyphens", () => {
      expect(() => InstalledPlugin.fromJSON(makePluginData({ name: "-plugin" }))).toThrow(
        InvalidPluginNameError
      );
    });

    it("throws InvalidPluginVersionError when version is not semver", () => {
      expect(() => InstalledPlugin.fromJSON(makePluginData({ version: "not-a-version" }))).toThrow(
        InvalidPluginVersionError
      );
    });

    it("accepts single-segment names", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData({ name: "plugin" }));
      expect(plugin.name).toBe("plugin");
    });

    it("accepts multi-segment names", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData({ name: "my-cool-plugin" }));
      expect(plugin.name).toBe("my-cool-plugin");
    });

    it("parses files into a ReadonlyMap", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData());
      expect(plugin.files.get(".claude/plugins/my-plugin/CLAUDE.md")).toBe("abc123");
    });
  });

  describe("toJSON()", () => {
    it("round-trips via fromJSON/toJSON", () => {
      const data = makePluginData();
      const plugin = InstalledPlugin.fromJSON(data);
      expect(plugin.toJSON()).toEqual(data);
    });
  });

  describe("isFileTracked()", () => {
    it("returns true for a tracked file path", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData());
      expect(plugin.isFileTracked(".claude/plugins/my-plugin/CLAUDE.md")).toBe(true);
    });

    it("returns false for an untracked file path", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData());
      expect(plugin.isFileTracked(".claude/agents/alexia.md")).toBe(false);
    });
  });

  describe("withVersion()", () => {
    it("returns a new plugin with the updated version", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData());
      const updated = plugin.withVersion("2.0.0");
      expect(updated.version).toBe("2.0.0");
      expect(plugin.version).toBe("1.0.0");
    });

    it("preserves all other fields", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData());
      const updated = plugin.withVersion("2.0.0");
      expect(updated.name).toBe(plugin.name);
      expect(updated.strict).toBe(plugin.strict);
      expect(updated.files).toBe(plugin.files);
    });
  });

  describe("withFiles()", () => {
    it("returns a new plugin with updated files", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData());
      const newFiles = new Map([["new/path.md", "hash-value"]]);
      const updated = plugin.withFiles(newFiles);
      expect(updated.files.get("new/path.md")).toBe("hash-value");
      expect(plugin.files.has("new/path.md")).toBe(false);
    });

    it("preserves all other fields", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData());
      const updated = plugin.withFiles(new Map());
      expect(updated.name).toBe(plugin.name);
      expect(updated.version).toBe(plugin.version);
    });
  });

  describe("the three maps cannot be swapped", () => {
    it("fails to compile when one map's field is passed where another is expected", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData());

      function acceptsComponentPaths(_m: ComponentPathMap): void {}
      // @ts-expect-error files is a PathHashMap, not a ComponentPathMap — same runtime
      // shape (ReadonlyMap<string, string>), different brand.
      acceptsComponentPaths(plugin.files);

      function acceptsMcpEntries(_m: McpDigestMap): void {}
      // @ts-expect-error componentPaths is a ComponentPathMap, not a McpDigestMap.
      acceptsMcpEntries(plugin.componentPaths);

      // The types are branded, but the underlying maps are still plain ReadonlyMaps at runtime.
      expect(plugin.files).toBeInstanceOf(Map);
    });
  });
});
