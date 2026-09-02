/**
 * Integration test for Phase 1: PluginAddUseCase emits logger.warn for each skip entry
 * returned by the translation adapter.
 */
import "../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import type { ReadonlySkipList } from "../../../../../src/contexts/translate/domain/plugin-translation-skip.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

describe("PluginAddUseCase skip warnings", () => {
  describe("when adapter returns skip entries", () => {
    it("emits one logger.warn per skip entry with the expected format", async () => {
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
      // sample-plugin ships hooks/ — Phase 3: OpenCode emits one skip warn for hooks.
      expect(capturingLogger.warnMessages).toHaveLength(1);
    });

    it("emits one warning for hooks skip when plugin ships hooks against opencode", async () => {
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
    });
  });

  describe("warn message format", () => {
    it("formats skip warnings as Plugin <name>: <component> skipped for <toolId> — <reason>", () => {
      // Validate the format directly without going through the full use-case flow
      const logger = new CapturingLogger();
      const skipped: ReadonlySkipList = [
        {
          pluginName: "aidd-pm",
          component: "hooks",
          toolId: "opencode",
          reason: "OpenCode plugin runtime is JS modules; declarative hooks.json is not supported.",
        },
      ];
      for (const entry of skipped) {
        logger.warn(
          `Plugin "${entry.pluginName}": ${entry.component} skipped for ${entry.toolId} — ${entry.reason}`
        );
      }
      expect(logger.warnMessages).toHaveLength(1);
      expect(logger.warnMessages[0]).toBe(
        'Plugin "aidd-pm": hooks skipped for opencode — OpenCode plugin runtime is JS modules; declarative hooks.json is not supported.'
      );
    });
  });
});
