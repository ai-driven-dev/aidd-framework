import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { FetchMarketplaceSourceUseCase } from "../../../../../src/contexts/distribution/application/fetch-marketplace-source-use-case.js";
import { ResolveMarketplaceUseCase } from "../../../../../src/contexts/distribution/application/resolve-marketplace-use-case.js";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { PluginCatalogRepositoryAdapter } from "../../../../../src/contexts/distribution/infrastructure/plugin-catalog-repository-adapter.js";
import { MarketplaceCheckUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-check-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FixturePluginFetcher } from "../../../../helpers/ports/fixture-plugin-fetcher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

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
      InstalledPlugin.fromJSON({
        name: "ghost-plugin",
        source: { kind: "github", repo: "owner/ghost" },
        version: "1.0.0",
        strict: false,
        files: {},
        scope: "project",
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

function fixtureMarketplace(name: string): Marketplace {
  return Marketplace.create({
    name,
    source: { kind: "local", path: VALID_FIXTURE },
    scope: "project",
    addedAt: "2026-04-29T10:00:00.000Z",
  });
}

function installedFrom(marketplace: string, name: string): InstalledPlugin {
  return InstalledPlugin.fromJSON({
    name,
    source: { kind: "github", repo: `owner/${name}` },
    version: "1.0.0",
    strict: false,
    files: {},
    scope: "project",
    marketplace,
  });
}

async function manifestWith(
  manifestRepo: InMemoryManifestRepository,
  ...plugins: readonly InstalledPlugin[]
): Promise<void> {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  for (const plugin of plugins) manifest.addPlugin("claude", plugin);
  await manifestRepo.save(manifest);
}

describe("the staleness window", () => {
  it("honours a window narrower than the default", async () => {
    const { useCase, registry } = await buildUseCase();
    await registry.save(PROJECT_ROOT, fixtureMarketplace("recent"));
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await registry.updateLastFetched(PROJECT_ROOT, "recent", "project", threeDaysAgo);

    const narrowed = await useCase.execute({ projectRoot: PROJECT_ROOT, staleMaxDays: 1 });
    const byDefault = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(narrowed.stale.map((m) => m.name)).toStrictEqual(["recent"]);
    expect(byDefault.stale).toStrictEqual([]);
  });
});

describe("what counts as removed upstream", () => {
  it("reports nothing for a plugin the catalog still lists", async () => {
    const { useCase, registry, manifestRepo } = await buildUseCase();
    await manifestWith(manifestRepo, installedFrom("awesome", "dev"));
    await registry.save(PROJECT_ROOT, fixtureMarketplace("awesome"));

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.upstreamRemoved).toStrictEqual([]);
    expect(result.skipped).toStrictEqual([]);
  });

  it("reports exactly the plugin the catalog dropped", async () => {
    const { useCase, registry, manifestRepo } = await buildUseCase();
    await manifestWith(
      manifestRepo,
      installedFrom("awesome", "dev"),
      installedFrom("awesome", "ghost")
    );
    await registry.save(PROJECT_ROOT, fixtureMarketplace("awesome"));

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.upstreamRemoved).toStrictEqual([
      { marketplace: "awesome", plugin: "ghost", toolId: "claude" },
    ]);
  });

  it("never diffs a plugin installed from another marketplace against this catalog", async () => {
    const { useCase, registry, manifestRepo } = await buildUseCase();
    await manifestWith(manifestRepo, installedFrom("elsewhere", "ghost"));
    await registry.save(PROJECT_ROOT, fixtureMarketplace("awesome"));

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.upstreamRemoved).toStrictEqual([]);
  });

  it("reports nothing about installed plugins when the marketplace has no catalog to compare against", async () => {
    const { useCase, registry, manifestRepo } = await buildUseCase();
    await manifestWith(manifestRepo, installedFrom("empty", "ghost"));
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

    expect(result.upstreamRemoved).toStrictEqual([]);
    expect(result.skipped).toStrictEqual([]);
  });
});
