/**
 * Phase 3 — OpenCode hooks skip: installing a plugin with hooks/ against OpenCode
 * must emit no hooks files and exactly one logger.warn with the expected message.
 */
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../../src/application/use-cases/plugin/plugin-add-use-case.js";
import { OPENCODE_HOOKS_SKIP_REASON } from "../../../../src/domain/models/plugin-translation-skip.js";
import { PluginDistributionReaderAdapter } from "../../../../src/infrastructure/adapters/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { fakeEnsureBuiltMarketplace } from "../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";
const PLUGIN_NAME = "sample-plugin";

describe("PluginAddUseCase OpenCode hooks skip (Phase 3)", () => {
  it("writes no hooks/ files to the project when plugin has hooks", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "opencode");
    await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
    const capturingLogger = new CapturingLogger();
    const registry = new InMemoryMarketplaceRegistry();
    const useCase = new PluginAddUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.pluginFetcher,
      new PluginDistributionReaderAdapter(deps.fs),
      deps.hasher,
      capturingLogger,
      registry,
      fakeEnsureBuiltMarketplace()
    );

    await useCase.execute({
      source: { kind: "local", path: PLUGIN_FIXTURE },
      toolIds: ["opencode"],
      projectRoot: PROJECT_ROOT,
      interactive: false,
    });

    const writtenPaths = deps.fs.listUnder(PROJECT_ROOT);
    const hooksFiles = writtenPaths.filter((p) => p.includes("hooks"));
    expect(hooksFiles).toHaveLength(0);
  });

  it("emits exactly one logger.warn for hooks skip", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "opencode");
    await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
    const capturingLogger = new CapturingLogger();
    const registry = new InMemoryMarketplaceRegistry();
    const useCase = new PluginAddUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.pluginFetcher,
      new PluginDistributionReaderAdapter(deps.fs),
      deps.hasher,
      capturingLogger,
      registry,
      fakeEnsureBuiltMarketplace()
    );

    await useCase.execute({
      source: { kind: "local", path: PLUGIN_FIXTURE },
      toolIds: ["opencode"],
      projectRoot: PROJECT_ROOT,
      interactive: false,
    });

    expect(capturingLogger.warnMessages).toHaveLength(1);
    expect(capturingLogger.warnMessages[0]).toBe(
      `Plugin "${PLUGIN_NAME}": hooks skipped for opencode — ${OPENCODE_HOOKS_SKIP_REASON}`
    );
  });
});
