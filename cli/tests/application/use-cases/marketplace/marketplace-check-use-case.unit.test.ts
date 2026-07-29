import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/domain/tools/ai/claude.js";
import { MarketplaceCheckUseCase } from "../../../../src/application/use-cases/marketplace/marketplace-check-use-case.js";
import { FetchMarketplaceSourceUseCase } from "../../../../src/application/use-cases/shared/fetch-marketplace-source-use-case.js";
import { ResolveMarketplaceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import { Plugin } from "../../../../src/domain/models/plugin.js";
import { PluginCatalogRepositoryAdapter } from "../../../../src/infrastructure/adapters/plugin-catalog-repository-adapter.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { FixturePluginFetcher } from "../../../helpers/ports/fixture-plugin-fetcher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const VALID_FIXTURE = join(process.cwd(), "tests/fixtures/framework/marketplace-sample");
const PROJECT_ROOT = "/test-project";

async function buildUseCase() {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
  await seedFromDirectory(fs, VALID_FIXTURE, { useAbsolutePaths: true });
  const registry = new InMemoryMarketplaceRegistry();
  const manifestRepo = new InMemoryManifestRepository();
  const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(new FixturePluginFetcher());
  const resolveMarketplace = new ResolveMarketplaceUseCase(
    fetchMarketplaceSource,
    new PluginCatalogRepositoryAdapter(fs)
  );
  const useCase = new MarketplaceCheckUseCase(manifestRepo, registry, resolveMarketplace);
  return { useCase, registry, manifestRepo };
}

describe("MarketplaceCheckUseCase", () => {
  it("flags entries with no lastFetched as stale", async () => {
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

    expect(result.stale.map((m) => m.name)).toEqual(["awesome"]);
  });

  it("does not flag entries fetched within the window", async () => {
    const { useCase, registry } = await buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "fresh",
        source: { kind: "local", path: VALID_FIXTURE },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );
    await registry.updateLastFetched(PROJECT_ROOT, "fresh", "project", new Date().toISOString());

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.stale).toEqual([]);
  });

  it("reports upstream-removed plugins", async () => {
    const { useCase, registry, manifestRepo } = await buildUseCase();
    const manifest = Manifest.create();
    manifest.addTool("claude", "1.0.0", []);
    manifest.addPlugin(
      "claude",
      Plugin.fromJSON({
        name: "ghost-plugin",
        source: { kind: "github", repo: "owner/ghost" },
        version: "1.0.0",
        strict: false,
        files: {},
        marketplace: "awesome",
      })
    );
    await manifestRepo.save(manifest);
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

    expect(result.upstreamRemoved).toContainEqual({
      marketplace: "awesome",
      plugin: "ghost-plugin",
      toolId: "claude",
    });
  });

  it("neither skips nor reports upstream-removed when the catalog is missing (no error)", async () => {
    const { useCase, registry } = await buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "empty",
        source: { kind: "local", path: "/nonexistent-marketplace-dir" },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.skipped).toEqual([]);
    expect(result.upstreamRemoved).toEqual([]);
  });

  it("reports the marketplace as skipped when the catalog fetch throws", async () => {
    const { useCase, registry } = await buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "unreachable",
        source: { kind: "github", repo: "nonexistent/repo-12345" },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.marketplace).toBe("unreachable");
    expect(result.skipped[0]?.error).toBeDefined();
  });
});
