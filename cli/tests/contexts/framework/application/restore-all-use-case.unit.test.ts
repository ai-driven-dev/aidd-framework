import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RestoreAllUseCase } from "../../../../src/contexts/framework/application/global/restore-all-use-case.js";
import { PluginAddUseCase } from "../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { RestoreUseCase } from "../../../../src/contexts/framework/application/restore/restore-use-case.js";
import { DetectPluginDriftUseCase } from "../../../../src/contexts/framework/application/shared/detect-plugin-drift-use-case.js";
import { StatusUseCase } from "../../../../src/contexts/framework/application/status-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import {
  buildUnitDeps,
  initAndInstall,
  installTool,
} from "../../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakePlatform } from "../../../helpers/ports/fake-platform.js";
import { OverwritePrompter, ScriptedPrompter } from "../../../helpers/ports/scripted-prompter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const PROJECT_ROOT = "/test-project";
const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");

type Deps = Awaited<ReturnType<typeof buildUnitDeps>>;

function builtDeps(deps: Deps) {
  return {
    ensureBuilt: fakeEnsureBuiltMarketplace(),
    marketplaceRegistry: deps.marketplaceRegistry,
    homedir: () => "/home/test",
  };
}

async function installPlugin(
  deps: Deps,
  toolId: "claude" | "cursor",
  pluginReader: PluginDistributionReaderAdapter
): Promise<void> {
  await new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    pluginReader,
    deps.hasher,
    deps.logger,
    deps.marketplaceRegistry,
    fakeEnsureBuiltMarketplace()
  ).execute({
    source: { kind: "local", path: PLUGIN_FIXTURE },
    toolIds: [toolId],
    projectRoot: PROJECT_ROOT,
    interactive: false,
  });
}

function makeRestoreAllUseCase(
  deps: Deps,
  pluginReader: PluginDistributionReaderAdapter,
  prompter: OverwritePrompter | ScriptedPrompter = new OverwritePrompter(),
  withBuiltDeps = false
): RestoreAllUseCase {
  const statusUseCase = new StatusUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.hasher,
    new DetectPluginDriftUseCase(deps.fs)
  );
  const restoreUseCase = new RestoreUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.hasher,
    deps.logger,
    new FakePlatform("linux"),
    prompter,
    deps.pluginFetcher,
    pluginReader,
    deps.assetProvider,
    withBuiltDeps ? builtDeps(deps) : undefined
  );
  return new RestoreAllUseCase(deps.manifestRepo, prompter, statusUseCase, restoreUseCase);
}

function countingReader(fs: Deps["fs"]): {
  reader: PluginDistributionReaderAdapter;
  count: () => number;
} {
  const reader = new PluginDistributionReaderAdapter(fs);
  let calls = 0;
  const original = reader.read.bind(reader);
  reader.read = async (...args: Parameters<typeof original>) => {
    calls++;
    return original(...args);
  };
  return { reader, count: () => calls };
}

describe("RestoreAllUseCase — the --force flag", () => {
  /**
   * `aidd restore --force` used to be inert: the command folded `force` into
   * `interactive` and the use case only took `interactive`, so a non-TTY run always
   * decided with `force: false`. A modified file raised InputRequiredError, the
   * caller swallowed it into a warning telling the user to pass `--force` — which
   * they had — and the command then reported "all files are unmodified" while
   * `status` reported the same file modified.
   */
  async function setupWithModifiedTrackedFile(): Promise<{
    deps: Deps;
    reader: PluginDistributionReaderAdapter;
    trackedPath: string;
  }> {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");

    const manifest = await deps.manifestRepo.load();
    const tracked = manifest?.getToolFiles("claude") ?? [];
    expect(tracked.length, "the fixture must track at least one file").toBeGreaterThan(0);

    const trackedPath = join(PROJECT_ROOT, tracked[0].relativePath);
    await deps.fs.writeFile(trackedPath, "EDITED OUTSIDE THE CLI");

    return { deps, reader: new PluginDistributionReaderAdapter(deps.fs), trackedPath };
  }

  it("restores a modified tracked file when force is set", async () => {
    const { deps, reader, trackedPath } = await setupWithModifiedTrackedFile();

    const result = await makeRestoreAllUseCase(deps, reader).execute(PROJECT_ROOT, true, false);

    expect(deps.fs.getFile(trackedPath)).not.toBe("EDITED OUTSIDE THE CLI");
    expect(result.errors, "force must reach the decision, not raise InputRequired").toEqual([]);
    expect(result.totalRestored).toBeGreaterThan(0);
  });

  it("keeps a modified tracked file and reports why when force is not set", async () => {
    const { deps, reader, trackedPath } = await setupWithModifiedTrackedFile();

    const result = await makeRestoreAllUseCase(deps, reader).execute(PROJECT_ROOT, false, false);

    expect(deps.fs.getFile(trackedPath)).toBe("EDITED OUTSIDE THE CLI");
    expect(result.totalRestored).toBe(0);
    expect(result.errors.map((e) => e.message).join(" ")).toContain("--force");
  });
});

