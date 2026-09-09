import { describe, expect, it } from "vitest";
import { PluginsCapability } from "../../../../../src/contexts/tools/domain/capabilities/plugins-capability.js";

const MARKETPLACE_SETTINGS = {
  settingsPath: ".claude/settings.json",
  settingsKey: "extraKnownMarketplaces",
  toEntryKey: () => null,
  marketplacesSettingsPath: null,
};

describe("PluginsCapability", () => {
  describe("native mode", () => {
    const cap = new PluginsCapability({
      mode: "native",
      acceptsHooks: true,
      pluginsDir: ".claude/plugins/",
      pluginManifestRelativePath: ".claude-plugin/plugin.json",
    });

    it("exposes mode as native", () => {
      expect(cap.mode).toBe("native");
    });

    it("exposes pluginsDir", () => {
      expect(cap.pluginsDir).toBe(".claude/plugins/");
    });

    it("exposes pluginManifestRelativePath", () => {
      expect(cap.pluginManifestRelativePath).toBe(".claude-plugin/plugin.json");
    });

    it("flatNamespacePrefix is null", () => {
      expect(cap.flatNamespacePrefix).toBeNull();
    });

    it("pluginOutputDir returns the plugin subdirectory", () => {
      expect(cap.pluginOutputDir("my-plugin")).toBe(".claude/plugins/my-plugin/");
    });
  });

  describe("flat mode, hooks unsupported", () => {
    const cap = new PluginsCapability({
      mode: "flat",
      acceptsHooks: false,
      hooksUnsupportedReason: "a test double that hosts no plugin directory",
      flatNamespacePrefix: "aidd-",
    });

    it("exposes mode as flat", () => {
      expect(cap.mode).toBe("flat");
    });

    it("exposes flatNamespacePrefix", () => {
      expect(cap.flatNamespacePrefix).toBe("aidd-");
    });

    it("pluginsDir is null", () => {
      expect(cap.pluginsDir).toBeNull();
    });

    it("pluginManifestRelativePath is null", () => {
      expect(cap.pluginManifestRelativePath).toBeNull();
    });

    it("pluginOutputDir returns null", () => {
      expect(cap.pluginOutputDir("my-plugin")).toBeNull();
    });

    it("flatHooksDir is null", () => {
      expect(cap.flatHooksDir).toBeNull();
    });

    it("exposes hooksUnsupportedReason", () => {
      expect(cap.hooksUnsupportedReason).toBe("a test double that hosts no plugin directory");
    });
  });

  describe("flat mode, hooks accepted", () => {
    const cap = new PluginsCapability({
      mode: "flat",
      acceptsHooks: true,
      flatHooksDir: ".test-tool/plugin/",
      flatNamespacePrefix: "aidd-",
    });

    it("acceptsHooks is true", () => {
      expect(cap.acceptsHooks).toBe(true);
    });

    it("exposes flatHooksDir", () => {
      expect(cap.flatHooksDir).toBe(".test-tool/plugin/");
    });

    it("hooksUnsupportedReason is null", () => {
      expect(cap.hooksUnsupportedReason).toBeNull();
    });

    it("flatHooksLoaderEntry is null when not declared", () => {
      expect(cap.flatHooksLoaderEntry).toBeNull();
    });
  });

  describe("flat mode, hooks accepted, with a loader entry", () => {
    const cap = new PluginsCapability({
      mode: "flat",
      acceptsHooks: true,
      flatHooksDir: ".test-tool/hooks/",
      flatHooksLoaderEntry: { dir: ".test-tool/plugin/", baseName: "test-tool-plugin.js" },
      flatNamespacePrefix: "aidd-",
    });

    it("exposes flatHooksLoaderEntry", () => {
      expect(cap.flatHooksLoaderEntry).toEqual({
        dir: ".test-tool/plugin/",
        baseName: "test-tool-plugin.js",
      });
    });
  });

  describe("unsupported mode", () => {
    const cap = new PluginsCapability({
      mode: "unsupported",
      hooksUnsupportedReason: "a test double that hosts no plugin directory",
    });

    it("exposes mode as unsupported", () => {
      expect(cap.mode).toBe("unsupported");
    });

    it("pluginsDir is null", () => {
      expect(cap.pluginsDir).toBeNull();
    });

    it("pluginManifestRelativePath is null", () => {
      expect(cap.pluginManifestRelativePath).toBeNull();
    });

    it("flatNamespacePrefix is null", () => {
      expect(cap.flatNamespacePrefix).toBeNull();
    });

    it("pluginOutputDir returns null", () => {
      expect(cap.pluginOutputDir("any-plugin")).toBeNull();
    });
  });

  describe("user scope (native mode)", () => {
    const cap = new PluginsCapability({
      mode: "native",
      acceptsHooks: true,
      pluginsDir: "",
      pluginManifestRelativePath: null,
      installScope: "user",
      userPluginsDir: (h) => `${h}/.cursor/plugins/local`,
    });

    it("exposes installScope as user", () => {
      expect(cap.installScope).toBe("user");
    });

    it("resolvePluginsBaseDir returns homedir-based path", () => {
      expect(cap.resolvePluginsBaseDir("/proj", "/home/user")).toBe(
        "/home/user/.cursor/plugins/local"
      );
    });
  });

  describe("project scope (default)", () => {
    const cap = new PluginsCapability({
      mode: "native",
      acceptsHooks: true,
      pluginsDir: ".claude/plugins/",
      pluginManifestRelativePath: "plugin.json",
    });

    it("exposes installScope as project", () => {
      expect(cap.installScope).toBe("project");
    });

    it("resolvePluginsBaseDir returns projectRoot", () => {
      expect(cap.resolvePluginsBaseDir("/my-project", "/home/user")).toBe("/my-project");
    });
  });

  describe("user scope without userPluginsDir resolver", () => {
    it("throws CapabilityConfigError", () => {
      expect(
        () =>
          new PluginsCapability({
            mode: "native",
            acceptsHooks: true,
            pluginsDir: "",
            pluginManifestRelativePath: null,
            installScope: "user",
          })
      ).toThrow("installScope 'user' requires a userPluginsDir resolver function.");
    });
  });

  describe("translationMode", () => {
    describe("native with marketplaceSettings and translationMode marketplace", () => {
      it("exposes translationMode as marketplace", () => {
        const cap = new PluginsCapability({
          mode: "native",
          acceptsHooks: true,
          pluginsDir: ".claude/plugins/",
          pluginManifestRelativePath: "plugin.json",
          translationMode: "marketplace",
          marketplaceSettings: MARKETPLACE_SETTINGS,
        });
        expect(cap.translationMode).toBe("marketplace");
      });
    });

    describe("native without translationMode", () => {
      it("exposes translationMode as null (neutral native)", () => {
        const cap = new PluginsCapability({
          mode: "native",
          acceptsHooks: true,
          pluginsDir: ".claude/plugins/",
          pluginManifestRelativePath: "plugin.json",
        });
        expect(cap.translationMode).toBeNull();
      });
    });

    describe("flat mode", () => {
      it("exposes translationMode as flat automatically", () => {
        const cap = new PluginsCapability({
          mode: "flat",
          acceptsHooks: false,
          hooksUnsupportedReason: "a test double that hosts no plugin directory",
          flatNamespacePrefix: "aidd-",
        });
        expect(cap.translationMode).toBe("flat");
      });
    });

    describe("unsupported mode", () => {
      it("exposes translationMode as null", () => {
        const cap = new PluginsCapability({
          mode: "unsupported",
          hooksUnsupportedReason: "a test double that hosts no plugin directory",
        });
        expect(cap.translationMode).toBeNull();
      });
    });
  });
});

