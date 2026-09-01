import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MarketplaceAddUseCase } from "../../../../src/application/use-cases/marketplace/marketplace-add-use-case.js";
import { MarketplaceRemoveUseCase } from "../../../../src/application/use-cases/marketplace/marketplace-remove-use-case.js";
import { FetchMarketplaceSourceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace/fetch-marketplace-source-use-case.js";
import { ResolveMarketplaceUseCase } from "../../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import {
  InvalidMarketplaceNameError,
  InvalidPluginManifestError,
  MarketplaceAlreadyRegisteredError,
  TrustDeniedError,
} from "../../../../src/domain/errors.js";
import type { Prompter } from "../../../../src/domain/ports/prompter.js";
import { PluginCatalogRepositoryAdapter } from "../../../../src/infrastructure/adapters/plugin-catalog-repository-adapter.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { FixturePluginFetcher } from "../../../helpers/ports/fixture-plugin-fetcher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { InMemoryMarketplaceTrustStore } from "../../../helpers/ports/in-memory-marketplace-trust-store.js";
import { KeepPrompter } from "../../../helpers/ports/scripted-prompter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const MARKETPLACE_FIXTURE = join(process.cwd(), "tests/fixtures/framework/marketplace-sample");
const PROJECT_ROOT = "/test-project";

class DenyPrompter extends KeepPrompter {
  override async confirm(): Promise<boolean> {
    return false;
  }
}

async function buildUseCase(prompter: Prompter = new KeepPrompter()) {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
  await seedFromDirectory(fs, MARKETPLACE_FIXTURE, { useAbsolutePaths: true });
  const registry = new InMemoryMarketplaceRegistry();
  const trustStore = new InMemoryMarketplaceTrustStore();
  const manifestRepo = new InMemoryManifestRepository();
  const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(new FixturePluginFetcher());
  const resolveMarketplace = new ResolveMarketplaceUseCase(
    fetchMarketplaceSource,
    new PluginCatalogRepositoryAdapter(fs)
  );
  const removeUseCase = new MarketplaceRemoveUseCase(fs, manifestRepo, registry, prompter);
  const useCase = new MarketplaceAddUseCase(
    registry,
    trustStore,
    resolveMarketplace,
    prompter,
    removeUseCase
  );
  return { useCase, registry, trustStore };
}

describe("MarketplaceAddUseCase", () => {
  describe("happy path", () => {
    it("persists the marketplace and trusts the source", async () => {
      const { useCase, registry, trustStore } = await buildUseCase(new KeepPrompter());
      const source = { kind: "local" as const, path: MARKETPLACE_FIXTURE };

      const result = await useCase.execute({
        source,
        name: "awesome",
        scope: "project",
        projectRoot: PROJECT_ROOT,
        autoTrust: false,
      });

      expect(result.marketplace.name).toBe("awesome");
      const list = await registry.list(PROJECT_ROOT);
      expect(list).toHaveLength(1);
      expect(await trustStore.isTrusted(PROJECT_ROOT, source)).toBe(true);
    });

    it("autoTrust skips the prompt", async () => {
      const { useCase, trustStore } = await buildUseCase(new DenyPrompter());
      const source = { kind: "local" as const, path: MARKETPLACE_FIXTURE };

      await useCase.execute({
        source,
        name: "awesome",
        scope: "project",
        projectRoot: PROJECT_ROOT,
        autoTrust: true,
      });

      expect(await trustStore.isTrusted(PROJECT_ROOT, source)).toBe(true);
    });
  });

  describe("error paths", () => {
    it("throws when name is already registered", async () => {
      const { useCase } = await buildUseCase();
      const source = { kind: "local" as const, path: MARKETPLACE_FIXTURE };
      await useCase.execute({
        source,
        name: "awesome",
        scope: "project",
        projectRoot: PROJECT_ROOT,
        autoTrust: true,
      });

      await expect(
        useCase.execute({
          source,
          name: "awesome",
          scope: "project",
          projectRoot: PROJECT_ROOT,
          autoTrust: true,
        })
      ).rejects.toThrow(MarketplaceAlreadyRegisteredError);
    });

    it("rejects the reserved name 'aidd-framework'", async () => {
      const { useCase } = await buildUseCase();

      await expect(
        useCase.execute({
          source: { kind: "local", path: MARKETPLACE_FIXTURE },
          name: "aidd-framework",
          scope: "project",
          projectRoot: PROJECT_ROOT,
          autoTrust: true,
        })
      ).rejects.toThrow(InvalidMarketplaceNameError);
    });

    it("overwrite=true replaces an existing entry without throwing", async () => {
      const { useCase, registry } = await buildUseCase();
      const source = { kind: "local" as const, path: MARKETPLACE_FIXTURE };
      await useCase.execute({
        source,
        name: "awesome",
        scope: "project",
        projectRoot: PROJECT_ROOT,
        autoTrust: true,
      });

      await useCase.execute({
        source,
        name: "awesome",
        scope: "project",
        projectRoot: PROJECT_ROOT,
        autoTrust: true,
        overwrite: true,
      });

      const list = await registry.list(PROJECT_ROOT);
      expect(list).toHaveLength(1);
      expect(list[0]?.name).toBe("awesome");
    });

    it("throws InvalidPluginManifestError when marketplace.json is missing at the source", async () => {
      const { useCase } = await buildUseCase();
      const source = { kind: "local" as const, path: "/empty-marketplace-dir" };

      await expect(
        useCase.execute({
          source,
          name: "empty",
          scope: "project",
          projectRoot: PROJECT_ROOT,
          autoTrust: true,
        })
      ).rejects.toThrow(InvalidPluginManifestError);
    });

    it("throws TrustDeniedError when the user denies trust", async () => {
      const { useCase } = await buildUseCase(new DenyPrompter());

      await expect(
        useCase.execute({
          source: { kind: "local", path: MARKETPLACE_FIXTURE },
          name: "awesome",
          scope: "project",
          projectRoot: PROJECT_ROOT,
          autoTrust: false,
        })
      ).rejects.toThrow(TrustDeniedError);
    });
  });
});
