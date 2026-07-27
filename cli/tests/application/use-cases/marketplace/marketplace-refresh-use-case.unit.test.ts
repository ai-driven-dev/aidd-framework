import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceRefreshUseCase } from "../../../../src/application/use-cases/marketplace/marketplace-refresh-use-case.js";
import { FetchMarketplaceSourceUseCase } from "../../../../src/application/use-cases/shared/fetch-marketplace-source-use-case.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import { MARKETPLACE_CACHE_SUBDIR } from "../../../../src/domain/models/paths.js";
import { serializePluginSource } from "../../../../src/domain/models/plugin-source.js";
import { PluginCatalogRepositoryAdapter } from "../../../../src/infrastructure/adapters/plugin-catalog-repository-adapter.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { FixturePluginFetcher } from "../../../helpers/ports/fixture-plugin-fetcher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceCache } from "../../../helpers/ports/in-memory-marketplace-cache.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const VALID_FIXTURE = join(process.cwd(), "tests/fixtures/framework/marketplace-sample");
const VERSIONED_FIXTURE = join(process.cwd(), "tests/fixtures/framework-real");
const PROJECT_ROOT = "/test-project";

async function buildUseCase() {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
  await seedFromDirectory(fs, VALID_FIXTURE, { useAbsolutePaths: true });
  await seedFromDirectory(fs, VERSIONED_FIXTURE, { useAbsolutePaths: true });
  const registry = new InMemoryMarketplaceRegistry();
  const fetchers: Record<string, string> = {
    [JSON.stringify(serializePluginSource({ kind: "local", path: VALID_FIXTURE }))]: VALID_FIXTURE,
    [JSON.stringify(serializePluginSource({ kind: "local", path: VERSIONED_FIXTURE }))]:
      VERSIONED_FIXTURE,
  };
  const pluginFetcher = new FixturePluginFetcher(fetchers);
  const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(pluginFetcher);
  const cache = new InMemoryMarketplaceCache();
  const useCase = new MarketplaceRefreshUseCase(
    new PluginCatalogRepositoryAdapter(fs),
    registry,
    fetchMarketplaceSource,
    cache
  );
  return { useCase, registry, cache };
}

describe("MarketplaceRefreshUseCase — force", () => {
  async function withRegistered(name: string) {
    const built = await buildUseCase();
    await built.registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name,
        source: { kind: "local", path: VALID_FIXTURE },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );
    return built;
  }

  it("clears the named marketplace's cache before re-fetching", async () => {
    const { useCase, cache } = await withRegistered("awesome");

    await useCase.execute({ projectRoot: PROJECT_ROOT, name: "awesome", force: true });

    expect(cache.clearCalls).toEqual(["awesome"]);
  });

  it("clears every cached marketplace when no name is given", async () => {
    const { useCase, cache } = await withRegistered("awesome");

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(cache.clearCalls).toEqual([undefined]);
  });

  it("leaves the cache untouched without the flag", async () => {
    const { useCase, cache } = await withRegistered("awesome");

    await useCase.execute({ projectRoot: PROJECT_ROOT, name: "awesome" });

    expect(cache.clearCalls).toEqual([]);
  });
});

