/**
 * Phase 7 — OpenCode hooks install: installing a plugin with hooks/ against OpenCode
 * delivers the module its loader scans for, instead of skipping the component.
 * Renamed from plugin-add-opencode-hooks-skip.integration.test.ts (Phase 3), whose
 * premise this phase reverses — see aidd_docs/tasks/2026_08/2026_08_22_telemetry-every-tool/
 * measurements.md, Phase 7.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../../src/application/use-cases/plugin/plugin-add-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../../src/infrastructure/adapters/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { fakeEnsureBuiltMarketplace } from "../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

async function installSamplePlugin() {
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
  return { deps, capturingLogger };
}

describe("PluginAddUseCase OpenCode hooks install (Phase 7)", () => {
  it("writes every hooks/ script but the manifest under .opencode/plugin/", async () => {
    const { deps } = await installSamplePlugin();

    const writtenPaths = deps.fs.listUnder(PROJECT_ROOT);
    expect(writtenPaths).toContain(join(PROJECT_ROOT, ".opencode", "plugin", "update_memory.js"));
    expect(writtenPaths).not.toContain(join(PROJECT_ROOT, ".opencode", "plugin", "hooks.json"));
  });

  it("emits no logger.warn — hooks are delivered, not skipped", async () => {
    const { capturingLogger } = await installSamplePlugin();

    expect(capturingLogger.warnMessages).toEqual([]);
  });
});
