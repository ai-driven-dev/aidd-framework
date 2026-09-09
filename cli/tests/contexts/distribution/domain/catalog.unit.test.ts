import { describe, expect, it } from "vitest";
import {
  hasRelativePluginSources,
  parsePluginCatalog,
} from "../../../../src/contexts/distribution/domain/catalog.js";
import {
  InvalidPluginManifestError,
  InvalidPluginSourceError,
} from "../../../../src/kernel/errors.js";

const VALID_RAW = {
  plugins: [
    {
      name: "dev",
      source: { kind: "local", path: "./plugins/dev" },
      description: "Dev plugin",
      metadata: { recommended: true },
      strict: true,
    },
    {
      name: "pm",
      source: { kind: "github", repo: "ai-driven-dev/aidd-pm" },
      description: "PM plugin",
      metadata: { recommended: false },
      strict: false,
    },
  ],
};

describe("hasRelativePluginSources", () => {
  it("returns true for catalog with a local relative path entry", () => {
    const catalog = parsePluginCatalog({
      plugins: [{ name: "x", source: { kind: "local", path: "./plugins/x" } }],
    });
    expect(hasRelativePluginSources(catalog)).toBe(true);
  });

  it("returns true for mixed entries when at least one is relative local", () => {
    const catalog = parsePluginCatalog({
      plugins: [
        { name: "rel", source: { kind: "local", path: "./plugins/rel" } },
        { name: "abs", source: { kind: "github", repo: "owner/repo" } },
      ],
    });
    expect(hasRelativePluginSources(catalog)).toBe(true);
  });

  it("returns false for catalog with only github entries", () => {
    const catalog = parsePluginCatalog({
      plugins: [{ name: "g", source: { kind: "github", repo: "owner/repo" } }],
    });
    expect(hasRelativePluginSources(catalog)).toBe(false);
  });

  it("returns false for catalog with local absolute paths only", () => {
    const catalog = parsePluginCatalog({
      plugins: [{ name: "abs", source: { kind: "local", path: "/absolute/path" } }],
    });
    expect(hasRelativePluginSources(catalog)).toBe(false);
  });

  it("returns false for empty plugins array", () => {
    const catalog = parsePluginCatalog({ plugins: [] });
    expect(hasRelativePluginSources(catalog)).toBe(false);
  });
});

describe("parsePluginCatalog", () => {
  describe("valid input", () => {
    it("parses two entries from valid fixture", () => {
      const catalog = parsePluginCatalog(VALID_RAW);
      expect(catalog.plugins).toHaveLength(2);
    });

    it("parses name and source for each entry", () => {
      const catalog = parsePluginCatalog(VALID_RAW);
      expect(catalog.plugins[0].name).toBe("dev");
      expect(catalog.plugins[0].source).toEqual({ kind: "local", path: "./plugins/dev" });
      expect(catalog.plugins[1].name).toBe("pm");
      expect(catalog.plugins[1].source).toEqual({ kind: "github", repo: "ai-driven-dev/aidd-pm" });
    });

    it("preserves recommended and strict values", () => {
      const catalog = parsePluginCatalog(VALID_RAW);
      expect(catalog.plugins[0].recommended).toBe(true);
      expect(catalog.plugins[0].strict).toBe(true);
      expect(catalog.plugins[1].recommended).toBe(false);
      expect(catalog.plugins[1].strict).toBe(false);
    });

    it("defaults recommended to false when absent", () => {
      const raw = { plugins: [{ name: "x", source: { kind: "local", path: "./x" } }] };
      const catalog = parsePluginCatalog(raw);
      expect(catalog.plugins[0].recommended).toBe(false);
    });

    it("reads recommended under the entry's metadata alone, the one place Claude Code does not warn on", () => {
      const raw = {
        plugins: [{ name: "x", source: { kind: "local", path: "./x" }, recommended: true }],
      };
      const catalog = parsePluginCatalog(raw);
      expect(catalog.plugins[0].recommended).toBe(false);
    });

    it("defaults strict to false when absent", () => {
      const raw = { plugins: [{ name: "x", source: { kind: "local", path: "./x" } }] };
      const catalog = parsePluginCatalog(raw);
      expect(catalog.plugins[0].strict).toBe(false);
    });

    it("includes optional description when present", () => {
      const catalog = parsePluginCatalog(VALID_RAW);
      expect(catalog.plugins[0].description).toBe("Dev plugin");
    });

    it("omits description when absent", () => {
      const raw = { plugins: [{ name: "x", source: { kind: "local", path: "./x" } }] };
      const catalog = parsePluginCatalog(raw);
      expect(catalog.plugins[0].description).toBeUndefined();
    });
  });

  describe("missing source field", () => {
    it("throws InvalidPluginManifestError", () => {
      const raw = { plugins: [{ name: "x" }] };
      expect(() => parsePluginCatalog(raw)).toThrow(InvalidPluginManifestError);
    });
  });

  describe("malformed source", () => {
    it("throws InvalidPluginSourceError for unknown kind", () => {
      const raw = { plugins: [{ name: "x", source: { kind: "svn" } }] };
      expect(() => parsePluginCatalog(raw)).toThrow(InvalidPluginSourceError);
    });
  });

  describe("invalid top-level structure", () => {
    it("throws when plugins is not an array", () => {
      expect(() => parsePluginCatalog({ plugins: "not-array" })).toThrow(
        InvalidPluginManifestError
      );
    });

    it("throws when input is null", () => {
      expect(() => parsePluginCatalog(null)).toThrow(InvalidPluginManifestError);
    });

    it("throws when input is an array", () => {
      expect(() => parsePluginCatalog([])).toThrow(InvalidPluginManifestError);
    });

    it("throws when name is missing", () => {
      const raw = { plugins: [{ source: { kind: "local", path: "./x" } }] };
      expect(() => parsePluginCatalog(raw)).toThrow(InvalidPluginManifestError);
    });

    it("throws when name is empty string", () => {
      const raw = { plugins: [{ name: "", source: { kind: "local", path: "./x" } }] };
      expect(() => parsePluginCatalog(raw)).toThrow(InvalidPluginManifestError);
    });
  });
});