describe("RestoreAllUseCase — plugin materialization", () => {
  it("restores a corrupted plugin file with exactly one materialization call (translate-mode: claude)", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
    await installPlugin(deps, "claude", new PluginDistributionReaderAdapter(deps.fs));

    const pluginFile = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
    await deps.fs.writeFile(pluginFile, "CORRUPTED CONTENT");

    // Counting reader wired only from here — installPlugin's own read() must not count.
    const { reader, count } = countingReader(deps.fs);
    const useCase = makeRestoreAllUseCase(deps, reader);
    await useCase.execute(PROJECT_ROOT, false, false);

    expect(deps.fs.getFile(pluginFile)).not.toBe("CORRUPTED CONTENT");
    expect(deps.fs.getFile(pluginFile)).toContain("Greet from sample-plugin.");
    expect(count()).toBe(1);
  });

  it("restores a corrupted plugin file with exactly one materialization call (cursor — installScope:user tool)", async () => {
    // A local-source install never reaches restoreViaBuiltTree — that path requires
    // plugin.marketplace to be set (see apply-plugin-files-use-case.ts) — so this exercises
    // restoreViaTranslate, same as claude, but for a differently configured tool
    // (installScope:"user", pluginsDir:""). Confirms single-pass materialization is not
    // claude-specific; the true built-tree write path needs a marketplace-sourced install.
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "cursor");
    await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
    await installPlugin(deps, "cursor", new PluginDistributionReaderAdapter(deps.fs));

    const manifestAfterInstall = await deps.manifestRepo.load();
    const plugin = manifestAfterInstall
      ?.getPlugins("cursor")
      .find((p) => p.name === "sample-plugin");
    const trackedRelativePath = [...(plugin?.files.keys() ?? [])][0];
    expect(trackedRelativePath).toBeDefined();
    // plugin.files keys are relativePath (see restoreViaTranslate); actual fs storage is
    // keyed by the absolute path the file was written to.
    const pluginFile = join(PROJECT_ROOT, trackedRelativePath as string);
    await deps.fs.writeFile(pluginFile, "CORRUPTED CONTENT");

    // Counting reader wired only from here — installPlugin's own read() must not count.
    const { reader, count } = countingReader(deps.fs);
    const useCase = makeRestoreAllUseCase(deps, reader, new OverwritePrompter(), true);
    await useCase.execute(PROJECT_ROOT, false, false);

    expect(deps.fs.getFile(pluginFile)).not.toBe("CORRUPTED CONTENT");
    expect(count()).toBe(1);
  });

  it("result.pluginNamesRestored lists the restored plugin exactly once", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
    const { reader } = countingReader(deps.fs);
    await installPlugin(deps, "claude", reader);

    const pluginFile = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
    await deps.fs.writeFile(pluginFile, "CORRUPTED CONTENT");

    const result = await makeRestoreAllUseCase(deps, reader).execute(PROJECT_ROOT, false, false);

    expect(result.pluginNamesRestored).toEqual(["sample-plugin"]);
    expect(result.errors).toHaveLength(0);
  });

  it("a plugin already up to date is not listed as restored and produces no error", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
    const { reader } = countingReader(deps.fs);
    await installPlugin(deps, "claude", reader);

    // Nothing corrupted — plugin files are already at their installed state.
    const manifestBefore = await deps.manifestRepo.load();
    const pluginBefore = manifestBefore
      ?.getPlugins("claude")
      .find((p) => p.name === "sample-plugin");

    const result = await makeRestoreAllUseCase(deps, reader).execute(PROJECT_ROOT, false, false);

    expect(result.pluginNamesRestored).toEqual([]);
    expect(result.errors).toHaveLength(0);
    const manifestAfter = await deps.manifestRepo.load();
    const pluginAfter = manifestAfter?.getPlugins("claude").find((p) => p.name === "sample-plugin");
    expect(pluginAfter?.files).toEqual(pluginBefore?.files);
  });

  it("interactive restore with an explicit file selection also skips unselected plugin files (translate-mode)", async () => {
    // The interactive picker never offers plugin drift (promptForFiles does not read
    // StatusUseCase's pluginDrift), so once the user picks any specific regular file,
    // ctx.fileFilter is active and no plugin path can match it. Same behaviour as
    // ai.ts/ide.ts's `restore <file>`.
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    await installTool(deps, PROJECT_ROOT, "vscode");
    await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
    const { reader } = countingReader(deps.fs);
    await installPlugin(deps, "claude", reader);

    const pluginFile = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
    await deps.fs.writeFile(pluginFile, "CORRUPTED CONTENT");
    // keybindings.json is a plain tracked file (unlike settings.json, which is merge-type
    // and reports composite "path > key" drift entries, not a plain selectable path).
    const vscodeKeybindingsPath = join(PROJECT_ROOT, ".vscode/keybindings.json");
    await deps.fs.writeFile(vscodeKeybindingsPath, "CORRUPTED KEYBINDINGS");

    // User selects only the regular vscode file from the drifted-files checkbox
    // (StatusUseCase reports relativePath, not the absolute path). Whether
    // Whether keybindings.json is itself repaired is not asserted: RestoreAllUseCase never
    // supplies frameworkPath to RestoreUseCase, so CONFIG_REFS-driven content cannot
    // regenerate through this path at all. What is asserted is narrower: any explicit
    // selection turns fileFilter on, and once on it excludes every plugin path, since a
    // plugin file is never offered as a choice.
    const prompter = new ScriptedPrompter([
      ScriptedPrompter.answer.checkbox([".vscode/keybindings.json"]),
    ]);
    const useCase = makeRestoreAllUseCase(deps, reader, prompter);
    await useCase.execute(PROJECT_ROOT, false, true);

    expect(deps.fs.getFile(pluginFile)).toBe("CORRUPTED CONTENT");
  });

  it("unscoped restore still restores every installed AI tool's plugins (no regression)", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    await installTool(deps, PROJECT_ROOT, "codex");
    await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
    const { reader } = countingReader(deps.fs);
    await installPlugin(deps, "claude", reader);
    await new PluginAddUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.pluginFetcher,
      reader,
      deps.hasher,
      deps.logger,
      deps.marketplaceRegistry,
      fakeEnsureBuiltMarketplace()
    ).execute({
      source: { kind: "local", path: PLUGIN_FIXTURE },
      toolIds: ["codex"],
      projectRoot: PROJECT_ROOT,
      interactive: false,
    });

    const claudePluginFile = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
    const codexPluginFile = join(PROJECT_ROOT, ".codex/plugins/sample-plugin/commands/greet.md");
    await deps.fs.writeFile(claudePluginFile, "CORRUPTED CLAUDE");
    await deps.fs.writeFile(codexPluginFile, "CORRUPTED CODEX");

    await makeRestoreAllUseCase(deps, reader).execute(PROJECT_ROOT, false, false);

    expect(deps.fs.getFile(claudePluginFile)).not.toBe("CORRUPTED CLAUDE");
    expect(deps.fs.getFile(codexPluginFile)).not.toBe("CORRUPTED CODEX");
  });
});

