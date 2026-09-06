import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSyncSettingsUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { ModeAMarketplaceTranslator } from "../../../../../src/contexts/framework/application/framework/translator/mode-a-marketplace-translator.js";
import type { EnsureBuiltMarketplace } from "../../../../../src/contexts/framework/application/shared/ensure-built-marketplace-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakeNativePluginActivator } from "../../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";
const SHARED_SETTINGS = resolve(PROJECT_ROOT, ".claude/settings.json");

function distribution(name: string): PluginDistribution {
  const files = [{ relativePath: "commands/hello.md", content: "# Hello" }];
  return new PluginDistribution({
    manifest: { name, version: "1.0.0" },
    format: "claude",
    files,
    components: { commands: files, agents: [], rules: [], skills: [], hooks: [], mcp: [] },
  });
}

interface SyncSetup {
  /** Content written to `.claude/settings.json` before the sync, when given. */
  readonly settings?: string;
  /** Marketplaces to register; the first is the one plugins are attached to. */
  readonly marketplaceNames?: readonly string[];
  readonly ensureBuilt?: EnsureBuiltMarketplace;
  /** Whether the tool's own CLI enables plugins, which decides what it registers. */
  readonly enablesPlugins?: boolean;
  /** Whether claude's own CLI is on PATH. Defaults to available. */
  readonly available?: boolean;
  /** Makes the activator crash on `addMarketplace` with a plain `Error`. */
  readonly crashOnAddMarketplace?: boolean;
  /** Refs that fail to enable — a recoverable, best-effort `NativePluginCliError`. */
  readonly failOnPlugins?: readonly string[];
}

async function sync(setup: SyncSetup = {}) {
  const names = setup.marketplaceNames ?? ["aidd-framework"];
  const fs = new InMemoryFileAdapter();
  const manifestRepo = new InMemoryManifestRepository();
  const registry = new InMemoryMarketplaceRegistry();
  const logger = new CapturingLogger();
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);

  await new ModeAMarketplaceTranslator().addPlugin(
    distribution("aidd-context"),
    "claude",
    { kind: "local", path: "/plugin-source" },
    PROJECT_ROOT,
    manifest,
    names[0]
  );
  await manifestRepo.save(manifest);
  for (const name of names) {
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name,
        source: { kind: "local", path: `/source/${name}` },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
  }
  if (setup.settings !== undefined) await fs.writeFile(SHARED_SETTINGS, setup.settings);

  const activator = new FakeNativePluginActivator({
    available: setup.available ?? true,
    enablesPlugins: setup.enablesPlugins ?? false,
    crashOnAddMarketplace: setup.crashOnAddMarketplace ?? false,
    failOnPlugins: setup.failOnPlugins ?? [],
  });
  const useCase = new MarketplaceSyncSettingsUseCase(
    fs,
    manifestRepo,
    registry,
    new DeterministicHasher(),
    logger,
    new Map([["claude", activator]]),
    setup.ensureBuilt ?? fakeEnsureBuiltMarketplace()
  );
  const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
  const written = (await fs.fileExists(SHARED_SETTINGS))
    ? (JSON.parse(await fs.readFile(SHARED_SETTINGS)) as Record<string, unknown>)
    : undefined;
  return { written, logger, fs, activator, result };
}

/**
 * The settings file the CLI shares with the tool, and with whoever edits it by hand.
 *
 * This flow writes into a file it does not own. Its own comment states the contract — "a
 * trailing comma must not take the whole sync down with it" — and the mutation report said
 * three of nineteen mutants in `loadSettings` were killed, so the contract was mostly a
 * sentence. Every case below names what a user loses if it stops holding.
 */
