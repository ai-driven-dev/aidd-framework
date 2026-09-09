// `claude`, `codex` and `copilot` only load a plugin once their own CLI has registered it, so
// removal must drive `uninstallPlugin` with the same `<plugin>@<marketplace>` ref install used.
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { describe, expect, it, vi } from "vitest";
import { ModeAMarketplaceTranslator } from "../../../../../src/contexts/framework/application/framework/translator/mode-a-marketplace-translator.js";
import { PluginRemoveUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-remove-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { FakeHostPluginRegistryReader } from "../../../../helpers/ports/fake-host-plugin-registry-reader.js";
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

  // A real `claude` binary registers at its own implicit `"user"` default whatever scope the
  // manifest records for the plugin's files, and refuses an uninstall aimed at another scope.
  it("falls back to the other scope when the manifest's own scope does not match what was actually registered", async () => {
    const activator = new FakeNativePluginActivator({
      available: true,
      installedAtScope: new Map([[REF, "user"]]),
    });
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
    expect(activator.uninstalledPluginScopes).toEqual(["project", "user"]);
    expect(logger.warnMessages).toEqual([]);
  });

  // The host call must address the host by `hostName`, read from this tool's own
  // `nativeRegistrations` — never by `plugin.marketplace`, a local alias a host never learns.
  it("uses the host's own name for the marketplace, read from this tool's own native registrations", async () => {
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
      "local"
    );
    manifest.setNativeRegistrations("claude", {
      binary: "claude",
      marketplaces: [{ alias: "local", hostName: "upstream" }],
      pluginRefs: [],
    });
    await manifestRepo.save(manifest);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).toEqual([`${PLUGIN_NAME}@upstream`]);
  });

  it("resolves the host's own registry by the hostName-keyed ref, not the alias", async () => {
    const hostRef = `${PLUGIN_NAME}@upstream`;
    const activator = new FakeNativePluginActivator({
      available: true,
      installedAtScope: new Map([[hostRef, "user"]]),
    });
    const logger = new CapturingLogger();
    const fs = new InMemoryFileAdapter();
    const manifestRepo = new InMemoryManifestRepository();
    const removeUseCase = new PluginRemoveUseCase(
      fs,
      manifestRepo,
      logger,
      new Map([["claude", activator]]),
      new Map([
        [
          "claude",
          new FakeHostPluginRegistryReader({
            location: "/registry",
            refs: new Map([[hostRef, { enabled: true, scope: "user" }]]),
          }),
        ],
      ])
    );
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    await new ModeAMarketplaceTranslator().addPlugin(
      buildDist(),
      "claude",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "local"
    );
    manifest.setNativeRegistrations("claude", {
      binary: "claude",
      marketplaces: [{ alias: "local", hostName: "upstream" }],
      pluginRefs: [],
    });
    await manifestRepo.save(manifest);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).toEqual([hostRef]);
    expect(activator.uninstalledPluginScopes).toEqual(["user"]);
  });

  it("warns naming the alias when this tool's own native registrations exist but name no entry for it", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();
    const { removeUseCase, manifestRepo } = buildRemoveUseCase(activator, logger);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    await installViaModeA(manifest);
    manifest.setNativeRegistrations("claude", {
      binary: "claude",
      marketplaces: [{ alias: "some-other-marketplace", hostName: "other" }],
      pluginRefs: [],
    });
    await manifestRepo.save(manifest);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).toEqual([REF]);
    expect(logger.warnMessages.some((m) => m.includes(MARKETPLACE_NAME))).toBe(true);
  });

  // Two reads, not three: `removeNativeActivation` resolves the host name and the warn gate
  // from one read, and `purgeCachedPlugin`'s own read is a separate decision made after it.
  it("reads this tool's own native registrations once per decision, not twice for the warn gate", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();
    const { removeUseCase, manifestRepo } = buildRemoveUseCase(activator, logger);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    await installViaModeA(manifest);
    manifest.setNativeRegistrations("claude", {
      binary: "claude",
      marketplaces: [{ alias: "some-other-marketplace", hostName: "other" }],
      pluginRefs: [],
    });
    await manifestRepo.save(manifest);
    const stored = await manifestRepo.load();
    if (stored === null) throw new Error("unreachable — just saved");
    const spy = vi.spyOn(stored, "getNativeRegistrations");

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("uninstalls at the scope the host's own registry names directly, one attempt", async () => {
    const activator = new FakeNativePluginActivator({
      available: true,
      installedAtScope: new Map([[REF, "user"]]),
    });
    const logger = new CapturingLogger();
    const fs = new InMemoryFileAdapter();
    const manifestRepo = new InMemoryManifestRepository();
    const removeUseCase = new PluginRemoveUseCase(
      fs,
      manifestRepo,
      logger,
      new Map([["claude", activator]]),
      new Map([
        [
          "claude",
          new FakeHostPluginRegistryReader({
            location: "/registry",
            refs: new Map([[REF, { enabled: true, scope: "user" }]]),
          }),
        ],
      ])
    );
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
    expect(activator.uninstalledPluginScopes).toEqual(["user"]);
  });

  it("logs nothing when this tool's own native registrations name the alias", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const logger = new CapturingLogger();
    const { removeUseCase, manifestRepo } = buildRemoveUseCase(activator, logger);
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    await installViaModeA(manifest);
    manifest.setNativeRegistrations("claude", {
      binary: "claude",
      marketplaces: [{ alias: MARKETPLACE_NAME, hostName: "upstream" }],
      pluginRefs: [],
    });
    await manifestRepo.save(manifest);

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(activator.uninstalledPlugins).toStrictEqual([`${PLUGIN_NAME}@upstream`]);
    expect(logger.warnMessages).toStrictEqual([]);
  });

  it("names the host, the ref and the host's answer when the host CLI refuses the uninstall", async () => {
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

    await removeUseCase.execute({
      pluginName: PLUGIN_NAME,
      toolIds: ["claude"],
      projectRoot: PROJECT_ROOT,
    });

    expect(logger.warnMessages).toStrictEqual([
      `claude plugin uninstall '${REF}' failed: plugin \`${REF}\` is not installed — an entry for it may remain in claude's own plugin registry.`,
    ]);
  });

  it("propagates a failure that is not the host CLI refusing", async () => {
    const activator = new FakeNativePluginActivator({ available: true, crashOnUninstall: true });
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
    ).rejects.toThrow("activator crashed uninstalling a plugin");
  });
});