describe("RestoreAllUseCase — consent to overwrite", () => {
  type RestoreOptions = Parameters<RestoreUseCase["execute"]>[0];

  /** Records what RestoreAllUseCase asks the restore to do, without doing it. */
  function recordAsks(restoreUseCase: RestoreUseCase): RestoreOptions[] {
    const seen: RestoreOptions[] = [];
    restoreUseCase.execute = async (options: RestoreOptions) => {
      seen.push(options);
      return {
        tools: [],
        totalRestored: 0,
        totalKept: 0,
        totalPluginFilesRestored: 0,
        restoredPluginNames: [],
        unrestorable: [],
      };
    };
    return seen;
  }

  async function askedWith(interactive: boolean, force: boolean): Promise<RestoreOptions> {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    const prompter = new OverwritePrompter();
    const statusUseCase = new StatusUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.hasher,
      new DetectPluginDriftUseCase(deps.fs)
    );
    const restoreUseCase = new RestoreUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.hasher,
      deps.logger,
      new FakePlatform("linux"),
      prompter
    );
    const seen = recordAsks(restoreUseCase);
    await new RestoreAllUseCase(deps.manifestRepo, prompter, statusUseCase, restoreUseCase).execute(
      PROJECT_ROOT,
      interactive,
      force
    );
    const asked = seen[0];
    expect(asked).toBeDefined();
    return asked as RestoreOptions;
  }

  it("carries --force through to the restore it delegates to", async () => {
    expect((await askedWith(false, true)).force).toBe(true);
  });

  it("does not overwrite without consent when neither --force nor a TTY is there", async () => {
    expect((await askedWith(false, false)).force).toBe(false);
  });

  it("treats the interactive file selection as the consent, so nothing is asked twice", async () => {
    expect((await askedWith(true, false)).force).toBe(true);
  });
});
