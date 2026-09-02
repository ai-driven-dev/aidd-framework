import { describe, expect, it, vi } from "vitest";
import type { MarketplaceRefresh } from "../../../src/application/use-cases/marketplace/marketplace-refresh-use-case.js";
import type { MarketplaceRegisterFramework } from "../../../src/application/use-cases/marketplace/marketplace-register-framework-use-case.js";
import type { MarketplaceSyncSettings } from "../../../src/application/use-cases/marketplace/marketplace-sync-settings-use-case.js";
import type { PluginInstallFromMarketplace } from "../../../src/application/use-cases/plugin/plugin-install-from-marketplace-use-case.js";
import type { PluginPick } from "../../../src/application/use-cases/plugin/plugin-pick-use-case.js";
import { SetupMarketplaceSourceUseCase } from "../../../src/application/use-cases/setup/setup-marketplace-source-use-case.js";
import { SetupPluginsPromptUseCase } from "../../../src/application/use-cases/setup/setup-plugins-prompt-use-case.js";
import { SetupToolsUseCase } from "../../../src/application/use-cases/setup/setup-tools-use-case.js";
import { SetupUseCase } from "../../../src/application/use-cases/setup-use-case.js";
import type { ResolveMarketplace } from "../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import { CatalogFetchAuthError } from "../../../src/domain/errors.js";
import { FRAMEWORK_MARKETPLACE_NAME, Marketplace } from "../../../src/domain/models/marketplace.js";
import { MarketplaceSourceMode } from "../../../src/domain/models/marketplace-source-mode.js";
import { SetupFlow } from "../../../src/domain/models/setup-flow.js";
import type { LatestReleaseResolver } from "../../../src/domain/ports/latest-release-resolver.js";
import type { TokenProvider } from "../../../src/domain/ports/token-provider.js";
import { buildUnitDeps } from "../../helpers/ports/build-unit-deps.js";
import { InMemoryMarketplaceRegistry } from "../../helpers/ports/in-memory-marketplace-registry.js";
import { OverwritePrompter } from "../../helpers/ports/scripted-prompter.js";

function makeReleaseResolver(isPublic: boolean): LatestReleaseResolver {
  return {
    resolveLatest: vi.fn().mockResolvedValue(null),
    listRootReleases: vi.fn().mockResolvedValue([]),
    isRepoPublic: vi.fn().mockResolvedValue(isPublic),
  };
}

// Real values, not empty objects: a no-op double still has to answer with what its
// contract promises, so a caller that starts reading the answer breaks here first.
const FRAMEWORK_MARKETPLACE = Marketplace.create({
  name: FRAMEWORK_MARKETPLACE_NAME,
  source: { kind: "local", path: "/framework" },
  scope: "project",
  addedAt: "2026-08-20T00:00:00.000Z",
});

function makeNoOpPluginPick(): PluginPick {
  return {
    execute: vi.fn().mockResolvedValue({ marketplace: FRAMEWORK_MARKETPLACE, installed: [] }),
  };
}

function makeNoOpPluginInstallFromMarketplace(): PluginInstallFromMarketplace {
  return {
    execute: vi.fn().mockResolvedValue({
      marketplace: FRAMEWORK_MARKETPLACE,
      entry: {
        name: "aidd-context",
        source: { kind: "local", path: "/framework/plugins/aidd-context" },
        recommended: false,
        strict: false,
      },
    }),
  };
}

function makeNoOpResolveMarketplace(): ResolveMarketplace {
  return {
    execute: vi
      .fn()
      .mockResolvedValue({ marketplace: FRAMEWORK_MARKETPLACE, localPath: "", catalog: null }),
  };
}

function makeNoOpRegisterFramework(): MarketplaceRegisterFramework {
  return { execute: vi.fn().mockResolvedValue({ registered: false }) };
}

function makeNoOpRefresh(): MarketplaceRefresh {
  return { execute: vi.fn().mockResolvedValue({ results: [], failedCount: 0 }) };
}

function makeNoOpSyncSettings(): MarketplaceSyncSettings {
  return { execute: vi.fn().mockResolvedValue({ updatedTools: [] }) };
}

function makeTokenProvider(token: string | null): TokenProvider {
  return { resolve: vi.fn().mockResolvedValue(token) };
}

const PROJECT_ROOT = "/test-project";

async function buildSetupUseCase(tokenProvider: TokenProvider, isRepoPublic = false) {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  const prompter = new OverwritePrompter();
  const setupMarketplaceSourceUseCase = new SetupMarketplaceSourceUseCase(
    prompter,
    makeReleaseResolver(true)
  );
  const setupToolsUseCase = new SetupToolsUseCase(
    deps.manifestRepo,
    deps.installRuntimeConfigUseCase,
    deps.installIdeConfigUseCase
  );
  const setupPluginsPromptUseCase = new SetupPluginsPromptUseCase(
    makeNoOpPluginPick(),
    makeNoOpPluginInstallFromMarketplace(),
    new InMemoryMarketplaceRegistry(),
    makeNoOpResolveMarketplace()
  );
  return new SetupUseCase(
    deps.fs,
    deps.manifestRepo,
    setupMarketplaceSourceUseCase,
    makeNoOpRegisterFramework(),
    makeNoOpRefresh(),
    makeNoOpSyncSettings(),
    setupToolsUseCase,
    setupPluginsPromptUseCase,
    deps.currentVersionProvider,
    tokenProvider,
    undefined,
    undefined,
    makeReleaseResolver(isRepoPublic)
  );
}

describe("SetupUseCase — auth guard for remote source", () => {
  it("throws CatalogFetchAuthError when source is remote, no token, and repo is private", async () => {
    const useCase = await buildSetupUseCase(makeTokenProvider(null), false);

    const flow = new SetupFlow({
      projectRoot: PROJECT_ROOT,
      source: MarketplaceSourceMode.remote(),
      interactive: false,
    });

    await expect(useCase.execute(flow)).rejects.toThrow(CatalogFetchAuthError);
  });

  it("proceeds when source is remote, no token, but repo is public", async () => {
    const useCase = await buildSetupUseCase(makeTokenProvider(null), true);

    const flow = new SetupFlow({
      projectRoot: PROJECT_ROOT,
      source: MarketplaceSourceMode.remote(),
      interactive: false,
    });

    await expect(useCase.execute(flow)).resolves.toBeDefined();
  });

  it("proceeds without error when source is remote and a token is present", async () => {
    const useCase = await buildSetupUseCase(makeTokenProvider("ghp_valid-token"));

    const flow = new SetupFlow({
      projectRoot: PROJECT_ROOT,
      source: MarketplaceSourceMode.remote(),
      interactive: false,
    });

    await expect(useCase.execute(flow)).resolves.toBeDefined();
  });

  it("proceeds without error when source is local (no token required)", async () => {
    const useCase = await buildSetupUseCase(makeTokenProvider(null));

    const flow = new SetupFlow({
      projectRoot: PROJECT_ROOT,
      source: MarketplaceSourceMode.local("/some/path"),
      interactive: false,
    });

    await expect(useCase.execute(flow)).resolves.toBeDefined();
  });
});
