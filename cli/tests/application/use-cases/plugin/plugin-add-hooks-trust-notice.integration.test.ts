/**
 * A hook a native tool actually delivers is not a skip - it is a delivered component with
 * a precondition. Codex gates every hook behind a per-hook trust grant it can decline in
 * silence (#699); this proves PluginAddUseCase names that at install time, on the info
 * channel, and only for the tool that declares the gate.
 */
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/claude.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../../src/application/use-cases/plugin/plugin-add-use-case.js";
import { codex } from "../../../../src/domain/tools/ai/codex.js";
import { PluginDistributionReaderAdapter } from "../../../../src/infrastructure/adapters/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { fakeEnsureBuiltMarketplace } from "../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

async function installWithLogger(toolId: "codex" | "claude") {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  await initAndInstall(deps, PROJECT_ROOT, toolId);
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  const logger = new CapturingLogger();
  const useCase = new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    logger,
    new InMemoryMarketplaceRegistry(),
    fakeEnsureBuiltMarketplace()
  );
  await useCase.execute({
    source: { kind: "local", path: PLUGIN_FIXTURE },
    toolIds: [toolId],
    projectRoot: PROJECT_ROOT,
    interactive: false,
  });
  return logger;
}

describe("PluginAddUseCase hook trust notice", () => {
  it("names what Codex still requires, on the info channel, when the plugin delivers hooks", async () => {
    const logger = await installWithLogger("codex");

    expect(logger.infoMessages).toHaveLength(1);
    expect(logger.infoMessages[0]).toBe(
      `Plugin "sample-plugin" (codex): ${codex.capabilities.plugins.hooksTrustNotice}`
    );
    expect(logger.warnMessages).toEqual([]);
  });

  it("says nothing for a tool with no trust gate on its hooks", async () => {
    const logger = await installWithLogger("claude");

    expect(logger.infoMessages).toEqual([]);
  });
});
