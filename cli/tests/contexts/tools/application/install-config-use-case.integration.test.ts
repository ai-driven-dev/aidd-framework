import { describe, expect, it } from "vitest";
import { InstallConfigUseCase } from "../../../../src/contexts/tools/application/install-config-use-case.js";
import { copilot } from "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { SettingsCapability } from "../../../../src/contexts/tools/domain/settings-capability.js";
import { FrameworkDescriptor } from "../../../../src/contexts/translate/domain/canon.js";
import { extractConfigCapabilities } from "../../../../src/domain/models/config-capability.js";
import { BundledAssetProviderAdapter } from "../../../../src/infrastructure/assets/asset-loader.js";
import { linuxPlatform } from "../../../application/use-cases/helpers.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";

function buildUseCase() {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
  return { useCase: new InstallConfigUseCase(fs, hasher), fs };
}

function emptyDescriptor(): FrameworkDescriptor {
  return new FrameworkDescriptor({
    version: "test",
    contentSections: [],
    templateRefs: [],
    configRefs: [],
  });
}

describe("InstallConfigUseCase — staticContent", () => {
  it("produces an installation file for a SettingsCapability with staticContent", async () => {
    const { useCase } = buildUseCase();
    const capability = new SettingsCapability({
      outputPath: ".vscode/settings.json",
      mergeStrategy: "framework-prime",
      staticContent: '{"my.key": true}',
    });

    const results = await useCase.execute({
      capabilities: [capability],
      configRefs: [],
      contentFiles: new Map(),
      projectRoot: PROJECT_ROOT,
      platform: linuxPlatform,
    });

    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe(".vscode/settings.json");
    expect(results[0].content).toBe('{"my.key": true}');
    expect(results[0].mergeStrategy).toBe("framework-prime");
  });

  it("staticContent capability does not need a matching configRef", async () => {
    const { useCase } = buildUseCase();
    const capability = new SettingsCapability({
      outputPath: ".vscode/settings.json",
      mergeStrategy: "framework-prime",
      staticContent: '{"standalone": true}',
    });

    const results = await useCase.execute({
      capabilities: [capability],
      configRefs: [{ name: "irrelevantSignal", path: "config/irrelevant.json" }],
      contentFiles: new Map(),
      projectRoot: PROJECT_ROOT,
      platform: linuxPlatform,
    });

    expect(results).toHaveLength(1);
    expect(JSON.parse(results[0].content)).toHaveProperty("standalone", true);
  });

  it("copilot staticContent contains all required Copilot keys", async () => {
    const { useCase } = buildUseCase();
    const descriptor = emptyDescriptor();
    const assetProvider = new BundledAssetProviderAdapter();

    const results = await useCase.execute({
      capabilities: extractConfigCapabilities(copilot),
      configRefs: descriptor.configRefs,
      contentFiles: new Map(),
      projectRoot: PROJECT_ROOT,
      platform: linuxPlatform,
      assetProvider,
      toolId: "copilot",
    });

    const settingsFile = results.find((f) => f.relativePath === ".vscode/settings.json");
    expect(settingsFile).toBeDefined();
    if (!settingsFile) return;

    const parsed = JSON.parse(settingsFile.content);
    expect(parsed).toHaveProperty("github.copilot.enable");
    expect(parsed).toHaveProperty("chat.tools.global.autoApprove", true);
    expect(parsed).toHaveProperty("github.copilot.chat.cli.mcp.enabled", true);
    expect(parsed).toHaveProperty("accessibility.signals.chatResponseReceived");
  });

  it("skips a consumes-based capability when no matching configRef content is available", async () => {
    const { useCase } = buildUseCase();
    const capability = new SettingsCapability({
      outputPath: ".vscode/settings.json",
      mergeStrategy: "framework-prime",
      consumes: ["someSignal"],
    });

    const results = await useCase.execute({
      capabilities: [capability],
      configRefs: [{ name: "someSignal", path: "config/some.json" }],
      contentFiles: new Map(), // no content for 'config/some.json'
      projectRoot: PROJECT_ROOT,
      platform: linuxPlatform,
    });

    expect(results).toHaveLength(0);
  });
});
