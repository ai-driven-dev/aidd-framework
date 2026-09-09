import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { describe, expect, it } from "vitest";
import type {
  MarketplaceRegisterFramework,
  MarketplaceRegisterFrameworkOptions,
  MarketplaceRegisterFrameworkResult,
} from "../../../../../src/contexts/distribution/application/marketplace-register-framework-use-case.js";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  Marketplace,
} from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { UserSourceReferencesAdapter } from "../../../../../src/contexts/framework/infrastructure/user-source-references-adapter.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FakeCurrentVersion } from "../../../../helpers/ports/fake-current-version.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const VERSION = "1.0.0";

/** A manifest with claude installed and no plugin — enough for `sync` to run its
 * settings pass, without a registered activator to drive (no catalog fixture needed). */
async function manifestRepoWithClaudeInstalled(): Promise<InMemoryManifestRepository> {
  const manifestRepo = new InMemoryManifestRepository();
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  await manifestRepo.save(manifest);
  return manifestRepo;
}

function frameworkMarketplace(): Marketplace {
  return Marketplace.create({
    name: FRAMEWORK_MARKETPLACE_NAME,
    source: { kind: "local", path: "/shared/built/path" },
    scope: "user",
    addedAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("the shared source's own reference, recorded by sync", () => {
  it("records this project's reference when the framework marketplace is already registered", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    fs.setFile(`${PROJECT_ROOT}/marker`, "");
    const manifestRepo = await manifestRepoWithClaudeInstalled();
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, frameworkMarketplace());
    const userSourceReferences = new UserSourceReferencesAdapter(
      fs,
      () => "/fake-home/.config/aidd"
    );

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map(), // no activators: this run only proves the reference, not native activation
      fakeEnsureBuiltMarketplace(),
      new Map(),
      () => "",
      undefined,
      userSourceReferences,
      new FakeCurrentVersion(VERSION)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(await userSourceReferences.listAllReferencingProjects()).toContain(PROJECT_ROOT);
  });

  // `references.json` is a help, not an authority: a corrupted copy must never block `sync`,
  // which does not depend on it.
  it("warns and still completes sync when references.json is corrupted", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    fs.setFile(`${PROJECT_ROOT}/marker`, "");
    fs.setFile("/fake-home/.config/aidd/references.json", "not json");
    const manifestRepo = await manifestRepoWithClaudeInstalled();
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, frameworkMarketplace());
    const userSourceReferences = new UserSourceReferencesAdapter(
      fs,
      () => "/fake-home/.config/aidd"
    );
    const logger = new CapturingLogger();

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      logger,
      new Map(),
      fakeEnsureBuiltMarketplace(),
      new Map(),
      () => "",
      undefined,
      userSourceReferences,
      new FakeCurrentVersion(VERSION)
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.errors).toEqual([]);
    expect(logger.warnMessages.some((m) => m.includes("references.json"))).toBe(true);
  });

  it("never records a reference to a marketplace registered at project scope", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    fs.setFile(`${PROJECT_ROOT}/marker`, "");
    const manifestRepo = await manifestRepoWithClaudeInstalled();
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: FRAMEWORK_MARKETPLACE_NAME,
        source: { kind: "local", path: "/project/built/path" },
        scope: "project",
        addedAt: "2026-01-01T00:00:00.000Z",
      })
    );
    const userSourceReferences = new UserSourceReferencesAdapter(
      fs,
      () => "/fake-home/.config/aidd"
    );

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map(),
      fakeEnsureBuiltMarketplace(),
      new Map(),
      () => "",
      undefined,
      userSourceReferences,
      new FakeCurrentVersion(VERSION)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(await userSourceReferences.listAllReferencingProjects()).not.toContain(PROJECT_ROOT);
  });

  // A clone whose committed manifest predates this machine's own copy of the registry finds
  // `marketplaces` empty, and nothing about a fresh clone ever populates that registry.
  it("recreates the framework marketplace when this machine's registry holds nothing at all", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    fs.setFile(`${PROJECT_ROOT}/marker`, "");
    const manifestRepo = await manifestRepoWithClaudeInstalled();
    const registry = new InMemoryMarketplaceRegistry(); // empty: nothing registered yet
    const userSourceReferences = new UserSourceReferencesAdapter(
      fs,
      () => "/fake-home/.config/aidd"
    );
    const registerFramework: MarketplaceRegisterFramework = {
      execute: async (
        options: MarketplaceRegisterFrameworkOptions
      ): Promise<MarketplaceRegisterFrameworkResult> => {
        await registry.save(options.projectRoot, frameworkMarketplace());
        return { registered: true, scope: "user" as const };
      },
    };

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map(),
      fakeEnsureBuiltMarketplace(),
      new Map(),
      () => "",
      registerFramework,
      userSourceReferences,
      new FakeCurrentVersion(VERSION)
    );

    await useCase.execute({ projectRoot: PROJECT_ROOT, recreateFrameworkIfMissing: true });

    expect((await registry.list(PROJECT_ROOT)).map((m) => m.name)).toContain(
      FRAMEWORK_MARKETPLACE_NAME
    );
    expect(await userSourceReferences.listAllReferencingProjects()).toContain(PROJECT_ROOT);
  });

  it("stays a silent no-op when no recreate use case was wired in", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    const manifestRepo = await manifestRepoWithClaudeInstalled();
    const registry = new InMemoryMarketplaceRegistry();

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map(),
      fakeEnsureBuiltMarketplace()
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result).toEqual({ activated: [], binaryMissing: [], warnings: [], errors: [] });
  });

  // Every marketplace and plugin command reaches this same `execute`, where an empty registry is
  // a deliberate choice, never a fresh clone: recreating it would undo a `marketplace remove`.
  it("does not recreate the framework marketplace unless the caller asks for it", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    fs.setFile(`${PROJECT_ROOT}/marker`, "");
    const manifestRepo = await manifestRepoWithClaudeInstalled();
    const registry = new InMemoryMarketplaceRegistry(); // empty, on purpose
    const registerFramework: MarketplaceRegisterFramework = {
      execute: async (options: MarketplaceRegisterFrameworkOptions) => {
        await registry.save(options.projectRoot, frameworkMarketplace());
        return { registered: true, scope: "user" as const };
      },
    };

    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map(),
      fakeEnsureBuiltMarketplace(),
      new Map(),
      () => "",
      registerFramework,
      new UserSourceReferencesAdapter(fs, () => "/fake-home/.config/aidd"),
      new FakeCurrentVersion(VERSION)
    );

    // No `recreateFrameworkIfMissing` — the same call shape `syncNativeActivation` uses.
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(await registry.list(PROJECT_ROOT)).toEqual([]);
  });
});
