import { describe, expect, it } from "vitest";
import { PluginsCapability } from "../../../../src/contexts/tools/domain/plugins-capability.js";

const MARKETPLACE_SETTINGS = {
  settingsPath: ".claude/settings.json",
  settingsKey: "extraKnownMarketplaces",
  toEntry: () => null,
  marketplacesSettingsPath: null,
};

describe("PluginsCapability", () => {
  describe("native mode", () => {
    const cap = new PluginsCapability({
      mode: "native",
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

  describe("flat mode", () => {
    const cap = new PluginsCapability({
      mode: "flat",
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
  });

  describe("unsupported mode", () => {
    const cap = new PluginsCapability({ mode: "unsupported" });

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
          flatNamespacePrefix: "aidd-",
        });
        expect(cap.translationMode).toBe("flat");
      });
    });

    describe("unsupported mode", () => {
      it("exposes translationMode as null", () => {
        const cap = new PluginsCapability({ mode: "unsupported" });
        expect(cap.translationMode).toBeNull();
      });
    });
  });
});
