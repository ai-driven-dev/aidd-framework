import { describe, expect, it, vi } from "vitest";
import type { MarketplaceRefresh } from "../../../../../src/contexts/distribution/application/marketplace-refresh-use-case.js";
import type { MarketplaceRegisterFramework } from "../../../../../src/contexts/distribution/application/marketplace-register-framework-use-case.js";
import { MarketplaceSourceMode } from "../../../../../src/contexts/distribution/domain/marketplace-source-mode.js";
import { SetupMarketplaceSourceUseCase } from "../../../../../src/contexts/framework/application/setup/setup-marketplace-source-use-case.js";
import { SetupMarketplaceRegistrationUseCase } from "../../../../../src/contexts/framework/application/shared/setup-marketplace-registration-use-case.js";
import type { UserSourceReferences } from "../../../../../src/contexts/framework/domain/ports/user-source-references.js";
import { SetupFlow } from "../../../../../src/contexts/framework/domain/setup-flow.js";
import { UserSourceReferencesAdapter } from "../../../../../src/contexts/framework/infrastructure/user-source-references-adapter.js";
import { CatalogFetchAuthError } from "../../../../../src/kernel/errors.js";
import type { TokenProvider } from "../../../../../src/runtime/auth/ports/token-provider.js";
import type { LatestReleaseResolver } from "../../../../../src/runtime/self-update/latest-release-resolver.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { FakeCurrentVersion } from "../../../../helpers/ports/fake-current-version.js";
import { InMemoryEnvironment } from "../../../../helpers/ports/in-memory-environment.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { KeepPrompter } from "../../../../helpers/ports/scripted-prompter.js";

const PROJECT_ROOT = "/test-project";
const SKIP_SWITCH = "AIDD_SKIP_MARKETPLACE_REFRESH";

function makeNoOpLatestResolver(isRepoPublic = true): LatestReleaseResolver {
  return {
    resolveLatest: vi.fn().mockResolvedValue(null),
    listRootReleases: vi.fn().mockResolvedValue([]),
    isRepoPublic: vi.fn().mockResolvedValue(isRepoPublic),
  };
}

function makeRegisterFramework(): MarketplaceRegisterFramework {
  return { execute: vi.fn().mockResolvedValue({ registered: true, scope: "user" }) };
}

interface Collaborators {
  tokenProvider?: TokenProvider;
  releaseResolver?: LatestReleaseResolver;
  userSourceReferences?: UserSourceReferences;
}

function makeUseCase(
  environment: InMemoryEnvironment,
  collaborators: Collaborators = {}
): {
  useCase: SetupMarketplaceRegistrationUseCase;
  refresh: MarketplaceRefresh;
  register: MarketplaceRegisterFramework;
} {
  const refresh: MarketplaceRefresh = {
    execute: vi.fn().mockResolvedValue({ results: [], failedCount: 0 }),
  };
  const register = makeRegisterFramework();
  const useCase = new SetupMarketplaceRegistrationUseCase(
    new InMemoryFileAdapter(),
    new SetupMarketplaceSourceUseCase(new KeepPrompter(), makeNoOpLatestResolver()),
    register,
    refresh,
    new FakeCurrentVersion(),
    new CapturingLogger(),
    environment,
    collaborators.tokenProvider,
    collaborators.releaseResolver,
    collaborators.userSourceReferences
  );
  return { useCase, refresh, register };
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

  describe("remote auth guard", () => {
    it("refuses a private remote source when no token can be resolved", async () => {
      const { useCase } = makeUseCase(new InMemoryEnvironment(), {
        tokenProvider: { resolve: async () => null },
        releaseResolver: makeNoOpLatestResolver(false),
      });
      const flow = new SetupFlow({ projectRoot: PROJECT_ROOT });

      const attempt = useCase.registerIfPresent(flow, MarketplaceSourceMode.remote("owner/repo"));

      await expect(attempt).rejects.toThrow(CatalogFetchAuthError);
      await expect(attempt).rejects.toThrow(
        'Authentication required to fetch catalog from "https://github.com/owner/repo". Run `aidd auth login` first or use `--source local --path <dir>`.'
      );
    });
  });

  describe("registration options", () => {
    it("registers a local source at the project root, forcing the registration", async () => {
      const { useCase, register } = makeUseCase(new InMemoryEnvironment());
      const flow = new SetupFlow({ projectRoot: PROJECT_ROOT });

      await useCase.registerIfPresent(flow, MarketplaceSourceMode.local("/framework-source"));

      expect(register.execute).toHaveBeenCalledWith({
        projectRoot: PROJECT_ROOT,
        pluginSource: { kind: "local", path: "/framework-source" },
        force: true,
      });
    });

    it("registers a remote source by repository and ref", async () => {
      const { useCase, register } = makeUseCase(new InMemoryEnvironment());
      const flow = new SetupFlow({ projectRoot: PROJECT_ROOT });

      await useCase.registerIfPresent(flow, MarketplaceSourceMode.remote("owner/repo", "v1.0.0"));

      expect(register.execute).toHaveBeenCalledWith({
        projectRoot: PROJECT_ROOT,
        pluginSource: { kind: "github", repo: "owner/repo", ref: "v1.0.0" },
        force: true,
      });
    });
  });

  describe("shared source reference", () => {
    it("records this project's claim on the shared source for a project-scope setup", async () => {
      const userSourceReferences = new UserSourceReferencesAdapter(
        new InMemoryFileAdapter({ [`${PROJECT_ROOT}/.aidd/manifest.json`]: "{}" }),
        () => "/user-config"
      );
      const { useCase } = makeUseCase(new InMemoryEnvironment(), { userSourceReferences });
      const flow = new SetupFlow({ projectRoot: PROJECT_ROOT });

      await useCase.registerIfPresent(flow, MarketplaceSourceMode.local("/framework-source"));

      expect(await userSourceReferences.listAllReferencingProjects()).toStrictEqual([PROJECT_ROOT]);
    });
  });
});
