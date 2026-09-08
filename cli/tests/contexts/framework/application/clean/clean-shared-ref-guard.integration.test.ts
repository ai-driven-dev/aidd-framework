/**
 * `clean` must not disable a plugin another project on this machine still needs.
 *
 * At a host that enables a plugin machine-wide (no `NativeActivation.scopeArgs` —
 * codex, copilot), one project's own `clean` used to uninstall every ref it recorded
 * regardless of who else still referenced the shared source it came from —
 * `undoMarketplaceRegistration` protects the marketplace *registration* itself, but
 * `uninstallPluginRef` ran for every ref unconditionally (see
 * `aidd_docs/memory/testing.md`'s "Three facts" gotcha, point 1). This guards the ref
 * instead: left enabled, and named, whenever another project still references the
 * shared source that ref came from.
 *
 * `listAllReferencingProjects` filters by `fs.fileExists(root)` — seeding
 * `/other-project` in `references.json` without ever writing a file under it would
 * read back as zero other projects, and every "guarded" test below would pass for the
 * wrong reason. Every test that needs `/other-project` to still exist writes a marker
 * file under it first.
 */
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
  // This project's own directory exists too — it is where `clean` is running from —
  // so a mutation that reads `listAllReferencingProjects` before this project's own
  // claim is dropped would see it as one more "other" project unless this marker
  // makes `fs.fileExists(PROJECT_ROOT)` true, exactly like a real filesystem.
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

  it("disables codex's ref when no claim was ever recorded for this project, and no other project references it either", async () => {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    // No references.json at all: `removeReference` finds nothing for this project,
    // and `listAllReferencingProjects()` reads back empty too — a claim genuinely
    // absent, and genuinely nothing else to guard on either.
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

  // S1 (lot 8 review): "this project's own claim was never recorded" must not
  // collapse into "no other project references it" — those are different facts.
  // `references.json` here names only `OTHER_PROJECT`, never `PROJECT_ROOT`, so
  // `removeReference` finds nothing of this project's own to drop, yet another
  // project's own live claim still guards the ref. Deleting the early return this
  // finding fixed (`if (removed === undefined) return undefined;`) makes this test
  // go red: the ref would be uninstalled instead of staying guarded.
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
