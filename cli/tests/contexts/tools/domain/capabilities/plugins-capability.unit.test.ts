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
