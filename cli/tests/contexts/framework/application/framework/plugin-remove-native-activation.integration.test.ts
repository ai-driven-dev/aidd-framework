/**
 * Removal undoing native activation: `claude`, `codex`, and `copilot` only load a
 * plugin once their own CLI has registered it in a user-global registry
 * (`installed_plugins.json`, `config.toml`, `~/.copilot/config.json`). Install drives
 * that CLI via `NativePluginActivator.enablePlugin` (see marketplace-sync-settings-use-case
 * and deps.ts's `nativePluginActivators` map). Before this test, `PluginRemoveUseCase`
 * had no reference to that map at all — it deleted local files and updated AIDD's own
 * manifest, but the plugin stayed enabled in every host registry install wrote to. This
 * file proves the removal counterpart: `uninstallPlugin` is called with the same
 * `<plugin>@<marketplace>` ref install used, and every unreachable-host case still
 * completes the removal while naming what it could not clean up.
 */
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { describe, expect, it } from "vitest";
import { ModeAMarketplaceTranslator } from "../../../../../src/contexts/framework/application/framework/translator/mode-a-marketplace-translator.js";
import { PluginRemoveUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-remove-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";

const PROJECT_ROOT = "/test-project";
const MARKETPLACE_NAME = "aidd-framework";
const PLUGIN_NAME = "aidd-telemetry";
const REF = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

function buildDist(): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: PLUGIN_NAME, version: "1.0.0" },
    format: "claude",
    files: [{ relativePath: "commands/hello.md", content: "# Hello" }],
    components: {
      commands: [{ relativePath: "commands/hello.md", content: "# Hello" }],
      agents: [],
      rules: [],
      skills: [],
      hooks: [],
      mcp: [],
    },
  });
}

async function installViaModeA(manifest: Manifest): Promise<void> {
  await new ModeAMarketplaceTranslator().addPlugin(
    buildDist(),
    "claude",
    { kind: "local", path: "/plugin-source" },
    PROJECT_ROOT,
    manifest,
    MARKETPLACE_NAME
  );
}

function buildRemoveUseCase(
  activator: FakeNativePluginActivator,
  logger: CapturingLogger
): { removeUseCase: PluginRemoveUseCase; manifestRepo: InMemoryManifestRepository } {
  const fs = new InMemoryFileAdapter();
  const manifestRepo = new InMemoryManifestRepository();
  const removeUseCase = new PluginRemoveUseCase(
    fs,
    manifestRepo,
    logger,
    new Map([["claude", activator]])
  );
  return { removeUseCase, manifestRepo };
}

describe("PluginRemoveUseCase undoes native activation", () => {
  it("uninstalls via the host CLI using the same <plugin>@<marketplace> ref install used", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();
    const { removeUseCase, manifestRepo } = buildRemoveUseCase(activator, logger);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    await installViaModeA(manifest);
    await manifestRepo.save(manifest);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).toEqual([REF]);
    expect(logger.warnMessages).toEqual([]);
  });

  it("warns naming the host and leaves the removal complete when the CLI is not on PATH", async () => {
    const activator = new FakeNativePluginActivator({ available: false });
    const logger = new CapturingLogger();
    const { removeUseCase, manifestRepo } = buildRemoveUseCase(activator, logger);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    await installViaModeA(manifest);
    await manifestRepo.save(manifest);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).toEqual([]);
    expect(logger.warnMessages).toHaveLength(1);
    expect(logger.warnMessages[0]).toContain("claude");
    expect(logger.warnMessages[0]).toContain(REF);
    const loaded = await manifestRepo.load();
    expect(loaded?.getPlugins("claude").some((p) => p.name === PLUGIN_NAME)).toBe(false);
  });

  it("warns naming the host and message when the host CLI reports the plugin already absent", async () => {
    const activator = new FakeNativePluginActivator({
      available: true,
      failOnUninstall: [REF],
    });
    const logger = new CapturingLogger();
    const { removeUseCase, manifestRepo } = buildRemoveUseCase(activator, logger);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    await installViaModeA(manifest);
    await manifestRepo.save(manifest);

    await expect(
      removeUseCase.execute({
        pluginName: PLUGIN_NAME,
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
      })
    ).resolves.not.toThrow();

    expect(logger.warnMessages).toHaveLength(1);
    expect(logger.warnMessages[0]).toContain("claude");
    expect(logger.warnMessages[0]).toContain(REF);
  });

  it("never calls the host CLI for a plugin installed without a recorded marketplace", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();
    const { removeUseCase, manifestRepo } = buildRemoveUseCase(activator, logger);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    await new ModeAMarketplaceTranslator().addPlugin(
      buildDist(),
      "claude",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined
    );
    await manifestRepo.save(manifest);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).toEqual([]);
    expect(logger.warnMessages).toEqual([]);
  });
});
