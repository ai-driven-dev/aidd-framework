import { describe, expect, it } from "vitest";
import { BuiltTreeMaterializationTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/built-tree-materialization-translator.js";
import { ModeAMarketplaceTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-a-marketplace-translator.js";
import { resolveTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/plugin-translator-factory.js";
import { PluginsCapability } from "../../../../../../src/contexts/tools/domain/plugins-capability.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../../../../helpers/ports/in-memory-marketplace-registry.js";

function buildDeps(homedir = "/stub-home") {
  const fs = new InMemoryFileAdapter();
  const hasher = new DeterministicHasher();
  return {
    fs,
    hasher,
    homedir: () => homedir,
    ensureBuilt: fakeEnsureBuiltMarketplace(),
    marketplaceRegistry: new InMemoryMarketplaceRegistry(),
  };
}

const MARKETPLACE_SETTINGS = {
  settingsPath: ".claude/settings.json",
  settingsKey: "extraKnownMarketplaces",
  toEntry: () => null,
};

describe("resolveTranslator", () => {
  describe("when translationMode is marketplace", () => {
    it("returns ModeAMarketplaceTranslator", () => {
      const deps = buildDeps();
      const plugins = new PluginsCapability({
        mode: "native",
        pluginsDir: ".claude/plugins/",
        pluginManifestRelativePath: "plugin.json",
        translationMode: "marketplace",
        marketplaceSettings: MARKETPLACE_SETTINGS,
      });
      const adapter = resolveTranslator(plugins, deps);
      expect(adapter).toBeInstanceOf(ModeAMarketplaceTranslator);
      expect(adapter?.mode).toBe("marketplace");
    });
  });

  describe("when installScope is user", () => {
    it("returns BuiltTreeMaterializationTranslator", () => {
      const deps = buildDeps();
      const plugins = new PluginsCapability({
        mode: "native",
        pluginsDir: "",
        pluginManifestRelativePath: null,
        installScope: "user",
        userPluginsDir: (h) => `${h}/.cursor/plugins/local`,
      });
      const adapter = resolveTranslator(plugins, deps);
      expect(adapter).toBeInstanceOf(BuiltTreeMaterializationTranslator);
      expect(adapter?.mode).toBe("flat");
    });
  });

  describe("when translationMode is flat", () => {
    it("returns BuiltTreeMaterializationTranslator", () => {
      const deps = buildDeps();
      const plugins = new PluginsCapability({
        mode: "flat",
        flatNamespacePrefix: "aidd-",
      });
      const adapter = resolveTranslator(plugins, deps);
      expect(adapter).toBeInstanceOf(BuiltTreeMaterializationTranslator);
      expect(adapter?.mode).toBe("flat");
    });
  });

  describe("when translationMode is null (unsupported)", () => {
    it("returns null", () => {
      const deps = buildDeps();
      const plugins = new PluginsCapability({ mode: "unsupported" });
      const adapter = resolveTranslator(plugins, deps);
      expect(adapter).toBeNull();
    });
  });

  describe("when translationMode is null (native without marketplace)", () => {
    it("returns null (neutral native, no translation strategy applies)", () => {
      const deps = buildDeps();
      const plugins = new PluginsCapability({
        mode: "native",
        pluginsDir: ".custom/plugins/",
        pluginManifestRelativePath: "plugin.json",
      });
      const adapter = resolveTranslator(plugins, deps);
      expect(adapter).toBeNull();
    });
  });
});
