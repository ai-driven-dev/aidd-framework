/** Installing a plugin carrying hooks/ against OpenCode delivers the script, namespaced under
 * .opencode/hooks/<plugin>/ like .claude/ and .cursor/ already are. Never .opencode/plugin/,
 * which OpenCode's own loader imports in-process, where a plain hook script kills the host. */

import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

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
  it("writes every hooks/ script but the manifest under .opencode/hooks/<plugin>/", async () => {
    const { deps } = await installSamplePlugin();

    // deps.fs is the in-memory adapter, whose listUnder() returns "/"-normalised keys whatever the
    // platform joined with, so a native `join` would answer "\\" on win32 and match none of them.
    const writtenPaths = deps.fs.listUnder(PROJECT_ROOT);
    expect(writtenPaths).toContain(
      posix.join(PROJECT_ROOT, ".opencode", "hooks", "sample-plugin", "update_memory.js")
    );
    expect(writtenPaths).not.toContain(
      posix.join(PROJECT_ROOT, ".opencode", "hooks", "sample-plugin", "hooks.json")
    );
    // Never under .opencode/plugin/ either: that is the directory OpenCode's own
    // loader imports in-process, and a plain hook script there kills the host.
    expect(writtenPaths).not.toContain(
      posix.join(PROJECT_ROOT, ".opencode", "plugin", "update_memory.js")
    );
  });

  it("emits no logger.warn — hooks are delivered, not skipped", async () => {
    const { capturingLogger } = await installSamplePlugin();

    expect(capturingLogger.warnMessages).toEqual([]);
  });
});

// `plugin install` and `setup` reach OpenCode through ContentTranslator, never through
// FlatBuildStrategy, so without flatHooksBridge there the namespaced script triggers nothing.
describe("PluginAddUseCase OpenCode event bridge (Lot B)", () => {
  it("generates .opencode/plugin/<plugin>-hooks.js for a plugin's mapped hook", async () => {
    const { deps } = await installSamplePlugin();

    const writtenPaths = deps.fs.listUnder(PROJECT_ROOT);
    expect(writtenPaths).toContain(
      posix.join(PROJECT_ROOT, ".opencode", "plugin", "sample-plugin-hooks.js")
    );
  });
});
