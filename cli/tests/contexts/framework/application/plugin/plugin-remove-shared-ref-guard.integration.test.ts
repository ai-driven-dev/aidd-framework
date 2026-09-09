/** At a host that enables a plugin machine-wide (no `NativeActivation.scopeArgs`), removing
 * it in one project must not disable it for another still referencing the shared source. */
import "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { describe, expect, it } from "vitest";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  Marketplace,
} from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { PluginRemoveUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-remove-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
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
const PLUGIN_NAME = "aidd-vcs";
const REF = `${PLUGIN_NAME}@${FRAMEWORK_MARKETPLACE_NAME}`;

function seedManifest(marketplaceAlias: string = FRAMEWORK_MARKETPLACE_NAME): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("codex", "1.0.0", []);
  manifest.addPlugin(
    "codex",
    InstalledPlugin.fromJSON({
      name: PLUGIN_NAME,
      source: { kind: "local", path: "/plugin-source" },
      version: "1.0.0",
      strict: true,
      files: {},
      scope: "project",
      marketplace: marketplaceAlias,
    })
  );
  return manifest;
}

function seedSharedMarketplaceRegistry(
  marketplaceAlias: string = FRAMEWORK_MARKETPLACE_NAME
): InMemoryMarketplaceRegistry {
  const registry = new InMemoryMarketplaceRegistry();
  registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: marketplaceAlias,
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
  // This project's own directory exists too, exactly like `clean`'s own guard test —
  // `listAllReferencingProjects` filters by `fs.fileExists`.
  fs.setFile(`${PROJECT_ROOT}/marker`, "");
  for (const root of roots) fs.setFile(`${root}/marker`, "");
}

function buildUseCase(
  fs: InMemoryFileAdapter,
  activator: FakeNativePluginActivator,
  logger: CapturingLogger,
  manifest: Manifest = seedManifest(),
  marketplaceRegistry: InMemoryMarketplaceRegistry = seedSharedMarketplaceRegistry()
): {
  removeUseCase: PluginRemoveUseCase;
  manifestRepo: InMemoryManifestRepository;
} {
  const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
  const userSourceReferences = new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR);
  const removeUseCase = new PluginRemoveUseCase(
    fs,
    manifestRepo,
    logger,
    new Map([["codex", activator]]),
    new Map(),
    userSourceReferences,
    marketplaceRegistry
  );
  return { removeUseCase, manifestRepo };
}

