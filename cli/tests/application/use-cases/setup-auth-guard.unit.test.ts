import { describe, expect, it, vi } from "vitest";
import { SetupMarketplaceSourceUseCase } from "../../../src/application/use-cases/setup/setup-marketplace-source-use-case.js";
import { SetupPluginsPromptUseCase } from "../../../src/application/use-cases/setup/setup-plugins-prompt-use-case.js";
import { SetupToolsUseCase } from "../../../src/application/use-cases/setup/setup-tools-use-case.js";
import { SetupUseCase } from "../../../src/application/use-cases/setup-use-case.js";
import { MarketplaceSourceMode } from "../../../src/domain/models/marketplace-source-mode.js";
import { SetupFlow } from "../../../src/domain/models/setup-flow.js";
import type { TokenProvider } from "../../../src/domain/ports/token-provider.js";
import { CatalogFetchAuthError } from "../../../src/kernel/errors.js";
import { buildUnitDeps } from "../../helpers/ports/build-unit-deps.js";
import { OverwritePrompter } from "../../helpers/ports/scripted-prompter.js";

function makeNoOpLatestResolver() {
  return {
    resolveLatest: vi.fn().mockResolvedValue(null),
    listRootReleases: vi.fn().mockResolvedValue([]),
    isRepoPublic: vi.fn().mockResolvedValue(true),
  } as never;
}

function makeReleaseResolver(isPublic: boolean) {
  return {
    resolveLatest: vi.fn().mockResolvedValue(null),
    listRootReleases: vi.fn().mockResolvedValue([]),
    isRepoPublic: vi.fn().mockResolvedValue(isPublic),
  } as never;
}

function makeNoOp(value: unknown) {
  return { execute: vi.fn().mockResolvedValue(value) } as never;
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
    makeNoOpLatestResolver()
  );
  const setupToolsUseCase = new SetupToolsUseCase(
    deps.manifestRepo,
    deps.installRuntimeConfigUseCase,
    deps.installIdeConfigUseCase
  );
  const setupPluginsPromptUseCase = new SetupPluginsPromptUseCase(
    makeNoOp({ marketplace: {}, installed: [] }),
    makeNoOp({ marketplace: {}, entry: {} }),
    makeNoOp([]),
    makeNoOp({ marketplace: {}, localPath: "", catalog: null })
  );
  return new SetupUseCase(
    deps.fs,
    deps.manifestRepo,
    setupMarketplaceSourceUseCase,
    makeNoOp({ registered: false }),
    makeNoOp({ results: [], failedCount: 0 }),
    makeNoOp(undefined),
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
