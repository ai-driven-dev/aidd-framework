import { describe, expect, it, vi } from "vitest";
import type { MarketplaceRefresh } from "../../../../../src/contexts/distribution/application/marketplace-refresh-use-case.js";
import type { MarketplaceRegisterFramework } from "../../../../../src/contexts/distribution/application/marketplace-register-framework-use-case.js";
import { MarketplaceSourceMode } from "../../../../../src/contexts/distribution/domain/marketplace-source-mode.js";
import { SetupMarketplaceSourceUseCase } from "../../../../../src/contexts/framework/application/setup/setup-marketplace-source-use-case.js";
import { SetupMarketplaceRegistrationUseCase } from "../../../../../src/contexts/framework/application/shared/setup-marketplace-registration-use-case.js";
import { SetupFlow } from "../../../../../src/contexts/framework/domain/setup-flow.js";
import type { LatestReleaseResolver } from "../../../../../src/runtime/self-update/latest-release-resolver.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { FakeCurrentVersion } from "../../../../helpers/ports/fake-current-version.js";
import { InMemoryEnvironment } from "../../../../helpers/ports/in-memory-environment.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { KeepPrompter } from "../../../../helpers/ports/scripted-prompter.js";

const PROJECT_ROOT = "/test-project";
const SKIP_SWITCH = "AIDD_SKIP_MARKETPLACE_REFRESH";

function makeNoOpLatestResolver(): LatestReleaseResolver {
  return {
    resolveLatest: vi.fn().mockResolvedValue(null),
    listRootReleases: vi.fn().mockResolvedValue([]),
    isRepoPublic: vi.fn().mockResolvedValue(true),
  };
}

function makeRegisterFramework(): MarketplaceRegisterFramework {
  return { execute: vi.fn().mockResolvedValue({ registered: true, scope: "user" }) };
}

function makeUseCase(environment: InMemoryEnvironment): {
  useCase: SetupMarketplaceRegistrationUseCase;
  refresh: MarketplaceRefresh;
} {
  const refresh: MarketplaceRefresh = {
    execute: vi.fn().mockResolvedValue({ results: [], failedCount: 0 }),
  };
  const useCase = new SetupMarketplaceRegistrationUseCase(
    new InMemoryFileAdapter(),
    new SetupMarketplaceSourceUseCase(new KeepPrompter(), makeNoOpLatestResolver()),
    makeRegisterFramework(),
    refresh,
    new FakeCurrentVersion(),
    new CapturingLogger(),
    environment
  );
  return { useCase, refresh };
}

async function register(environment: InMemoryEnvironment): Promise<MarketplaceRefresh> {
  const { useCase, refresh } = makeUseCase(environment);
  const flow = new SetupFlow({ projectRoot: PROJECT_ROOT });
  await useCase.registerIfPresent(flow, MarketplaceSourceMode.local("/framework-source"));
  return refresh;
}

describe("SetupMarketplaceRegistrationUseCase", () => {
  describe("catalog refresh", () => {
    it("refreshes the catalog when the environment carries no skip switch", async () => {
      const refresh = await register(new InMemoryEnvironment());

      expect(refresh.execute).toHaveBeenCalledWith({ projectRoot: PROJECT_ROOT });
    });

    it("skips the refresh when the environment sets the skip switch to 1", async () => {
      const refresh = await register(new InMemoryEnvironment({ [SKIP_SWITCH]: "1" }));

      expect(refresh.execute).not.toHaveBeenCalled();
    });

    it("refreshes when the skip switch carries any other value", async () => {
      const refresh = await register(new InMemoryEnvironment({ [SKIP_SWITCH]: "0" }));

      expect(refresh.execute).toHaveBeenCalledOnce();
    });
  });
});
