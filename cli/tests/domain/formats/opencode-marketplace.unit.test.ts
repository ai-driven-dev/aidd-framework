import { describe, expect, it } from "vitest";
import { ForeignSchemaValidationError } from "../../../src/domain/errors.js";
import {
  parseKiloMarketplace,
  parseOpencodeMarketplace,
} from "../../../src/domain/formats/opencode-marketplace.js";

const VALID_JSON = JSON.stringify({
  $schema: "https://opencode.ai/config.json",
  provider: {},
  plugin: ["opencode-dev-tools", "@my-org/opencode-testing", ["opencode-minimal", { debug: true }]],
});

describe("parseKiloMarketplace", () => {
  it("parses Kilo's OpenCode-compatible plugin array with Kilo provenance", () => {
    const catalog = parseKiloMarketplace(JSON.stringify({ plugin: ["@example/kilo-plugin"] }));
    expect(catalog).toEqual({
      source: "kilo",
      plugins: [{ name: "@example/kilo-plugin", source: "kilo" }],
    });
  });

  it("reports kilo.json for malformed Kilo configuration", () => {
    expect(() => parseKiloMarketplace("not json")).toThrow(/kilo\.json is not valid JSON/);
  });
});

describe("parseOpencodeMarketplace", () => {
  describe("happy path", () => {
    it("returns a NormalizedCatalog with source opencode", () => {
      const catalog = parseOpencodeMarketplace(VALID_JSON);
      expect(catalog.source).toBe("opencode");
    });

    it("parses bare string specifier as plugin name", () => {
      const catalog = parseOpencodeMarketplace(VALID_JSON);
      expect(catalog.plugins[0].name).toBe("opencode-dev-tools");
    });

    it("parses scoped npm package specifier as plugin name", () => {
      const catalog = parseOpencodeMarketplace(VALID_JSON);
      expect(catalog.plugins[1].name).toBe("@my-org/opencode-testing");
    });

    it("parses [specifier, options] tuple taking first element as name", () => {
      const catalog = parseOpencodeMarketplace(VALID_JSON);
      expect(catalog.plugins[2].name).toBe("opencode-minimal");
    });

    it("returns three plugins from sample fixture array", () => {
      const catalog = parseOpencodeMarketplace(VALID_JSON);
      expect(catalog.plugins).toHaveLength(3);
    });

    it("sets source to opencode on each plugin entry", () => {
      const catalog = parseOpencodeMarketplace(VALID_JSON);
      for (const plugin of catalog.plugins) {
        expect(plugin.source).toBe("opencode");
      }
    });

    it("omits version (not available in opencode.json plugin array)", () => {
      const catalog = parseOpencodeMarketplace(VALID_JSON);
      expect(catalog.plugins[0].version).toBeUndefined();
    });

    it("omits description (not available in opencode.json plugin array)", () => {
      const catalog = parseOpencodeMarketplace(VALID_JSON);
      expect(catalog.plugins[0].description).toBeUndefined();
    });

    it("returns empty array when plugin field is an empty array", () => {
      const raw = JSON.stringify({ plugin: [] });
      const catalog = parseOpencodeMarketplace(raw);
      expect(catalog.plugins).toHaveLength(0);
    });

    it("returns empty array when plugin field is absent", () => {
      const raw = JSON.stringify({ provider: {} });
      const catalog = parseOpencodeMarketplace(raw);
      expect(catalog.plugins).toHaveLength(0);
    });

    it("ignores other config fields like provider, mcp, tools", () => {
      expect(() => parseOpencodeMarketplace(VALID_JSON)).not.toThrow();
      expect(parseOpencodeMarketplace(VALID_JSON).plugins).toHaveLength(3);
    });
  });

  describe("malformed JSON", () => {
    it("throws ForeignSchemaValidationError for invalid JSON string", () => {
      expect(() => parseOpencodeMarketplace("{ not valid json")).toThrow(
        ForeignSchemaValidationError
      );
    });

    it("error message includes source opencode", () => {
      try {
        parseOpencodeMarketplace("bad");
      } catch (err) {
        expect(err instanceof ForeignSchemaValidationError).toBe(true);
        expect((err as Error).message).toContain("opencode");
      }
    });
  });

  describe("invalid root shape", () => {
    it("throws when root is an array not object", () => {
      expect(() => parseOpencodeMarketplace(JSON.stringify([]))).toThrow(
        ForeignSchemaValidationError
      );
    });

    it("throws when root is null", () => {
      expect(() => parseOpencodeMarketplace("null")).toThrow(ForeignSchemaValidationError);
    });

    it("throws when root is a string", () => {
      expect(() => parseOpencodeMarketplace(JSON.stringify("hello"))).toThrow(
        ForeignSchemaValidationError
      );
    });

    it("throws when plugin field is not an array", () => {
      expect(() => parseOpencodeMarketplace(JSON.stringify({ plugin: "not-array" }))).toThrow(
        ForeignSchemaValidationError
      );
    });
  });

  describe("invalid plugin entry", () => {
    it("throws when a plugin entry is a plain object (not string or tuple)", () => {
      expect(() => parseOpencodeMarketplace(JSON.stringify({ plugin: [{ name: "bad" }] }))).toThrow(
        ForeignSchemaValidationError
      );
    });

    it("throws when plugin entry is an empty tuple", () => {
      expect(() => parseOpencodeMarketplace(JSON.stringify({ plugin: [[]] }))).toThrow(
        ForeignSchemaValidationError
      );
    });

    it("throws when tuple first element is empty string", () => {
      expect(() => parseOpencodeMarketplace(JSON.stringify({ plugin: [["", {}]] }))).toThrow(
        ForeignSchemaValidationError
      );
    });

    it("throws when plugin entry is a number", () => {
      expect(() => parseOpencodeMarketplace(JSON.stringify({ plugin: [42] }))).toThrow(
        ForeignSchemaValidationError
      );
    });

    it("error message includes index of bad entry", () => {
      try {
        parseOpencodeMarketplace(JSON.stringify({ plugin: ["ok", 99] }));
      } catch (err) {
        expect((err as Error).message).toContain("plugin[1]");
      }
    });
  });
});
