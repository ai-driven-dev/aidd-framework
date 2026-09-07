import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarketplaceRegisterFrameworkUseCase } from "../../../../src/contexts/distribution/application/marketplace-register-framework-use-case.js";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  Marketplace,
} from "../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceRegistryAdapter } from "../../../../src/contexts/distribution/infrastructure/marketplace-registry-adapter.js";

/**
 * The framework entry is machine-scope, so two projects on the same machine must
 * share one registration rather than each writing their own — measured against the
 * real `MarketplaceRegistryAdapter`, not the in-memory fake, because the fake's user
 * store is keyed per `projectRoot` and would hide exactly the sharing this proves.
 * `smoke-tools.sh`'s own shared-`$HOME`, per-project pattern is what this reproduces
 * at unit-test speed.
 */
describe("MarketplaceRegisterFrameworkUseCase — machine-scope registration", () => {
  let projectA: string;
  let projectB: string;
  let homeDir: string;
  let originalConfigDir: string | undefined;

  beforeEach(async () => {
    projectA = await mkdtemp(join(tmpdir(), "register-framework-project-a-"));
    projectB = await mkdtemp(join(tmpdir(), "register-framework-project-b-"));
    homeDir = await mkdtemp(join(tmpdir(), "register-framework-home-"));
    originalConfigDir = process.env.AIDD_USER_CONFIG_DIR;
    process.env.AIDD_USER_CONFIG_DIR = join(homeDir, ".config", "aidd");
  });

  afterEach(async () => {
    if (originalConfigDir === undefined) delete process.env.AIDD_USER_CONFIG_DIR;
    else process.env.AIDD_USER_CONFIG_DIR = originalConfigDir;
    await rm(projectA, { recursive: true, force: true });
    await rm(projectB, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  it("writes a single entry in userConfigDir()/marketplaces.json for two distinct projectRoots, with the same source", async () => {
    const registry = new MarketplaceRegistryAdapter();
    const useCase = new MarketplaceRegisterFrameworkUseCase(registry);

    const first = await useCase.execute({ projectRoot: projectA, frameworkPath: "/src/framework" });
    const second = await useCase.execute({
      projectRoot: projectB,
      frameworkPath: "/src/framework",
    });

    expect(first.registered).toBe(true);
    expect(second.registered).toBe(false);

    const userFile = join(homeDir, ".config", "aidd", "marketplaces.json");
    const raw = JSON.parse(await readFile(userFile, "utf-8"));
    expect(raw.marketplaces).toHaveLength(1);
    expect(raw.marketplaces[0].name).toBe(FRAMEWORK_MARKETPLACE_NAME);
    expect(raw.marketplaces[0].scope).toBe("user");
    expect(raw.marketplaces[0].source).toEqual({ kind: "local", path: "/src/framework" });

    // Neither project wrote its own project-scope registry at all.
    await expect(readFile(join(projectA, ".aidd", "marketplaces.json"), "utf-8")).rejects.toThrow();
    await expect(readFile(join(projectB, ".aidd", "marketplaces.json"), "utf-8")).rejects.toThrow();

    const listFromB = await registry.list(projectB);
    expect(listFromB).toHaveLength(1);
    expect(listFromB[0]?.scope).toBe("user");
  });

  // Bloquant 1: a project that already ran `setup` before the machine-scope move
  // holds a project-scope registry entry. `list()` puts a project entry first and
  // filters a user one of the same name out, so writing the migrated user-scope
  // entry alongside the stale project one — rather than retiring it — would leave
  // `list()` forever answering the pre-migration entry: the migration this lot exists
  // for would have no effect on the population it targets.
  it("migrates a pre-existing project-scope entry to the shared user-scope one on the next run, leaving a single entry", async () => {
    const registry = new MarketplaceRegistryAdapter();
    await registry.save(
      projectA,
      Marketplace.create({
        name: FRAMEWORK_MARKETPLACE_NAME,
        scope: "project",
        source: { kind: "local", path: "." },
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const useCase = new MarketplaceRegisterFrameworkUseCase(registry);

    const result = await useCase.execute({
      projectRoot: projectA,
      frameworkPath: "/src/framework",
    });

    expect(result.registered).toBe(true);
    const list = await registry.list(projectA);
    expect(list).toHaveLength(1);
    expect(list[0]?.scope).toBe("user");

    const projectFile = JSON.parse(
      await readFile(join(projectA, ".aidd", "marketplaces.json"), "utf-8")
    );
    expect(projectFile.marketplaces).toEqual([]);
  });
});
