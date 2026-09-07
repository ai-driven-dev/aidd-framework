import { describe, expect, it } from "vitest";
import { MarketplaceRegisterFrameworkUseCase } from "../../../../src/contexts/distribution/application/marketplace-register-framework-use-case.js";
import { FRAMEWORK_MARKETPLACE_NAME } from "../../../../src/contexts/distribution/domain/marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";

describe("MarketplaceRegisterFrameworkUseCase", () => {
  it("registers using github source when pluginSource is github", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    const useCase = new MarketplaceRegisterFrameworkUseCase(registry);

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      pluginSource: { kind: "github", repo: "ai-driven-dev/framework" },
    });

    expect(result.registered).toBe(true);
    const list = await registry.list(PROJECT_ROOT);
    expect(list[0]?.name).toBe(FRAMEWORK_MARKETPLACE_NAME);
    // Machine scope: the framework entry is shared by every project on this machine,
    // never tied to the one that happened to run `setup` first.
    expect(list[0]?.scope).toBe("user");
    expect(list[0]?.source.kind).toBe("github");
    if (list[0]?.source.kind === "github") {
      expect(list[0]?.source.repo).toBe("ai-driven-dev/framework");
    }
  });

  it("defaults to local dot source when no pluginSource is supplied", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    const useCase = new MarketplaceRegisterFrameworkUseCase(registry);

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.registered).toBe(true);
    const list = await registry.list(PROJECT_ROOT);
    expect(list[0]?.source).toEqual({ kind: "local", path: "." });
  });

  it("is idempotent — does not duplicate when called twice", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    const useCase = new MarketplaceRegisterFrameworkUseCase(registry);

    const first = await useCase.execute({ projectRoot: PROJECT_ROOT });
    const second = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(first.registered).toBe(true);
    expect(second.registered).toBe(false);
    expect(await registry.list(PROJECT_ROOT)).toHaveLength(1);
  });
});
