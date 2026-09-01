import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginSearchUseCase } from "../../../../src/application/use-cases/plugin/plugin-search-use-case.js";
import { FetchMarketplaceSourceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace/fetch-marketplace-source-use-case.js";
import { ResolveMarketplaceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import { PluginCatalogRepositoryAdapter } from "../../../../src/infrastructure/adapters/plugin-catalog-repository-adapter.js";
import { FixturePluginFetcher } from "../../../helpers/ports/fixture-plugin-fetcher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const MKT1_PATH = "/mkt1";
const MKT2_PATH = "/mkt2";

function seedMarketplace(
  fs: InMemoryFileAdapter,
  dir: string,
  plugins: Array<Record<string, unknown>>
): void {
  fs.writeFile(join(dir, ".claude-plugin", "marketplace.json"), JSON.stringify({ plugins }));
}

function buildUseCase(
  fs: InMemoryFileAdapter,
  registry: InMemoryMarketplaceRegistry
): PluginSearchUseCase {
  const fetcher = new FixturePluginFetcher({
    [MKT1_PATH]: MKT1_PATH,
    [MKT2_PATH]: MKT2_PATH,
  });
  const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(fetcher);
  const resolveMarketplace = new ResolveMarketplaceUseCase(
    fetchMarketplaceSource,
    new PluginCatalogRepositoryAdapter(fs)
  );
  return new PluginSearchUseCase(registry, resolveMarketplace);
}

describe("PluginSearchUseCase", () => {
  it("matches by name and description across marketplaces", async () => {
    const fs = new InMemoryFileAdapter();
    seedMarketplace(fs, MKT1_PATH, [
      {
        name: "sample-plugin",
        source: { kind: "github", repo: "x/y" },
        description: "Hello world",
      },
    ]);
    seedMarketplace(fs, MKT2_PATH, [
      {
        name: "different",
        source: { kind: "github", repo: "a/b" },
        description: "Greets the world",
      },
    ]);
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_PATH },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt2",
        source: { kind: "local", path: MKT2_PATH },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await buildUseCase(fs, registry).execute({
      query: "world",
      recommendedOnly: false,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.hits.map((h) => h.entry.name).sort()).toEqual(["different", "sample-plugin"]);
  });

  it("filters by --recommended", async () => {
    const fs = new InMemoryFileAdapter();
    seedMarketplace(fs, MKT1_PATH, [
      { name: "a", source: { kind: "github", repo: "x/y" }, recommended: true },
      { name: "b", source: { kind: "github", repo: "x/y" }, recommended: false },
    ]);
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_PATH },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await buildUseCase(fs, registry).execute({
      query: "",
      recommendedOnly: true,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.hits.map((h) => h.entry.name)).toEqual(["a"]);
  });

  it("filters by --marketplace", async () => {
    const fs = new InMemoryFileAdapter();
    const entry = { name: "shared", source: { kind: "github", repo: "x/y" } };
    seedMarketplace(fs, MKT1_PATH, [entry]);
    seedMarketplace(fs, MKT2_PATH, [entry]);
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt1",
        source: { kind: "local", path: MKT1_PATH },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "mkt2",
        source: { kind: "local", path: MKT2_PATH },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await buildUseCase(fs, registry).execute({
      query: "shared",
      recommendedOnly: false,
      marketplace: "mkt2",
      projectRoot: PROJECT_ROOT,
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.marketplace.name).toBe("mkt2");
  });

  it("returns empty when no marketplaces are registered", async () => {
    const fs = new InMemoryFileAdapter();
    const registry = new InMemoryMarketplaceRegistry();
    const result = await buildUseCase(fs, registry).execute({
      query: "anything",
      recommendedOnly: false,
      projectRoot: PROJECT_ROOT,
    });
    expect(result.hits).toEqual([]);
  });
});
