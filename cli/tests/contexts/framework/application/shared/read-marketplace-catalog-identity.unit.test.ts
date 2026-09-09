import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  marketplaceCatalogProbePath,
  readMarketplaceCatalogIdentity,
} from "../../../../../src/contexts/framework/application/shared/read-marketplace-catalog-identity.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const DIR = "/marketplace";
const CATALOG_PATH = join(DIR, ".claude-plugin", "marketplace.json");

function fsWithCatalog(catalog: unknown): InMemoryFileAdapter {
  return new InMemoryFileAdapter({ [CATALOG_PATH]: JSON.stringify(catalog) });
}

describe("readMarketplaceCatalogIdentity", () => {
  it("reads the name and plugin names the tool's own catalog file declares", async () => {
    const fs = fsWithCatalog({ name: "aidd-framework", plugins: [{ name: "a" }, { name: "b" }] });

    const identity = await readMarketplaceCatalogIdentity(fs, "claude", DIR);

    expect(identity).toStrictEqual({ name: "aidd-framework", pluginNames: ["a", "b"] });
  });

  it("answers no plugin names for a catalog that declares none", async () => {
    const fs = fsWithCatalog({ name: "aidd-framework" });

    const identity = await readMarketplaceCatalogIdentity(fs, "claude", DIR);

    expect(identity).toStrictEqual({ name: "aidd-framework", pluginNames: [] });
  });

  it("skips a plugin entry that is not an object or names nothing", async () => {
    const fs = fsWithCatalog({
      name: "aidd-framework",
      plugins: [null, "text", { name: 3 }, { version: "1.0.0" }, { name: "a" }],
    });

    const identity = await readMarketplaceCatalogIdentity(fs, "claude", DIR);

    expect(identity).toStrictEqual({ name: "aidd-framework", pluginNames: ["a"] });
  });

  it("answers nothing for a catalog whose name is not a string", async () => {
    const fs = fsWithCatalog({ name: 5, plugins: [{ name: "a" }] });

    expect(await readMarketplaceCatalogIdentity(fs, "claude", DIR)).toBeUndefined();
  });

  it("answers nothing for a tool that is not an AI tool", async () => {
    const fs = fsWithCatalog({ name: "aidd-framework" });

    expect(await readMarketplaceCatalogIdentity(fs, "vscode", DIR)).toBeUndefined();
  });
});

describe("marketplaceCatalogProbePath", () => {
  it("names nothing for a tool that is not an AI tool", () => {
    expect(marketplaceCatalogProbePath("vscode", DIR)).toBeUndefined();
  });
});
