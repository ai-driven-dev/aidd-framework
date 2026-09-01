import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MarketplaceRefreshUseCase } from "../../../../src/application/use-cases/marketplace/marketplace-refresh-use-case.js";
import { FetchMarketplaceSourceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace/fetch-marketplace-source-use-case.js";
import { ResolveMarketplaceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import { PluginCatalogRepositoryAdapter } from "../../../../src/infrastructure/adapters/plugin-catalog-repository-adapter.js";
import { serializePluginSource } from "../../../../src/kernel/source.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { FixturePluginFetcher } from "../../../helpers/ports/fixture-plugin-fetcher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceCache } from "../../../helpers/ports/in-memory-marketplace-cache.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const VALID_FIXTURE = join(process.cwd(), "tests/fixtures/framework/marketplace-sample");
const PROJECT_ROOT = "/test-project";

async function buildUseCase() {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
  await seedFromDirectory(fs, VALID_FIXTURE, { useAbsolutePaths: true });
  const registry = new InMemoryMarketplaceRegistry();
  const pluginFetcher = new FixturePluginFetcher({
    [JSON.stringify(serializePluginSource({ kind: "local", path: VALID_FIXTURE }))]: VALID_FIXTURE,
  });
  const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(pluginFetcher);
  const resolveMarketplace = new ResolveMarketplaceUseCase(
    fetchMarketplaceSource,
    new PluginCatalogRepositoryAdapter(fs)
  );
  const logger = new CapturingLogger();
  const useCase = new MarketplaceRefreshUseCase(
    registry,
    resolveMarketplace,
    new InMemoryMarketplaceCache(),
    logger
  );
  return { useCase, registry, logger };
}

describe("MarketplaceRefreshUseCase — progress output", () => {
  it("emits a fetching message for each marketplace being refreshed", async () => {
    const { useCase, registry, logger } = await buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "my-marketplace",
        source: { kind: "local", path: VALID_FIXTURE },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(logger.infoMessages.some((m) => m.includes("my-marketplace"))).toBe(true);
    expect(logger.infoMessages.some((m) => m.includes("Fetching"))).toBe(true);
  });
});
