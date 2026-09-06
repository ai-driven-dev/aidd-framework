/**
 * Phase 7 — OpenCode hooks install: installing a plugin with hooks/ against OpenCode
 * delivers the script, instead of skipping the component. Renamed from
 * plugin-add-opencode-hooks-skip.integration.test.ts (Phase 3), whose premise this
 * phase reverses — see aidd_docs/tasks/2026_08/2026_08_22_telemetry-every-tool/
 * measurements.md, Phase 7.
 *
 * Lot A (opencode-and-scope.md): the script no longer lands under .opencode/plugin/,
 * the directory OpenCode's own loader imports in-process — a plain hook script there
 * killed the host (process.exit, uncatchable). It is namespaced under
 * .opencode/hooks/<plugin>/ instead, the same shape .claude/hooks/<plugin>/ and
 * .cursor/hooks/<plugin>/ already use.
 */

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

    // deps.fs is the in-memory adapter, whose listUnder() returns its own "/"-normalised
    // keys regardless of host platform - a native `join` would answer with "\" on win32
    // and never match one of those keys.
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

// Lot B (opencode-and-scope.md): `plugin install`/`setup` reach OpenCode through
// ContentTranslator, never through FlatBuildStrategy (that one only runs for `translate`).
// Without flatHooksBridge wired into ContentTranslator too, a plugin installed this way
// carries a namespaced script nothing ever triggers — the exact gap `pnpm smoke` caught
// (".opencode/plugin/ missing" after `setup --plugins recommended`, aidd-context's own
// SessionStart hook installed with no bridge for it).
describe("PluginAddUseCase OpenCode event bridge (Lot B)", () => {
  it("generates .opencode/plugin/<plugin>-hooks.js for a plugin's mapped hook", async () => {
    const { deps } = await installSamplePlugin();

    const writtenPaths = deps.fs.listUnder(PROJECT_ROOT);
    expect(writtenPaths).toContain(
      posix.join(PROJECT_ROOT, ".opencode", "plugin", "sample-plugin-hooks.js")
    );
  });
});