describe("PluginsCapability base directory resolution", () => {
  const native = {
    mode: "native" as const,
    acceptsHooks: true as const,
    pluginsDir: ".x/plugins/",
    pluginManifestRelativePath: null,
  };

  it("stays in the project when the scope is project, even with a user directory declared", () => {
    const cap = new PluginsCapability({
      ...native,
      userPluginsDir: (home) => `${home}/.x/plugins`,
    });

    expect(cap.resolvePluginsBaseDir("/repo", "/home/me")).toBe("/repo");
    expect(cap.userPluginsBaseDir("/home/me")).toBe("/home/me/.x/plugins");
  });

  it("stays in the project for a capability declaring no user directory at all", () => {
    const cap = new PluginsCapability(native);

    expect(cap.resolvePluginsBaseDir("/repo", "/home/me")).toBe("/repo");
    expect(cap.userPluginsBaseDir("/home/me")).toBeNull();
  });

  it("names a plugin's own directory under the plugins directory in native mode only", () => {
    expect(new PluginsCapability(native).pluginOutputDir("p")).toBe(".x/plugins/p/");
    expect(
      new PluginsCapability({
        mode: "flat",
        acceptsHooks: true,
        flatHooksDir: ".x/hooks/",
        flatNamespacePrefix: "aidd-",
      }).pluginOutputDir("p")
    ).toBeNull();
  });

  it("refuses a project hooks destination that names no project hooks file", () => {
    expect(() => new PluginsCapability({ ...native, hooksDestination: "project" })).toThrow(
      "hooksDestination 'project' requires a projectHooksRelativePath."
    );
  });
});

describe("PluginsCapability defaults each mode falls back to", () => {
  it("delivers no mcp, lands hooks in the plugin, and reads matcher-shaped hooks unless a native tool says otherwise", () => {
    const cap = new PluginsCapability({
      mode: "native",
      acceptsHooks: true,
      pluginsDir: ".x/plugins/",
      pluginManifestRelativePath: null,
    });

    expect([cap.acceptsMcp, cap.hooksDestination, cap.hooksContentFormat]).toStrictEqual([
      false,
      "plugin",
      "matchers",
    ]);
  });

  it("fixes the same three answers for a flat tool", () => {
    const cap = new PluginsCapability({
      mode: "flat",
      acceptsHooks: true,
      flatHooksDir: ".x/hooks/",
      flatNamespacePrefix: "aidd-",
    });

    expect([cap.acceptsMcp, cap.hooksDestination, cap.hooksContentFormat]).toStrictEqual([
      false,
      "plugin",
      "matchers",
    ]);
  });

  it("accepts neither hooks nor mcp for a tool hosting no plugin at all", () => {
    const cap = new PluginsCapability({ mode: "unsupported", hooksUnsupportedReason: "none" });

    expect([
      cap.acceptsHooks,
      cap.acceptsMcp,
      cap.hooksDestination,
      cap.hooksContentFormat,
    ]).toStrictEqual([false, false, "plugin", "matchers"]);
  });
});
