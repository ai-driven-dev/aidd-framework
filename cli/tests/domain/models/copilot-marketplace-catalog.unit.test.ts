import { describe, expect, it } from "vitest";
import { InvalidPluginManifestError } from "../../../src/domain/errors.js";
import { parseCopilotMarketplaceCatalog } from "../../../src/domain/models/copilot-marketplace-catalog.js";

const SAMPLE_CATALOG = JSON.stringify({
  name: "aidd-framework",
  metadata: {
    description: "Test framework",
    version: "1.0.0",
    pluginRoot: "./plugins",
  },
  owner: { name: "Test Org" },
  plugins: [
    { name: "aidd-dev", source: "aidd-dev", description: "Dev tools", version: "2.0.0" },
    { name: "aidd-pm", source: "aidd-pm", description: "PM tools", version: "1.5.0" },
  ],
});

describe("parseCopilotMarketplaceCatalog", () => {
  describe("valid multi-plugin catalog", () => {
    it("returns a catalog with the correct number of plugins", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.plugins).toHaveLength(2);
    });

    it("carries the catalog name from the top-level name field", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.name).toBe("aidd-framework");
    });

    it("does not carry version (Copilot catalog has no top-level version field)", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.version).toBeUndefined();
    });

    it("maps bare source string to a local path under pluginRoot", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.plugins[0].source).toEqual({
        kind: "local",
        path: "./plugins/aidd-dev",
      });
    });

    it("maps second plugin source to local path under pluginRoot", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.plugins[1].source).toEqual({
        kind: "local",
        path: "./plugins/aidd-pm",
      });
    });

    it("preserves plugin name", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.plugins[0].name).toBe("aidd-dev");
    });

    it("preserves plugin description", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.plugins[0].description).toBe("Dev tools");
    });

    it("preserves plugin version", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.plugins[0].version).toBe("2.0.0");
    });

    it("defaults recommended to false", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.plugins[0].recommended).toBe(false);
    });

    it("defaults strict to false", () => {
      const catalog = parseCopilotMarketplaceCatalog(SAMPLE_CATALOG);
      expect(catalog.plugins[0].strict).toBe(false);
    });
  });

  describe("pluginRoot variations", () => {
    it("handles pluginRoot without trailing slash", () => {
      const raw = JSON.stringify({
        metadata: { pluginRoot: "./plugins" },
        plugins: [{ name: "foo", source: "foo", description: "d", version: "1.0.0" }],
      });
      const catalog = parseCopilotMarketplaceCatalog(raw);
      expect(catalog.plugins[0].source).toEqual({ kind: "local", path: "./plugins/foo" });
    });

    it("handles custom pluginRoot value", () => {
      const raw = JSON.stringify({
        metadata: { pluginRoot: "./custom-dir" },
        plugins: [{ name: "bar", source: "bar", description: "d", version: "1.0.0" }],
      });
      const catalog = parseCopilotMarketplaceCatalog(raw);
      expect(catalog.plugins[0].source).toEqual({ kind: "local", path: "./custom-dir/bar" });
    });
  });

  describe("invalid JSON", () => {
    it("throws InvalidPluginManifestError for malformed JSON", () => {
      expect(() => parseCopilotMarketplaceCatalog("NOT JSON {")).toThrow(
        InvalidPluginManifestError
      );
    });
  });

  describe("schema violations", () => {
    it("throws when metadata is missing", () => {
      const raw = JSON.stringify({ plugins: [] });
      expect(() => parseCopilotMarketplaceCatalog(raw)).toThrow(InvalidPluginManifestError);
    });

    it("throws when metadata.pluginRoot is missing", () => {
      const raw = JSON.stringify({ metadata: {}, plugins: [] });
      expect(() => parseCopilotMarketplaceCatalog(raw)).toThrow(InvalidPluginManifestError);
    });

    it("throws when plugins is not an array", () => {
      const raw = JSON.stringify({ metadata: { pluginRoot: "./plugins" }, plugins: "bad" });
      expect(() => parseCopilotMarketplaceCatalog(raw)).toThrow(InvalidPluginManifestError);
    });

    it("throws when a plugin entry name is missing", () => {
      const raw = JSON.stringify({
        metadata: { pluginRoot: "./plugins" },
        plugins: [{ source: "foo" }],
      });
      expect(() => parseCopilotMarketplaceCatalog(raw)).toThrow(InvalidPluginManifestError);
    });

    it("throws when a plugin entry source is missing", () => {
      const raw = JSON.stringify({
        metadata: { pluginRoot: "./plugins" },
        plugins: [{ name: "foo" }],
      });
      expect(() => parseCopilotMarketplaceCatalog(raw)).toThrow(InvalidPluginManifestError);
    });

    it("throws when root is not an object", () => {
      expect(() => parseCopilotMarketplaceCatalog("[]")).toThrow(InvalidPluginManifestError);
    });
  });
});
