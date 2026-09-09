import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import type { EnsureBuiltMarketplace } from "../../../../../src/contexts/framework/application/shared/ensure-built-marketplace-use-case.js";
import type { NativeRegistrations } from "../../../../../src/contexts/framework/domain/manifest/native-registrations.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { InstallationFile } from "../../../../../src/kernel/file.js";
import type { ToolId } from "../../../../../src/kernel/tool.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const MARKETPLACE = "aidd-framework";
const PLUGIN = "aidd-telemetry";
const SETTINGS_PATH = ".claude/settings.json";
const SETTINGS_ABSOLUTE = resolve(PROJECT_ROOT, SETTINGS_PATH);

class SaveCountingManifestRepository extends InMemoryManifestRepository {
  saves = 0;

  override async save(manifest: Manifest): Promise<void> {
    this.saves += 1;
    return super.save(manifest);
  }
}

interface Setup {
  readonly toolIds?: readonly ToolId[];
  readonly marketplaceNames?: readonly string[];
  readonly failingBuilds?: readonly string[];
  readonly activator?: FakeNativePluginActivator;
  readonly withPlugin?: boolean;
  readonly trackedSettings?: string;
  readonly settingsOnDisk?: string;
  readonly otherTrackedFiles?: readonly string[];
  readonly existingRegistrations?: NativeRegistrations;
}

function catalogPath(marketplace: string, target: string): string {
  const relative =
    target === "codex" ? ".agents/plugins/marketplace.json" : ".claude-plugin/marketplace.json";
  return `/built/${marketplace}/${target}/${relative}`;
}

function buildPerMarketplace(failing: readonly string[]): EnsureBuiltMarketplace {
  return {
    execute: async (options) => {
      if (failing.includes(options.marketplace.name)) throw new Error("no catalog at that source");
      return {
        builtDir: `/built/${options.marketplace.name}/${options.target}`,
        version: "test",
        rebuilt: true,
      };
    },
  };
}

async function build(setup: Setup = {}) {
  const hasher = new DeterministicHasher();
  const names = setup.marketplaceNames ?? [MARKETPLACE];
  const toolIds = setup.toolIds ?? ["claude"];
  const fs = new InMemoryFileAdapter({}, hasher);
  for (const name of names) {
    for (const toolId of toolIds) {
      fs.setFile(
        catalogPath(name, toolId),
        JSON.stringify({ name, version: "1.0.0", plugins: [{ name: PLUGIN }] })
      );
    }
  }
  if (setup.settingsOnDisk !== undefined) fs.setFile(SETTINGS_ABSOLUTE, setup.settingsOnDisk);
  const manifest = Manifest.create();
  const tracked = (setup.otherTrackedFiles ?? []).map(
    (relativePath) =>
      new InstallationFile({ relativePath, content: "# tracked", hash: hasher.hash("# tracked") })
  );
  if (setup.trackedSettings !== undefined) {
    tracked.push(
      new InstallationFile({
        relativePath: SETTINGS_PATH,
        content: setup.trackedSettings,
        hash: hasher.hash(setup.trackedSettings),
      })
    );
  }
  for (const toolId of toolIds)
    manifest.addTool(toolId, "test", toolId === "claude" ? tracked : []);
  if (setup.withPlugin === true) {
    manifest.addPlugin(
      "claude",
      InstalledPlugin.fromMetadata(
        PLUGIN,
        "1.0.0",
        { kind: "github", repo: "ai-driven-dev/framework" },
        true,
        "project",
        MARKETPLACE
      )
    );
  }
  if (setup.existingRegistrations !== undefined) {
    manifest.setNativeRegistrations("claude", setup.existingRegistrations);
  }
  const manifestRepo = new SaveCountingManifestRepository(manifest);
  const registry = new InMemoryMarketplaceRegistry();
  for (const name of names) {
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name,
        source: { kind: "github", repo: `ai-driven-dev/${name}` },
        scope: "project",
        addedAt: "2026-09-02T00:00:00Z",
      })
    );
  }
  const activator =
    setup.activator ?? new FakeNativePluginActivator({ available: true, enablesPlugins: false });
  const useCase = new MarketplaceSyncSettingsUseCase(
    fs,
    manifestRepo,
    registry,
    hasher,
    new CapturingLogger(),
    new Map(toolIds.map((toolId) => [toolId, activator])),
    buildPerMarketplace(setup.failingBuilds ?? [])
  );
  return { useCase, manifestRepo, manifest, fs, hasher };
}

function recorded(manifest: Manifest): NativeRegistrations | undefined {
  return manifest.getNativeRegistrations("claude");
}

function trackedSettingsHash(manifest: Manifest): string | undefined {
  return manifest.getToolFiles("claude").find((file) => file.relativePath === SETTINGS_PATH)?.hash
    .value;
}

const FRAMEWORK_ONLY: NativeRegistrations = {
  binary: "claude",
  marketplaces: [{ alias: MARKETPLACE, hostName: MARKETPLACE }],
  pluginRefs: [],
};