describe("the settings file a user also edits", () => {
  it("writes the enabled plugin into a file that did not exist", async () => {
    const { written } = await sync();

    expect(written?.enabledPlugins).toEqual({ "aidd-context@aidd-framework": true });
  });

  it("keeps entries it did not put there", async () => {
    const { written } = await sync({
      settings: JSON.stringify({
        model: "opus",
        enabledPlugins: { "someone-elses@their-marketplace": true },
      }),
    });

    expect(written?.model).toBe("opus");
    expect(written?.enabledPlugins).toEqual({
      "someone-elses@their-marketplace": true,
      "aidd-context@aidd-framework": true,
    });
  });

  it("leaves a plugin somebody turned off turned off", async () => {
    // The sync adds a key only when it is absent. Adding it unconditionally would
    // silently re-enable a plugin on the next `aidd sync`.
    const { written } = await sync({
      settings: JSON.stringify({ enabledPlugins: { "aidd-context@aidd-framework": false } }),
    });

    expect(written?.enabledPlugins).toEqual({ "aidd-context@aidd-framework": false });
  });

  it("warns and carries on when the file is not valid JSON", async () => {
    // A trailing comma in a hand-edited file must not fail `setup`, `sync` and `update`.
    const { written, logger } = await sync({
      settings: '{ "enabledPlugins": { "a@b": true }, }',
    });

    expect(logger.warnMessages.some((w) => w.includes("malformed JSON"))).toBe(true);
    expect(written?.enabledPlugins).toEqual({ "aidd-context@aidd-framework": true });
  });

  it("treats a file holding an array as empty rather than merging into it", async () => {
    const { written } = await sync({ settings: JSON.stringify(["not", "an", "object"]) });

    expect(written?.enabledPlugins).toEqual({ "aidd-context@aidd-framework": true });
  });

  it("treats a file holding null as empty", async () => {
    const { written } = await sync({ settings: "null" });

    expect(written?.enabledPlugins).toEqual({ "aidd-context@aidd-framework": true });
  });

  it("treats a non-object under the key as empty rather than spreading it", async () => {
    const { written } = await sync({ settings: JSON.stringify({ enabledPlugins: ["a", "b"] }) });

    expect(written?.enabledPlugins).toEqual({ "aidd-context@aidd-framework": true });
  });
});

/**
 * Building the marketplace tree happens for every tool, before the branch that decides who
 * writes the registration down — so a build that fails is on the path of every sync.
 * `buildAllForTool` — `builtSourcesForTool` when this was written — had seven mutants and no test killed one.
 */
describe("a marketplace that will not build", () => {
  const failingBuild = (failFor: string): EnsureBuiltMarketplace => ({
    execute: async (options) => {
      if (options.marketplace.name === failFor) throw new Error("no catalog at that source");
      return { builtDir: `/built/${options.target}`, version: "test", rebuilt: true };
    },
  });

  it("says which marketplace and which tool were skipped", async () => {
    const { logger } = await sync({
      marketplaceNames: ["aidd-framework", "broken"],
      ensureBuilt: failingBuild("broken"),
    });

    expect(
      logger.warnMessages.some((w) => w.includes("'broken'") && w.includes("claude")),
      "the warning must name the marketplace and the tool, or it says nothing actionable"
    ).toBe(true);
  });

  it("still syncs the tool, rather than letting one bad source stop the rest", async () => {
    const { written } = await sync({
      marketplaceNames: ["aidd-framework", "broken"],
      ensureBuilt: failingBuild("broken"),
    });

    expect(written?.enabledPlugins).toEqual({ "aidd-context@aidd-framework": true });
  });
});

/**
 * The build runs before the branch that decides who writes the registration down, and
 * that position is the whole reason it survived the registration cleanup.
 *
 * Every known marketplace is registered, whether or not a plugin was installed from it
 * (see the comment on `activateTool`), so a marketplace with no installed plugin still
 * needs its tree built here. Deleting the call would have left it unbuilt, and the
 * registration the tool's own CLI writes would point at a directory that does not exist.
 */
