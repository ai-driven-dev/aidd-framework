import { describe, expect, it } from "vitest";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  MARKETPLACE_NAME_REGEX,
  Marketplace,
  type MarketplaceData,
} from "../../../src/domain/models/marketplace.js";
import {
  InvalidMarketplaceNameError,
  InvalidMarketplaceScopeError,
  InvalidPluginSourceError,
} from "../../../src/kernel/errors.js";

const makeData = (overrides: Partial<MarketplaceData> = {}): MarketplaceData => ({
  name: "awesome-plugins",
  source: { kind: "github", repo: "owner/awesome-plugins" },
  scope: "project",
  addedAt: "2026-04-28T10:00:00.000Z",
  ...overrides,
});

describe("Marketplace", () => {
  describe("MARKETPLACE_NAME_REGEX", () => {
    it("matches slug names", () => {
      expect(MARKETPLACE_NAME_REGEX.test("framework")).toBe(true);
      expect(MARKETPLACE_NAME_REGEX.test("my-marketplace")).toBe(true);
      expect(MARKETPLACE_NAME_REGEX.test("a1-b2")).toBe(true);
    });

    it("rejects invalid forms", () => {
      expect(MARKETPLACE_NAME_REGEX.test("Foo")).toBe(false);
      expect(MARKETPLACE_NAME_REGEX.test("-foo")).toBe(false);
      expect(MARKETPLACE_NAME_REGEX.test("foo_bar")).toBe(false);
      expect(MARKETPLACE_NAME_REGEX.test("foo bar")).toBe(false);
      expect(MARKETPLACE_NAME_REGEX.test("")).toBe(false);
    });
  });

  describe("fromJSON()", () => {
    it("creates a marketplace from valid data", () => {
      const m = Marketplace.fromJSON(makeData());
      expect(m.name).toBe("awesome-plugins");
      expect(m.scope).toBe("project");
      expect(m.source.kind).toBe("github");
      expect(m.lastFetched).toBeUndefined();
    });

    it("preserves lastFetched", () => {
      const m = Marketplace.fromJSON(makeData({ lastFetched: "2026-04-28T11:00:00.000Z" }));
      expect(m.lastFetched).toBe("2026-04-28T11:00:00.000Z");
    });

    it("accepts user scope", () => {
      const m = Marketplace.fromJSON(makeData({ scope: "user" }));
      expect(m.scope).toBe("user");
    });

    it("throws InvalidMarketplaceNameError for uppercase names", () => {
      expect(() => Marketplace.fromJSON(makeData({ name: "MyMarket" }))).toThrow(
        InvalidMarketplaceNameError
      );
    });

    it("throws InvalidMarketplaceNameError for leading hyphens", () => {
      expect(() => Marketplace.fromJSON(makeData({ name: "-foo" }))).toThrow(
        InvalidMarketplaceNameError
      );
    });

    it("throws InvalidMarketplaceNameError for empty names", () => {
      expect(() => Marketplace.fromJSON(makeData({ name: "" }))).toThrow(
        InvalidMarketplaceNameError
      );
    });

    it("throws InvalidMarketplaceScopeError for invalid scope", () => {
      expect(() =>
        Marketplace.fromJSON(makeData({ scope: "global" as unknown as "project" }))
      ).toThrow(InvalidMarketplaceScopeError);
    });

    it("throws when source is invalid", () => {
      expect(() => Marketplace.fromJSON(makeData({ source: { kind: "unknown" } }))).toThrow(
        InvalidPluginSourceError
      );
    });
  });

  describe("toJSON()", () => {
    it("round-trips via fromJSON/toJSON", () => {
      const data = makeData({ lastFetched: "2026-04-28T11:00:00.000Z" });
      const m = Marketplace.fromJSON(data);
      expect(m.toJSON()).toEqual(data);
    });

    it("omits lastFetched when undefined", () => {
      const data = makeData();
      const m = Marketplace.fromJSON(data);
      expect(m.toJSON()).not.toHaveProperty("lastFetched");
    });
  });

  describe("withLastFetched()", () => {
    it("returns a new marketplace with updated timestamp", () => {
      const m = Marketplace.fromJSON(makeData());
      const updated = m.withLastFetched("2026-04-28T12:00:00.000Z");
      expect(updated.lastFetched).toBe("2026-04-28T12:00:00.000Z");
      expect(m.lastFetched).toBeUndefined();
    });

    it("preserves all other fields", () => {
      const m = Marketplace.fromJSON(makeData());
      const updated = m.withLastFetched("2026-04-28T12:00:00.000Z");
      expect(updated.name).toBe(m.name);
      expect(updated.scope).toBe(m.scope);
      expect(updated.addedAt).toBe(m.addedAt);
    });
  });

  describe("isFramework()", () => {
    it("returns true when name matches the framework marketplace name", () => {
      const m = Marketplace.fromJSON(makeData({ name: FRAMEWORK_MARKETPLACE_NAME }));
      expect(m.isFramework()).toBe(true);
    });

    it("returns false otherwise", () => {
      const m = Marketplace.fromJSON(makeData());
      expect(m.isFramework()).toBe(false);
    });
  });
});