describe("how many times the manifest is written back", () => {
  it("zero times when a run changed nothing, writing no project file either", async () => {
    const activator = new FakeNativePluginActivator({ available: false });
    const { useCase, manifestRepo, fs } = await build({ toolIds: ["claude", "codex"], activator });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(manifestRepo.saves).toBe(0);
    expect(fs.listUnder(resolve(PROJECT_ROOT))).toStrictEqual([]);
  });

  it("once when only the settings file changed", async () => {
    const activator = new FakeNativePluginActivator({ available: false });
    const { useCase, manifestRepo, fs } = await build({ withPlugin: true, activator });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(manifestRepo.saves).toBe(1);
    expect(JSON.parse(await fs.readFile(SETTINGS_ABSOLUTE))).toStrictEqual({
      enabledPlugins: { [`${PLUGIN}@${MARKETPLACE}`]: true },
    });
  });

  it("once when only the host registration changed", async () => {
    const { useCase, manifestRepo, manifest } = await build();

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(manifestRepo.saves).toBe(1);
    expect(recorded(manifest)).toStrictEqual(FRAMEWORK_ONLY);
  });

  it("once across two identical runs: the second finds nothing to record", async () => {
    const { useCase, manifestRepo } = await build({
      trackedSettings: "{}",
      settingsOnDisk: "{}",
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });
    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(manifestRepo.saves).toBe(1);
  });

  it("never on a second run that enables the same plugin ref again", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, manifestRepo, manifest } = await build({ withPlugin: true, activator });
    await useCase.execute({ projectRoot: PROJECT_ROOT });
    const afterFirstRun = manifestRepo.saves;

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(manifestRepo.saves).toBe(afterFirstRun);
    expect(recorded(manifest)?.pluginRefs).toStrictEqual([`${PLUGIN}@${MARKETPLACE}`]);
  });

  it("once when only the tracked settings hash moved under the host's own write", async () => {
    const onDisk = JSON.stringify({ model: "opus" });
    const { useCase, manifestRepo, manifest, hasher } = await build({
      trackedSettings: "{}",
      settingsOnDisk: onDisk,
      existingRegistrations: FRAMEWORK_ONLY,
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(manifestRepo.saves).toBe(1);
    expect(trackedSettingsHash(manifest)).toBe(hasher.hash(onDisk).value);
  });

  it("once when the marketplaces key is evicted from the shared settings file", async () => {
    const activator = new FakeNativePluginActivator({ available: false });
    const onDisk = JSON.stringify({
      extraKnownMarketplaces: { x: { source: "/p" } },
      model: "opus",
    });
    const { useCase, manifestRepo, manifest, fs, hasher } = await build({
      trackedSettings: onDisk,
      settingsOnDisk: onDisk,
      activator,
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const written = await fs.readFile(SETTINGS_ABSOLUTE);
    expect(manifestRepo.saves).toBe(1);
    expect(JSON.parse(written)).toStrictEqual({ model: "opus" });
    expect(trackedSettingsHash(manifest)).toBe(hasher.hash(written).value);
  });
});

describe("what the tracked settings hash follows", () => {
  it("stays where it was when the tracked file is gone from disk", async () => {
    const { useCase, manifest, hasher } = await build({ trackedSettings: "{}" });

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.errors).toStrictEqual([]);
    expect(trackedSettingsHash(manifest)).toBe(hasher.hash("{}").value);
  });

  it("never starts tracking the settings file on behalf of another tracked file", async () => {
    const { useCase, manifest } = await build({
      otherTrackedFiles: ["CLAUDE.md"],
      settingsOnDisk: "{}",
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(manifest.getToolFiles("claude").map((file) => file.relativePath)).toStrictEqual([
      "CLAUDE.md",
    ]);
  });
});

describe("when a recorded registration is replaced", () => {
  it("once its marketplaces differ, same binary and same refs", async () => {
    const { useCase, manifest } = await build({
      existingRegistrations: {
        binary: "claude",
        marketplaces: [{ alias: "stale", hostName: "stale" }],
        pluginRefs: [],
      },
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(recorded(manifest)).toStrictEqual(FRAMEWORK_ONLY);
  });

  it("once a marketplace's hostName alone moved", async () => {
    const { useCase, manifest } = await build({
      existingRegistrations: {
        binary: "claude",
        marketplaces: [{ alias: MARKETPLACE, hostName: "old-host" }],
        pluginRefs: [],
      },
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(recorded(manifest)).toStrictEqual(FRAMEWORK_ONLY);
  });

  it("once a plugin ref appears where none was recorded", async () => {
    const activator = new FakeNativePluginActivator({ available: true });
    const { useCase, manifest } = await build({
      withPlugin: true,
      activator,
      existingRegistrations: FRAMEWORK_ONLY,
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(recorded(manifest)).toStrictEqual({
      ...FRAMEWORK_ONLY,
      pluginRefs: [`${PLUGIN}@${MARKETPLACE}`],
    });
  });

  it("compares every recorded marketplace, not only the first", async () => {
    const { useCase, manifest } = await build({
      marketplaceNames: ["market-a", "market-b"],
      existingRegistrations: {
        binary: "claude",
        marketplaces: [
          { alias: "market-a", hostName: "market-a" },
          { alias: "stale", hostName: "stale" },
        ],
        pluginRefs: [],
      },
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(recorded(manifest)).toStrictEqual({
      binary: "claude",
      marketplaces: [
        { alias: "market-a", hostName: "market-a" },
        { alias: "market-b", hostName: "market-b" },
      ],
      pluginRefs: [],
    });
  });

  it("records a marketplace whose build failed under its own alias", async () => {
    const { useCase, manifest } = await build({
      marketplaceNames: [MARKETPLACE, "broken"],
      failingBuilds: ["broken"],
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(recorded(manifest)).toStrictEqual({
      binary: "claude",
      marketplaces: [
        { alias: MARKETPLACE, hostName: MARKETPLACE },
        { alias: "broken", hostName: "broken" },
      ],
      pluginRefs: [],
    });
  });
});
