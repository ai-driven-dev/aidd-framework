/**
 * `plugin remove` parity with `clean`'s own shared-ref guard (see
 * `clean-shared-ref-guard.integration.test.ts`): at a host that enables a plugin
 * machine-wide (no `NativeActivation.scopeArgs` — codex, copilot), removing a plugin
 * in one project must not disable it for another project on the same machine that
 * still references the shared source it came from.
 *
 * `PluginRemoveUseCase` never decrements `references.json` the way `clean` does — it
 * has no claim of its own to drop — so this project's own root is still in the list
 * `listAllReferencingProjects` returns and must be subtracted before counting "other"
 * projects. Forgetting that subtraction is the regression the second test below
 * catches: a project holding the *only* reference would read itself back as another
 * project and wrongly leave its own ref enabled.
 */
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

function seedManifest(): Manifest {
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
      marketplace: FRAMEWORK_MARKETPLACE_NAME,
    })
  );
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
  // This project's own directory exists too, exactly like `clean`'s own guard test —
  // `listAllReferencingProjects` filters by `fs.fileExists`.
  fs.setFile(`${PROJECT_ROOT}/marker`, "");
  for (const root of roots) fs.setFile(`${root}/marker`, "");
}

function buildUseCase(
  fs: InMemoryFileAdapter,
  activator: FakeNativePluginActivator,
  logger: CapturingLogger
): {
  removeUseCase: PluginRemoveUseCase;
  manifestRepo: InMemoryManifestRepository;
} {
  const manifestRepo = new InMemoryManifestRepository(seedManifest(), PROJECT_ROOT);
  const userSourceReferences = new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR);
  const removeUseCase = new PluginRemoveUseCase(
    fs,
    manifestRepo,
    logger,
    new Map([["codex", activator]]),
    new Map(),
    userSourceReferences,
    seedSharedMarketplaceRegistry()
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
    // N1 (lot 8 review): this test's own name promised "names the other project",
    // but nothing ever inspected the logger it built — asserted here the same way
    // `clean`'s own equivalent guard test does.
    expect(
      logger.warnMessages.some((m) => m.includes("left enabled") && m.includes(OTHER_PROJECT))
    ).toBe(true);
  });

  it("still uninstalls codex's ref when no other project references the shared source", async () => {
    // The regression this test catches: forgetting to subtract this project's own
    // root from `listAllReferencingProjects` would read it back as "another project"
    // (since `plugin remove` never drops its own claim) and wrongly guard this ref
    // even though nobody else references the shared source.
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
});
