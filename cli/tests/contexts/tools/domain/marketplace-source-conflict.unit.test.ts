import { describe, expect, it } from "vitest";
import {
  describePluginDiff,
  marketplaceSourceConflict,
  pluginSetDifference,
} from "../../../../src/contexts/tools/domain/marketplace-source-conflict.js";

const LOCATION = "/home/.claude/plugins/known_marketplaces.json";

const IDENTITY_A = { name: "probe-mkt", pluginNames: ["sample-plugin"] };
const IDENTITY_A_SAME = { name: "probe-mkt", pluginNames: ["sample-plugin"] };
const IDENTITY_B = { name: "probe-mkt", pluginNames: ["other-plugin"] };

describe("marketplaceSourceConflict", () => {
  it("is not a conflict when the registry could not be read", () => {
    const reading = { location: LOCATION, unreadable: "ENOENT" };

    expect(
      marketplaceSourceConflict(reading, "probe-mkt", "/src/B", undefined, IDENTITY_A)
    ).toBeUndefined();
  });

  it("is not a conflict when the name is absent from an otherwise readable registry", () => {
    const reading = { location: LOCATION, entries: new Map<string, string>() };

    expect(
      marketplaceSourceConflict(reading, "probe-mkt", "/src/B", undefined, IDENTITY_A)
    ).toBeUndefined();
  });

  it("is not a conflict when the same catalog is registered from a different, resolved path — two projects sharing one build", () => {
    const reading = { location: LOCATION, entries: new Map([["probe-mkt", "/src/A"]]) };

    expect(
      marketplaceSourceConflict(reading, "probe-mkt", "/src/B", IDENTITY_A, IDENTITY_A_SAME)
    ).toBeUndefined();
  });

  it("is not a conflict when the registered source no longer resolves to a readable catalog — a dead entry a re-add repairs", () => {
    const reading = { location: LOCATION, entries: new Map([["probe-mkt", "/gone"]]) };

    expect(
      marketplaceSourceConflict(reading, "probe-mkt", "/src/B", undefined, IDENTITY_A)
    ).toBeUndefined();
  });

  it("is a conflict when a different catalog is registered under the same name, and carries both identities", () => {
    const reading = { location: LOCATION, entries: new Map([["probe-mkt", "/src/A"]]) };

    const conflict = marketplaceSourceConflict(
      reading,
      "probe-mkt",
      "/src/B",
      IDENTITY_A,
      IDENTITY_B
    );

    expect(conflict).toEqual({
      name: "probe-mkt",
      registeredSource: "/src/A",
      requestedSource: "/src/B",
      registeredIdentity: IDENTITY_A,
      requestedIdentity: IDENTITY_B,
      location: LOCATION,
    });
  });

  // Identity is a catalog's declared name plus its plugin set, never its version, and each
  // case below isolates one component so a mutation collapsing it fails here specifically.
  describe("identity: declared name plus plugin set, never version", () => {
    const reading = { location: LOCATION, entries: new Map([["probe-mkt", "/src/A"]]) };

    it("is a conflict when only the plugin set differs", () => {
      const a = { name: "probe-mkt", pluginNames: ["sample-plugin"] };
      const b = { name: "probe-mkt", pluginNames: ["other-plugin"] };

      expect(marketplaceSourceConflict(reading, "probe-mkt", "/src/B", a, b)).toBeDefined();
    });

    it("is a conflict when only the declared name differs", () => {
      const a = { name: "probe-mkt", pluginNames: ["sample-plugin"] };
      const b = { name: "renamed-mkt", pluginNames: ["sample-plugin"] };

      expect(marketplaceSourceConflict(reading, "probe-mkt", "/src/B", a, b)).toBeDefined();
    });

    it("is not a conflict when the plugin set is the same but listed in a different order", () => {
      const a = { name: "probe-mkt", pluginNames: ["a-plugin", "b-plugin"] };
      const b = { name: "probe-mkt", pluginNames: ["b-plugin", "a-plugin"] };

      expect(marketplaceSourceConflict(reading, "probe-mkt", "/src/B", a, b)).toBeUndefined();
    });

    it("is not a conflict when only a version field differs — an upgrade under the same name and plugin set, not a different catalog", () => {
      const a = { name: "probe-mkt", pluginNames: ["sample-plugin"], version: "1.0.0" };
      const b = { name: "probe-mkt", pluginNames: ["sample-plugin"], version: "2.0.0" };

      expect(marketplaceSourceConflict(reading, "probe-mkt", "/src/B", a, b)).toBeUndefined();
    });
  });
});

describe("pluginSetDifference / describePluginDiff", () => {
  it("names what was added and what was removed", () => {
    const registered = { name: "probe-mkt", pluginNames: ["kept-plugin", "removed-plugin"] };
    const requested = { name: "probe-mkt", pluginNames: ["kept-plugin", "added-plugin"] };

    const diff = pluginSetDifference(registered, requested);

    expect(diff).toEqual({ added: ["added-plugin"], removed: ["removed-plugin"] });
    expect(describePluginDiff(diff)).toBe("differ (+added-plugin, -removed-plugin)");
  });

  it("falls back to naming the declared name when the plugin sets already match", () => {
    const registered = { name: "probe-mkt", pluginNames: ["sample-plugin"] };
    const requested = { name: "renamed-mkt", pluginNames: ["sample-plugin"] };

    const diff = pluginSetDifference(registered, requested);

    expect(diff).toEqual({ added: [], removed: [] });
    expect(describePluginDiff(diff)).toBe("match, but the declared name differs");
  });
});
