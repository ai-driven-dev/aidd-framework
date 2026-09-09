import { describe, expect, it } from "vitest";
import {
  type ComponentPathMap,
  InstalledPlugin,
  type McpDigestMap,
  type PluginEntryData,
  parsePluginSpec,
} from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { PluginDistribution } from "../../../../../src/contexts/translate/domain/plugin-distribution.js";
import {
  InvalidPluginNameError,
  InvalidPluginVersionError,
  MalformedPluginScopeError,
} from "../../../../../src/kernel/errors.js";

const makeDistribution = (strict?: boolean): PluginDistribution =>
  new PluginDistribution({
    manifest: { name: "my-plugin", version: "1.0.0", ...(strict === undefined ? {} : { strict }) },
    format: "claude",
    files: [],
    components: { skills: [], commands: [], agents: [], rules: [], hooks: [], mcp: [] },
  });

const makePluginData = (overrides: Partial<PluginEntryData> = {}): PluginEntryData => ({
  name: "my-plugin",
  source: { kind: "github", repo: "owner/my-plugin" },
  version: "1.0.0",
  strict: false,
  files: { ".claude/plugins/my-plugin/CLAUDE.md": "abc123" },
  scope: "project",
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

    it("throws MalformedPluginScopeError, naming the plugin, when scope is missing", () => {
      const data = makePluginData();
      // Proving the runtime guard a missing field trips, which a type-level `Omit`
      // cannot construct as invalid data.
      delete (data as { scope?: unknown }).scope;
      expect(() => InstalledPlugin.fromJSON(data)).toThrow(MalformedPluginScopeError);
      expect(() => InstalledPlugin.fromJSON(data)).toThrow(/my-plugin/);
    });

    it("throws MalformedPluginScopeError when scope is neither project nor user", () => {
      // A value the type forbids, written the way a hand-edited file would carry it.
      const data = makePluginData();
      (data as { scope: string }).scope = "global";
      expect(() => InstalledPlugin.fromJSON(data)).toThrow(MalformedPluginScopeError);
    });

    it("accepts scope: user", () => {
      const plugin = InstalledPlugin.fromJSON(makePluginData({ scope: "user" }));
      expect(plugin.scope).toBe("user");
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

    it("round-trips scope, project and user alike", () => {
      expect(InstalledPlugin.fromJSON(makePluginData({ scope: "project" })).toJSON().scope).toBe(
        "project"
      );
      expect(InstalledPlugin.fromJSON(makePluginData({ scope: "user" })).toJSON().scope).toBe(
        "user"
      );
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
      expect(updated.scope).toBe(plugin.scope);
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
      expect(updated.scope).toBe(plugin.scope);
    });
  });

  describe("fromJSON() on a name that starts well and ends badly", () => {
    it("throws InvalidPluginNameError for a name whose tail is not a segment", () => {
      expect(() => InstalledPlugin.fromJSON(makePluginData({ name: "my-plugin_" }))).toThrow(
        InvalidPluginNameError
      );
    });
  });

  describe("toJSON() for a plugin installed from no marketplace", () => {
    it("writes no marketplace key at all", () => {
      const data = makePluginData();

      expect(InstalledPlugin.fromJSON(data).toJSON()).toStrictEqual(data);
    });
  });

  describe("fromDistribution()", () => {
    const source = { kind: "github", repo: "owner/my-plugin" } as const;

    it("is strict only where the distribution's manifest says so", () => {
      expect(
        InstalledPlugin.fromDistribution(makeDistribution(true), source, [], "project").strict
      ).toBe(true);
    });

    it("is lenient where the distribution's manifest says nothing", () => {
      expect(
        InstalledPlugin.fromDistribution(makeDistribution(), source, [], "project").strict
      ).toBe(false);
    });

    it("keeps each installed path's component path", () => {
      const componentPaths = new Map([[".claude/rules/naming.md", "rules/naming.md"]]);

      const plugin = InstalledPlugin.fromDistribution(
        makeDistribution(),
        source,
        [],
        "project",
        componentPaths
      );

      expect([...plugin.componentPaths]).toStrictEqual([
        [".claude/rules/naming.md", "rules/naming.md"],
      ]);
    });

    it("keeps no component path when handed none", () => {
      const plugin = InstalledPlugin.fromDistribution(makeDistribution(), source, [], "project");

      expect([...plugin.componentPaths]).toStrictEqual([]);
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

describe("parsePluginSpec — a plugin argument as typed on the command line", () => {
  it("reads the version after the last @", () => {
    expect(parsePluginSpec("aidd-context@1.2.3")).toStrictEqual({
      name: "aidd-context",
      version: "1.2.3",
    });
  });

  it("reads a bare name as the name alone, requesting no version", () => {
    expect(parsePluginSpec("aidd-context")).toStrictEqual({ name: "aidd-context" });
  });

  it("keeps a leading @ as part of a scoped name", () => {
    expect(parsePluginSpec("@scope/plugin")).toStrictEqual({ name: "@scope/plugin" });
  });

  it("splits a scoped name from its version at the last @", () => {
    expect(parsePluginSpec("@scope/plugin@2.0.0")).toStrictEqual({
      name: "@scope/plugin",
      version: "2.0.0",
    });
  });
});
