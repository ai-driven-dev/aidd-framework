import { describe, expect, it } from "vitest";
import type { PluginCatalog } from "../../../src/contexts/distribution/domain/catalog.js";
import { Marketplace } from "../../../src/contexts/distribution/domain/marketplace.js";
import {
  printCatalogEntries,
  printMarketplaceCheck,
  printMarketplaceRegistered,
  printMarketplaceRemoved,
  printRefreshResults,
  printRegisteredMarketplaces,
} from "../../../src/presentation/display/marketplace-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

function marketplace(name: string, version?: string): Marketplace {
  return Marketplace.fromJSON({
    name,
    source: { kind: "local", path: `/tmp/${name}` },
    scope: "project",
    addedAt: "2020-01-01T00:00:00.000Z",
    ...(version === undefined ? {} : { version }),
  });
}

function catalog(entries: PluginCatalog["plugins"]): PluginCatalog {
  return { plugins: entries };
}

describe("printCatalogEntries", () => {
  it("warns instead of listing when the catalog could not be fetched", () => {
    const output = new CapturingOutput(false);

    printCatalogEntries(output, "acme", new Map());

    expect(output.at("warn")).toEqual(["  (could not fetch catalog for 'acme')"]);
  });

  it("prints one indented row per plugin, source described", () => {
    const output = new CapturingOutput(false);
    const catalogs = new Map([
      [
        "acme",
        catalog([
          {
            name: "widget",
            version: "1.2.3",
            description: "does widgets",
            source: { kind: "local", path: "/tmp/widget" },
            recommended: false,
            strict: false,
          },
        ]),
      ],
    ]);

    printCatalogEntries(output, "acme", catalogs);

    expect(output.at("print")).toEqual(["  widget@1.2.3 — does widgets — /tmp/widget"]);
  });

  it("marks a recommended plugin and falls back to ? for a version it has none of", () => {
    const output = new CapturingOutput(false);
    const catalogs = new Map([
      [
        "acme",
        catalog([
          {
            name: "widget",
            source: { kind: "local", path: "/tmp/widget" },
            recommended: true,
            strict: false,
          },
        ]),
      ],
    ]);

    printCatalogEntries(output, "acme", catalogs);

    expect(output.at("print")).toEqual(["  widget@? —  — /tmp/widget (recommended)"]);
  });
});

describe("printRegisteredMarketplaces", () => {
  it("says none is registered rather than printing nothing", () => {
    const output = new CapturingOutput(false);

    printRegisteredMarketplaces(output, [], undefined);

    expect(output.captured).toEqual([{ level: "info", message: "No marketplaces registered." }]);
  });

  it("prints a name with its scope, and its version only when it has one", () => {
    const output = new CapturingOutput(false);

    printRegisteredMarketplaces(
      output,
      [marketplace("acme", "2.0.0"), marketplace("beta")],
      undefined
    );

    expect(output.at("print")).toEqual(["acme v2.0.0 [project]", "beta [project]"]);
  });

  it("follows each marketplace with its catalog when catalogs were fetched", () => {
    const output = new CapturingOutput(false);
    const catalogs = new Map([["acme", catalog([])]]);

    printRegisteredMarketplaces(output, [marketplace("acme"), marketplace("beta")], catalogs);

    expect(output.captured).toEqual([
      { level: "print", message: "acme [project]" },
      { level: "print", message: "beta [project]" },
      { level: "warn", message: "  (could not fetch catalog for 'beta')" },
    ]);
  });
});

describe("printMarketplaceRegistered", () => {
  it("names the marketplace that was registered", () => {
    const output = new CapturingOutput(false);

    printMarketplaceRegistered(output, "acme");

    expect(output.at("success")).toEqual(["Marketplace 'acme' registered."]);
  });
});

describe("printMarketplaceRemoved", () => {
  it("names the marketplace and how many plugins went with it", () => {
    const output = new CapturingOutput(false);

    printMarketplaceRemoved(output, "acme", 2);

    expect(output.at("success")).toEqual(["Marketplace 'acme' removed (2 plugin(s) cleaned up)."]);
  });
});

describe("printRefreshResults", () => {
  it("prints a status per marketplace, appending an error only where there is one", () => {
    const output = new CapturingOutput(false);

    printRefreshResults(output, [
      { name: "acme", status: "ok" },
      { name: "beta", status: "failed", error: "404" },
    ]);

    expect(output.at("print")).toEqual(["acme: ok", "beta: failed (404)"]);
  });
});

describe("printMarketplaceCheck", () => {
  it("reports everything fresh when nothing is stale, removed or skipped", () => {
    const output = new CapturingOutput(false);

    printMarketplaceCheck(output, { stale: [], upstreamRemoved: [], skipped: [] });

    expect(output.captured).toEqual([{ level: "success", message: "All marketplaces fresh." }]);
  });

  it("lists stale marketplaces, then upstream removals, then skips", () => {
    const output = new CapturingOutput(false);

    printMarketplaceCheck(output, {
      stale: [marketplace("acme")],
      upstreamRemoved: [{ marketplace: "beta", plugin: "widget", toolId: "claude" }],
      skipped: [{ marketplace: "gamma", error: "unreachable" }],
    });

    expect(output.captured).toEqual([
      { level: "print", message: "stale: acme" },
      { level: "print", message: "removed: beta/widget (claude)" },
      { level: "warn", message: "skipped: gamma — unreachable" },
    ]);
  });

  it("withholds the all-fresh line as soon as one marketplace is stale", () => {
    const output = new CapturingOutput(false);

    printMarketplaceCheck(output, {
      stale: [marketplace("acme")],
      upstreamRemoved: [],
      skipped: [],
    });

    expect(output.captured).toEqual([{ level: "print", message: "stale: acme" }]);
  });

  it("withholds the all-fresh line as soon as one plugin went upstream", () => {
    const output = new CapturingOutput(false);

    printMarketplaceCheck(output, {
      stale: [],
      upstreamRemoved: [{ marketplace: "beta", plugin: "widget", toolId: "claude" }],
      skipped: [],
    });

    expect(output.captured).toEqual([{ level: "print", message: "removed: beta/widget (claude)" }]);
  });

  it("withholds the all-fresh line as soon as one marketplace was skipped", () => {
    const output = new CapturingOutput(false);

    printMarketplaceCheck(output, {
      stale: [],
      upstreamRemoved: [],
      skipped: [{ marketplace: "gamma", error: "unreachable" }],
    });

    expect(output.captured).toEqual([{ level: "warn", message: "skipped: gamma — unreachable" }]);
  });
});
