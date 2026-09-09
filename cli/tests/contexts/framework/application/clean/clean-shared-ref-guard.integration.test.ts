/** At a host that enables a plugin machine-wide (no `NativeActivation.scopeArgs` — codex,
 * copilot), a ref is left enabled while another project still references its shared source. */
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { describe, expect, it } from "vitest";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  Marketplace,
} from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { CleanUseCase } from "../../../../../src/contexts/framework/application/clean-use-case.js";
import { GitignoreUseCase } from "../../../../../src/contexts/framework/application/gitignore-use-case.js";
import type { NativeMarketplaceRegistration } from "../../../../../src/contexts/framework/domain/manifest/native-registrations.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { UserSourceReferencesAdapter } from "../../../../../src/contexts/framework/infrastructure/user-source-references-adapter.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const OTHER_PROJECT = "/other-project";
const USER_CONFIG_DIR = "/fake-home/.config/aidd";

function seedManifest(
  toolId: "codex" | "claude",
  marketplaces: readonly NativeMarketplaceRegistration[],
  pluginRefs: readonly string[]
): Manifest {
  const manifest = Manifest.create();
  manifest.addTool(toolId, "1.0.0", []);
  manifest.setNativeRegistrations(toolId, {
    binary: toolId,
    marketplaces: [...marketplaces],
    pluginRefs: [...pluginRefs],
  });
  return manifest;
}

function seedSharedMarketplaceRegistry(): InMemoryMarketplaceRegistry {
  const registry = new InMemoryMarketplaceRegistry();
  registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: FRAMEWORK_MARKETPLACE_NAME,
      source: { kind: "local", path: "/some/built/path" },
      scope: "user",
      addedAt: "2026-01-01T00:00:00.000Z",
    })
  );
  return registry;
}

function seedReferences(fs: InMemoryFileAdapter, roots: readonly string[]): void {
  fs.setFile(
    `${USER_CONFIG_DIR}/references.json`,
    JSON.stringify({ "1.0.0": [PROJECT_ROOT, ...roots] })
  );
  // `listAllReferencingProjects` filters by `fs.fileExists(root)`, so every root seeded here
  // needs a marker of its own or it reads back as no project at all.
  fs.setFile(`${PROJECT_ROOT}/marker`, "");
  for (const root of roots) fs.setFile(`${root}/marker`, "");
}

function buildUseCase(deps: {
  fs: InMemoryFileAdapter;
  manifest: Manifest;
  activator: FakeNativePluginActivator;
  binary: string;
  logger: CapturingLogger;
  aiddMarketplaceRegistry: InMemoryMarketplaceRegistry;
}): CleanUseCase {
  const manifestRepo = new InMemoryManifestRepository(deps.manifest, PROJECT_ROOT);
  const userSourceReferences = new UserSourceReferencesAdapter(deps.fs, () => USER_CONFIG_DIR);
  return new CleanUseCase(
    deps.fs,
    manifestRepo,
    deps.logger,
    new GitignoreUseCase(deps.fs),
    new Map([[deps.binary, deps.activator]]),
    deps.aiddMarketplaceRegistry,
    undefined,
    new Map(),
    undefined,
    userSourceReferences,
    new Map()
  );
}