describe("plugin remove guards a ref another project on this machine still needs", () => {
  it("leaves codex's ref enabled and names the other project still referencing the shared source", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    seedReferences(fs, [OTHER_PROJECT]);
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();
    const { removeUseCase } = buildUseCase(fs, activator, logger);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["codex"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).not.toContain(REF);
    expect(
      logger.warnMessages.some((m) => m.includes("left enabled") && m.includes(OTHER_PROJECT))
    ).toBe(true);
  });

  it("still uninstalls codex's ref when no other project references the shared source", async () => {
    // `plugin remove` never drops its own claim, so a project's own root must be subtracted
    // from `listAllReferencingProjects` or it reads itself back as another project.
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    seedReferences(fs, []);
    const activator = new FakeNativePluginActivator({ available: true });
    const { removeUseCase } = buildUseCase(fs, activator, new CapturingLogger());

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["codex"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).toContain(REF);
  });

  // `refAnotherProjectStillNeeds` matches the ref's suffix against `sharedSourceHostName`, so
  // a ref moved to `hostName` while that stays the alias silently stops guarding anything.
  it("guards by the host's own ref when this project's alias diverges from the catalog's declared name", async () => {
    // The alias is always the reserved `FRAMEWORK_MARKETPLACE_NAME`, which gates the guard;
    // the divergence under test is between it and what the catalog declares as `hostName`.
    const HOST_NAME = "upstream";
    const HOST_REF = `${PLUGIN_NAME}@${HOST_NAME}`;
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    seedReferences(fs, [OTHER_PROJECT]);
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();
    const manifest = seedManifest();
    manifest.setNativeRegistrations("codex", {
      binary: "codex",
      marketplaces: [{ alias: FRAMEWORK_MARKETPLACE_NAME, hostName: HOST_NAME }],
      pluginRefs: [],
    });
    const { removeUseCase } = buildUseCase(fs, activator, logger, manifest);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["codex"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).not.toContain(HOST_REF);
    expect(
      logger.warnMessages.some((m) => m.includes("left enabled") && m.includes(HOST_REF))
    ).toBe(true);
  });

  it("uninstalls by the alias ref and logs no warning when this tool has no native registrations at all", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    seedReferences(fs, []);
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();
    const { removeUseCase } = buildUseCase(fs, activator, logger);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["codex"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).toContain(REF);
    expect(logger.warnMessages).toEqual([]);
  });

  describe("a ref outside the shared source", () => {
    it("uninstalls a ref from a marketplace that is not the shared source, whatever other projects reference", async () => {
      const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
      seedReferences(fs, [OTHER_PROJECT]);
      const activator = new FakeNativePluginActivator({ available: true });
      const logger = new CapturingLogger();
      const registry = seedSharedMarketplaceRegistry();
      await registry.save(
        PROJECT_ROOT,
        Marketplace.create({
          name: "other-mkt",
          source: { kind: "local", path: "/other/built/path" },
          scope: "user",
          addedAt: "2026-01-01T00:00:00.000Z",
        })
      );
      const { removeUseCase } = buildUseCase(
        fs,
        activator,
        logger,
        seedManifest("other-mkt"),
        registry
      );

      await removeUseCase.execute({
        pluginName: PLUGIN_NAME,
        toolIds: ["codex"],
        projectRoot: PROJECT_ROOT,
      });

      expect(activator.uninstalledPlugins).toStrictEqual([`${PLUGIN_NAME}@other-mkt`]);
      expect(logger.warnMessages).toStrictEqual([]);
    });

    it("uninstalls a ref whose marketplace this project's registry no longer lists", async () => {
      const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
      seedReferences(fs, [OTHER_PROJECT]);
      const activator = new FakeNativePluginActivator({ available: true });
      const logger = new CapturingLogger();
      const { removeUseCase } = buildUseCase(fs, activator, logger, seedManifest("gone-mkt"));

      await removeUseCase.execute({
        pluginName: PLUGIN_NAME,
        toolIds: ["codex"],
        projectRoot: PROJECT_ROOT,
      });

      expect(activator.uninstalledPlugins).toStrictEqual([`${PLUGIN_NAME}@gone-mkt`]);
      expect(logger.warnMessages).toStrictEqual([]);
    });
  });

  describe("without one of the guard's two registries", () => {
    it("skips the guard when no references registry is wired, even for the shared source", async () => {
      const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
      seedReferences(fs, [OTHER_PROJECT]);
      const activator = new FakeNativePluginActivator({ available: true });
      const removeUseCase = new PluginRemoveUseCase(
        fs,
        new InMemoryManifestRepository(seedManifest(), PROJECT_ROOT),
        new CapturingLogger(),
        new Map([["codex", activator]]),
        new Map(),
        undefined,
        seedSharedMarketplaceRegistry()
      );

      await removeUseCase.execute({
        pluginName: PLUGIN_NAME,
        toolIds: ["codex"],
        projectRoot: PROJECT_ROOT,
      });

      expect(activator.uninstalledPlugins).toStrictEqual([REF]);
    });

    it("skips the guard when no marketplace registry is wired", async () => {
      const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
      seedReferences(fs, [OTHER_PROJECT]);
      const activator = new FakeNativePluginActivator({ available: true });
      const removeUseCase = new PluginRemoveUseCase(
        fs,
        new InMemoryManifestRepository(seedManifest(), PROJECT_ROOT),
        new CapturingLogger(),
        new Map([["codex", activator]]),
        new Map(),
        new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR)
      );

      await removeUseCase.execute({
        pluginName: PLUGIN_NAME,
        toolIds: ["codex"],
        projectRoot: PROJECT_ROOT,
      });

      expect(activator.uninstalledPlugins).toStrictEqual([REF]);
    });
  });
});
