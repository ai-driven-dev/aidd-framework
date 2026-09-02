import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FetchMarketplaceSourceUseCase } from "../../../src/contexts/distribution/application/fetch-marketplace-source-use-case.js";
import { ResolveMarketplaceUseCase } from "../../../src/contexts/distribution/application/resolve-marketplace-use-case.js";
import { Marketplace } from "../../../src/contexts/distribution/domain/marketplace.js";
import { PluginCatalogRepositoryAdapter } from "../../../src/contexts/distribution/infrastructure/plugin-catalog-repository-adapter.js";
import { PluginAddUseCase } from "../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import type { Prompter } from "../../../src/domain/ports/prompter.js";
import {
  InteractiveOnlyError,
  InvalidPluginManifestError,
  NoMarketplacesRegisteredError,
} from "../../../src/kernel/errors.js";
import { PluginPickUseCase } from "../../../src/presentation/prompts/plugin-pick-use-case.js";
import { buildUnitDeps, initAndInstall } from "../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../helpers/ports/fake-ensure-built-marketplace.js";
import type { InMemoryFileAdapter } from "../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../helpers/ports/in-memory-marketplace-registry.js";
import { KeepPrompter } from "../../helpers/ports/scripted-prompter.js";
import { seedFromDirectory } from "../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";
const MKT_DIR = "/mkt-source";
const MKT_DIR_2 = "/mkt-source-2";

function seedMarketplaceFile(
  fs: InMemoryFileAdapter,
  dir: string,
  plugins: Array<Record<string, unknown>>
): void {
  fs.writeFile(join(dir, ".claude-plugin/marketplace.json"), JSON.stringify({ plugins }));
}

function registerMarketplace(
  registry: InMemoryMarketplaceRegistry,
  name: string,
  dir: string
): Promise<void> {
  return registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name,
      source: { kind: "local", path: dir },
      scope: "project",
      addedAt: "2026-04-29T10:00:00.000Z",
    })
  );
}

async function buildUseCase(prompter: Prompter = new KeepPrompter()) {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  await initAndInstall(deps, PROJECT_ROOT, "claude");
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  const registry = new InMemoryMarketplaceRegistry();
  const pluginAdd = new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    deps.logger,
    registry,
    fakeEnsureBuiltMarketplace()
  );
  const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(deps.pluginFetcher);
  const resolveMarketplace = new ResolveMarketplaceUseCase(
    fetchMarketplaceSource,
    new PluginCatalogRepositoryAdapter(deps.fs)
  );
  const useCase = new PluginPickUseCase(registry, resolveMarketplace, pluginAdd, prompter);
  return { useCase, deps, registry };
}

describe("PluginPickUseCase", () => {
  it("throws InteractiveOnlyError when not interactive", async () => {
    const { useCase } = await buildUseCase();
    await expect(
      useCase.execute({ toolIds: ["claude"], projectRoot: PROJECT_ROOT, interactive: false })
    ).rejects.toThrow(InteractiveOnlyError);
  });

  it("throws NoMarketplacesRegisteredError when registry is empty", async () => {
    const { useCase } = await buildUseCase();
    await expect(
      useCase.execute({ toolIds: ["claude"], projectRoot: PROJECT_ROOT, interactive: true })
    ).rejects.toThrow(NoMarketplacesRegisteredError);
  });

  it("installs the recommended plugins from the only registered marketplace", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    seedMarketplaceFile(deps.fs, MKT_DIR, [
      {
        name: "sample-plugin",
        source: { kind: "local", path: PLUGIN_FIXTURE },
        version: "1.0.0",
        recommended: true,
      },
    ]);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "local",
        source: { kind: "local", path: MKT_DIR },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      interactive: true,
    });

    expect(result.marketplace.name).toBe("local");
    expect(result.installed).toEqual(["sample-plugin"]);
    const manifest = await deps.manifestRepo.load();
    const plugins = manifest?.getPlugins("claude") ?? [];
    const installed = plugins.find((p) => p.name === "sample-plugin");
    expect(installed?.marketplace).toBe("local");
  });

  it("prompts to choose a marketplace when more than one is registered", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    seedMarketplaceFile(deps.fs, MKT_DIR, []);
    seedMarketplaceFile(deps.fs, MKT_DIR_2, []);
    await registerMarketplace(registry, "first", MKT_DIR);
    await registerMarketplace(registry, "second", MKT_DIR_2);

    const result = await useCase.execute({
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      interactive: true,
    });

    expect(result.marketplace.name).toBe("first");
    expect(result.installed).toEqual([]);
  });

  it("throws InvalidPluginManifestError when the marketplace catalog cannot be found", async () => {
    const { useCase, registry } = await buildUseCase();
    await registerMarketplace(registry, "local", MKT_DIR);

    await expect(
      useCase.execute({ toolIds: ["claude"], projectRoot: PROJECT_ROOT, interactive: true })
    ).rejects.toThrow(new InvalidPluginManifestError(`marketplace.json not found at "${MKT_DIR}"`));
  });

  it("returns no installed plugins and skips the selection prompt when the catalog is empty", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    seedMarketplaceFile(deps.fs, MKT_DIR, []);
    await registerMarketplace(registry, "local", MKT_DIR);

    const result = await useCase.execute({
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      interactive: true,
    });

    expect(result.installed).toEqual([]);
  });

  it("installs an entry that carries a description and an explicit strict flag on the catalog", async () => {
    const { useCase, deps, registry } = await buildUseCase();
    seedMarketplaceFile(deps.fs, MKT_DIR, [
      {
        name: "sample-plugin",
        source: { kind: "local", path: PLUGIN_FIXTURE },
        version: "1.0.0",
        description: "A sample plugin used in tests",
        recommended: true,
        strict: true,
      },
    ]);
    await registerMarketplace(registry, "local", MKT_DIR);

    const result = await useCase.execute({
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
      interactive: true,
    });

    expect(result.installed).toEqual(["sample-plugin"]);
  });
});