describe("clean guards a ref another project on this machine still needs", () => {
  it("keeps codex's ref enabled and names the other project still referencing the shared source", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    seedReferences(fs, [OTHER_PROJECT]);
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();

    const useCase = buildUseCase({
      fs,
      manifest: seedManifest(
        "codex",
        [{ alias: "aidd-framework", hostName: "aidd-framework" }],
        ["aidd-vcs@aidd-framework"]
      ),
      activator,
      binary: "codex",
      logger,
      aiddMarketplaceRegistry: seedSharedMarketplaceRegistry(),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(activator.uninstalledPlugins).not.toContain("aidd-vcs@aidd-framework");
    expect(
      logger.warnMessages.some((m) => m.includes("left enabled") && m.includes(OTHER_PROJECT))
    ).toBe(true);
  });

  it("disables codex's ref once this project holds the last reference to the shared source", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    seedReferences(fs, []);
    const activator = new FakeNativePluginActivator({ available: true });

    const useCase = buildUseCase({
      fs,
      manifest: seedManifest(
        "codex",
        [{ alias: "aidd-framework", hostName: "aidd-framework" }],
        ["aidd-vcs@aidd-framework"]
      ),
      activator,
      binary: "codex",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedSharedMarketplaceRegistry(),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(activator.uninstalledPlugins).toContain("aidd-vcs@aidd-framework");
  });

  it("still disables claude's ref even with another project referencing the shared source", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    seedReferences(fs, [OTHER_PROJECT]);
    const activator = new FakeNativePluginActivator({ available: true });

    const useCase = buildUseCase({
      fs,
      manifest: seedManifest(
        "claude",
        [{ alias: "aidd-framework", hostName: "aidd-framework" }],
        ["aidd-vcs@aidd-framework"]
      ),
      activator,
      binary: "claude",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedSharedMarketplaceRegistry(),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(activator.uninstalledPlugins).toContain("aidd-vcs@aidd-framework");
  });

  it("still disables a ref from a marketplace that is not the shared source, in the same run", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    seedReferences(fs, [OTHER_PROJECT]);
    const activator = new FakeNativePluginActivator({ available: true });

    const useCase = buildUseCase({
      fs,
      manifest: seedManifest(
        "codex",
        [
          { alias: "aidd-framework", hostName: "aidd-framework" },
          { alias: "other-mkt", hostName: "other-mkt" },
        ],
        ["aidd-vcs@aidd-framework", "plugin-b@other-mkt"]
      ),
      activator,
      binary: "codex",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedSharedMarketplaceRegistry(),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(activator.uninstalledPlugins).not.toContain("aidd-vcs@aidd-framework");
    expect(activator.uninstalledPlugins).toContain("plugin-b@other-mkt");
  });

  it("still disables a ref from another marketplace when that marketplace is recorded before the shared source", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    seedReferences(fs, [OTHER_PROJECT]);
    const activator = new FakeNativePluginActivator({ available: true });

    const useCase = buildUseCase({
      fs,
      manifest: seedManifest(
        "codex",
        [
          { alias: "other-mkt", hostName: "other-mkt" },
          { alias: "aidd-framework", hostName: "aidd-framework" },
        ],
        ["plugin-b@other-mkt", "aidd-vcs@aidd-framework"]
      ),
      activator,
      binary: "codex",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedSharedMarketplaceRegistry(),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(activator.uninstalledPlugins).toStrictEqual(["plugin-b@other-mkt"]);
  });

  it("disables codex's ref when no claim was ever recorded for this project, and no other project references it either", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    // No references.json at all: no claim of this project's own to drop, and nothing else
    // referencing the source to guard on either.
    const activator = new FakeNativePluginActivator({ available: true });

    const useCase = buildUseCase({
      fs,
      manifest: seedManifest(
        "codex",
        [{ alias: "aidd-framework", hostName: "aidd-framework" }],
        ["aidd-vcs@aidd-framework"]
      ),
      activator,
      binary: "codex",
      logger: new CapturingLogger(),
      aiddMarketplaceRegistry: seedSharedMarketplaceRegistry(),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(activator.uninstalledPlugins).toContain("aidd-vcs@aidd-framework");
  });

  // "This project's own claim was never recorded" and "no other project references it" are
  // different facts: only `OTHER_PROJECT` is named here, and its live claim still guards.
  it("keeps codex's ref enabled when this project's own claim was never recorded but another project's still is", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    fs.setFile(`${USER_CONFIG_DIR}/references.json`, JSON.stringify({ "1.0.0": [OTHER_PROJECT] }));
    fs.setFile(`${OTHER_PROJECT}/marker`, "");
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();

    const useCase = buildUseCase({
      fs,
      manifest: seedManifest(
        "codex",
        [{ alias: "aidd-framework", hostName: "aidd-framework" }],
        ["aidd-vcs@aidd-framework"]
      ),
      activator,
      binary: "codex",
      logger,
      aiddMarketplaceRegistry: seedSharedMarketplaceRegistry(),
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(activator.uninstalledPlugins).not.toContain("aidd-vcs@aidd-framework");
    expect(
      logger.warnMessages.some((m) => m.includes("left enabled") && m.includes(OTHER_PROJECT))
    ).toBe(true);
  });
});