describe("a marketplace no plugin points at", () => {
  it("is still built", async () => {
    const built: string[] = [];

    const recordingBuild: EnsureBuiltMarketplace = {
      execute: async (options) => {
        built.push(options.marketplace.name);
        return { builtDir: `/built/${options.target}`, version: "test", rebuilt: true };
      },
    };

    await sync({
      marketplaceNames: ["aidd-framework", "unused"],
      ensureBuilt: recordingBuild,
      enablesPlugins: true,
    });

    expect(built).toContain("unused");
  });
  it("is registered anyway, whether or not the tool enables its own plugins", async () => {
    // Declaring a marketplace and installing a plugin from it are two acts, and a person
    // does the first alone all the time. Reading `enableVerb` as "this tool learns its
    // marketplaces while enabling a plugin" left a marketplace nobody had installed from
    // unknown to the tool — measured against the real `claude` binary by
    // `scripts/smoke-tools.sh` ("claude declares the project marketplace at local scope"),
    // which found it told about neither of the two the project had registered.
    const { activator } = await sync({
      marketplaceNames: ["aidd-framework", "unused"],
      enablesPlugins: true,
    });

    expect(activator.addedMarketplaces).toHaveLength(2);
  });

  it("is registered anyway when the tool does not enable plugins itself", async () => {
    const { activator } = await sync({
      marketplaceNames: ["aidd-framework", "unused"],
      enablesPlugins: false,
    });

    expect(activator.addedMarketplaces).toHaveLength(2);
  });
});

/**
 * `execute` used to return `void`: `sync` had no way to tell what activation actually
 * did, so it never called it at all (#lot-2). This is the return `sync` now reads.
 */
describe("what execute reports about activation", () => {
  it("names the tool whose CLI actually ran, in `activated`", async () => {
    const { result } = await sync();

    expect(result.activated).toEqual(["claude"]);
  });

  it("names the tool and the binary in `binaryMissing` when the CLI is not on PATH", async () => {
    const { result } = await sync({ available: false });

    expect(result.activated).toEqual([]);
    expect(result.binaryMissing).toEqual([{ toolId: "claude", binary: "claude" }]);
  });

  it("collects a best-effort failure in `warnings`, the same content the logger gets", async () => {
    const { result, logger } = await sync({
      enablesPlugins: true,
      failOnPlugins: ["aidd-context@aidd-framework"],
    });

    expect(result.warnings).toEqual(logger.warnMessages);
    expect(result.warnings.some((w) => w.includes("aidd-context@aidd-framework"))).toBe(true);
  });

  // The one failure shape a real adapter never produces (see `crashOnAddMarketplace`'s own
  // doc): activation must not swallow it as best-effort, but `execute` must not throw it
  // either — that decision belongs to whoever calls `execute` (`sync.ts`), the same split
  // `restoreAllUseCase` already holds for a restore failure.
  it("carries a hard, unexpected activator failure in `errors` rather than throwing", async () => {
    const { result } = await sync({ crashOnAddMarketplace: true });

    expect(result.errors).toEqual([
      { scope: "claude", message: "activator crashed adding a marketplace" },
    ]);
    expect(result.activated).toEqual([]);
  });
});

/** `sync --tool <id>` must touch only that tool — otherwise a person fixing one tool's
 * registration would silently re-drive every other tool's CLI too. */
describe("toolIds narrows which tool's CLI is driven", () => {
  it("never calls the activator of a tool not named in toolIds", async () => {
    const fs = new InMemoryFileAdapter();
    const manifestRepo = new InMemoryManifestRepository();
    const registry = new InMemoryMarketplaceRegistry();
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    manifest.addTool("codex", "test", []);
    await new ModeAMarketplaceTranslator().addPlugin(
      distribution("aidd-context"),
      "claude",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      "aidd-framework"
    );
    await manifestRepo.save(manifest);
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "aidd-framework",
        source: { kind: "local", path: "/source/aidd-framework" },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const claudeActivator = new FakeNativePluginActivator({ available: true });
    const codexActivator = new FakeNativePluginActivator({ available: true });
    const useCase = new MarketplaceSyncSettingsUseCase(
      fs,
      manifestRepo,
      registry,
      new DeterministicHasher(),
      new CapturingLogger(),
      new Map([
        ["claude", claudeActivator],
        ["codex", codexActivator],
      ]),
      fakeEnsureBuiltMarketplace()
    );

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT, toolIds: ["claude"] });

    expect(claudeActivator.addedMarketplaces).not.toEqual([]);
    expect(codexActivator.addedMarketplaces).toEqual([]);
    expect(result.activated).toEqual(["claude"]);
  });
});
