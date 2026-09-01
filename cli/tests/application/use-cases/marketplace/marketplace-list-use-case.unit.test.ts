import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketplaceListUseCase } from "../../../../src/application/use-cases/marketplace/marketplace-list-use-case.js";
import type { FetchMarketplaceSourceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace/fetch-marketplace-source-use-case.js";
import { ResolveMarketplaceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import type { PluginCatalog } from "../../../../src/domain/models/plugin-catalog.js";
import type { PluginCatalogRepository } from "../../../../src/domain/ports/plugin-catalog-repository.js";
import { MarketplaceRegistryAdapter } from "../../../../src/infrastructure/adapters/marketplace-registry-adapter.js";

const SAMPLE_MARKETPLACE = Marketplace.create({
  name: "awesome",
  source: { kind: "github", repo: "owner/awesome" },
  scope: "project",
  addedAt: "2026-04-29T10:00:00.000Z",
});

describe("MarketplaceListUseCase", () => {
  let projectRoot: string;
  let homeDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "mkt-list-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "mkt-list-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = homeDir;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  describe("without withCatalogs", () => {
    it("returns marketplaces from the registry", async () => {
      const registry = new MarketplaceRegistryAdapter();
      await registry.save(projectRoot, SAMPLE_MARKETPLACE);

      const useCase = new MarketplaceListUseCase(registry);
      const result = await useCase.execute({ projectRoot });

      expect(result.marketplaces).toHaveLength(1);
      expect(result.marketplaces[0]?.name).toBe("awesome");
      expect(result.catalogs).toBeUndefined();
    });

    it("returns empty when nothing registered", async () => {
      const useCase = new MarketplaceListUseCase(new MarketplaceRegistryAdapter());
      const result = await useCase.execute({ projectRoot });
      expect(result.marketplaces).toEqual([]);
    });
  });

  describe("withCatalogs: true", () => {
    it("returns catalogs map keyed by marketplace name", async () => {
      const registry = new MarketplaceRegistryAdapter();
      await registry.save(projectRoot, SAMPLE_MARKETPLACE);

      const fakeCatalog: PluginCatalog = {
        plugins: [
          {
            name: "my-plugin",
            version: "1.0.0",
            source: { kind: "local", path: "/fake" },
            recommended: false,
            strict: false,
          },
        ],
      };
      const fakeFetcher = {
        execute: async () => "/fake/local-path",
      } as unknown as FetchMarketplaceSourceUseCase;
      const fakeCatalogRepo: PluginCatalogRepository = {
        load: async () => fakeCatalog,
      };
      const resolveMarketplace = new ResolveMarketplaceUseCase(fakeFetcher, fakeCatalogRepo);

      const useCase = new MarketplaceListUseCase(registry, resolveMarketplace);
      const result = await useCase.execute({ projectRoot, withCatalogs: true });

      expect(result.marketplaces).toHaveLength(1);
      expect(result.catalogs).toBeDefined();
      expect(result.catalogs?.get("awesome")).toBe(fakeCatalog);
    });

    it("skips marketplace when catalog fetch fails and continues", async () => {
      const registry = new MarketplaceRegistryAdapter();
      await registry.save(projectRoot, SAMPLE_MARKETPLACE);

      const failingFetcher = {
        execute: async () => {
          throw new Error("network error");
        },
      } as unknown as FetchMarketplaceSourceUseCase;
      const fakeCatalogRepo: PluginCatalogRepository = {
        load: async () => null,
      };
      const resolveMarketplace = new ResolveMarketplaceUseCase(failingFetcher, fakeCatalogRepo);

      const useCase = new MarketplaceListUseCase(registry, resolveMarketplace);
      const result = await useCase.execute({ projectRoot, withCatalogs: true });

      expect(result.marketplaces).toHaveLength(1);
      expect(result.catalogs).toBeDefined();
      expect(result.catalogs?.size).toBe(0);
    });

    it("logs a warning through the logger when the catalog fetch fails", async () => {
      const registry = new MarketplaceRegistryAdapter();
      await registry.save(projectRoot, SAMPLE_MARKETPLACE);

      const failingFetcher = {
        execute: async () => {
          throw new Error("network error");
        },
      } as unknown as FetchMarketplaceSourceUseCase;
      const fakeCatalogRepo: PluginCatalogRepository = {
        load: async () => null,
      };
      const resolveMarketplace = new ResolveMarketplaceUseCase(failingFetcher, fakeCatalogRepo);
      const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn() };

      const useCase = new MarketplaceListUseCase(registry, resolveMarketplace, logger);
      await useCase.execute({ projectRoot, withCatalogs: true });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Skipping marketplace 'awesome'")
      );
    });

    it("skips catalog fetching entirely when resolveMarketplace is not wired", async () => {
      const registry = new MarketplaceRegistryAdapter();
      await registry.save(projectRoot, SAMPLE_MARKETPLACE);

      const useCase = new MarketplaceListUseCase(registry);
      const result = await useCase.execute({ projectRoot, withCatalogs: true });

      expect(result.marketplaces).toHaveLength(1);
      expect(result.catalogs).toBeDefined();
      expect(result.catalogs?.size).toBe(0);
    });
  });
});
