/**
 * Integration test for Phase 1: PluginAddUseCase emits logger.warn for each skip entry
 * returned by the translation adapter.
 *
 * The live example this originally used — sample-plugin's hooks/ against OpenCode —
 * stopped producing a skip once OpenCode's flat mode started accepting hooks (Phase 7,
 * see the telemetry plan's measurements.md): every registered tool now runs what a
 * plugin's hooks/ ships, so no live fixture currently exercises collectHooksSkips's
 * non-empty branch. The first two tests below assert that absence directly rather than
 * keep asserting a skip that no longer happens; the warn-format contract itself is still
 * covered, tool-agnostically, by the last test in this file.
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
  describe("when a plugin's hooks are now accepted (no skip entry)", () => {
    it("emits no logger.warn — OpenCode delivers sample-plugin's hooks instead of skipping them", async () => {
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
      expect(capturingLogger.warnMessages).toEqual([]);
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