describe("MarketplaceRefreshUseCase", () => {
  it("refreshes a registered marketplace and updates lastFetched", async () => {
    const { useCase, registry } = await buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "awesome",
        source: { kind: "local", path: VALID_FIXTURE },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.failedCount).toBe(0);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe("ok");
    const list = await registry.list(PROJECT_ROOT);
    expect(list[0]?.lastFetched).toBeDefined();
  });

  it("reports per-entry status and continues on failure", async () => {
    const { useCase, registry } = await buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "good",
        source: { kind: "local", path: VALID_FIXTURE },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "bad",
        source: { kind: "github", repo: "nonexistent/repo-12345" },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.results).toHaveLength(2);
    expect(result.failedCount).toBe(1);
    const good = result.results.find((r) => r.name === "good");
    const bad = result.results.find((r) => r.name === "bad");
    expect(good?.status).toBe("ok");
    expect(bad?.status).toBe("failed");
    expect(bad?.error).toBeDefined();
  });

  it("filters by name when provided", async () => {
    const { useCase, registry } = await buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "a",
        source: { kind: "local", path: VALID_FIXTURE },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "b",
        source: { kind: "local", path: VALID_FIXTURE },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT, name: "a" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.name).toBe("a");
  });

  it("persists catalog version when marketplace.json has a version field", async () => {
    const { useCase, registry } = await buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "aidd-framework",
        source: { kind: "local", path: VERSIONED_FIXTURE },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const list = await registry.list(PROJECT_ROOT);
    expect(list[0]?.version).toBe("1.0.0");
  });

  it("does not update version when catalog has no version field", async () => {
    const { useCase, registry } = await buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "awesome",
        source: { kind: "local", path: VALID_FIXTURE },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const list = await registry.list(PROJECT_ROOT);
    expect(list[0]?.version).toBeUndefined();
  });

  describe("stale cache detection", () => {
    it("emits info line when cache has relative plugin sources but plugin dirs are missing", async () => {
      const hasher = new DeterministicHasher();
      const fs = new InMemoryFileAdapter({}, hasher);
      await seedFromDirectory(fs, VALID_FIXTURE, { useAbsolutePaths: true });
      const registry = new InMemoryMarketplaceRegistry();
      const pluginFetcher = new FixturePluginFetcher({
        [JSON.stringify(serializePluginSource({ kind: "local", path: VALID_FIXTURE }))]:
          VALID_FIXTURE,
      });
      const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(pluginFetcher);
      const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn() };

      const cacheDir = join(PROJECT_ROOT, MARKETPLACE_CACHE_SUBDIR, "stale-mkt");
      const staleCatalogJson = JSON.stringify({
        plugins: [{ name: "aidd-dev", source: "./plugins/aidd-dev" }],
      });
      await fs.writeFile(join(cacheDir, ".claude-plugin/marketplace.json"), staleCatalogJson);

      const useCase = new MarketplaceRefreshUseCase(
        new PluginCatalogRepositoryAdapter(fs),
        registry,
        fetchMarketplaceSource,
        new InMemoryMarketplaceCache(),
        logger,
        fs
      );
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "stale-mkt",
          source: { kind: "local", path: VALID_FIXTURE },
          scope: "project",
          addedAt: "2026-04-29T10:00:00.000Z",
        })
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Detected stale cache for 'stale-mkt'")
      );
    });

    it("does not emit stale notice when plugin dirs already exist on disk", async () => {
      const hasher = new DeterministicHasher();
      const fs = new InMemoryFileAdapter({}, hasher);
      await seedFromDirectory(fs, VALID_FIXTURE, { useAbsolutePaths: true });
      const registry = new InMemoryMarketplaceRegistry();
      const pluginFetcher = new FixturePluginFetcher({
        [JSON.stringify(serializePluginSource({ kind: "local", path: VALID_FIXTURE }))]:
          VALID_FIXTURE,
      });
      const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(pluginFetcher);
      const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn() };

      const cacheDir = join(PROJECT_ROOT, MARKETPLACE_CACHE_SUBDIR, "fresh-mkt");
      const freshCatalogJson = JSON.stringify({
        plugins: [{ name: "aidd-dev", source: "./plugins/aidd-dev" }],
      });
      await fs.writeFile(join(cacheDir, ".claude-plugin/marketplace.json"), freshCatalogJson);
      await fs.writeFile(join(cacheDir, "plugins/aidd-dev/plugin.json"), "{}");

      const useCase = new MarketplaceRefreshUseCase(
        new PluginCatalogRepositoryAdapter(fs),
        registry,
        fetchMarketplaceSource,
        new InMemoryMarketplaceCache(),
        logger,
        fs
      );
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "fresh-mkt",
          source: { kind: "local", path: VALID_FIXTURE },
          scope: "project",
          addedAt: "2026-04-29T10:00:00.000Z",
        })
      );

      await useCase.execute({ projectRoot: PROJECT_ROOT });

      const infoCallsWithStale = (logger.info as ReturnType<typeof vi.fn>).mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === "string" && (args[0] as string).includes("Detected stale")
      );
      expect(infoCallsWithStale).toHaveLength(0);
    });
  });
});
