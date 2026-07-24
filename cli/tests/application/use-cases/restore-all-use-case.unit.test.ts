import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RestoreAllUseCase } from "../../../src/application/use-cases/global/restore-all-use-case.js";
import { PluginAddUseCase } from "../../../src/application/use-cases/plugin/plugin-add-use-case.js";
import { PluginDistributionReaderAdapter } from "../../../src/infrastructure/adapters/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall, installTool } from "../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakePlatform } from "../../helpers/ports/fake-platform.js";
import { OverwritePrompter, ScriptedPrompter } from "../../helpers/ports/scripted-prompter.js";
import { seedFromDirectory } from "../../helpers/ports/seed-from-directory.js";

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
  return new RestoreAllUseCase(
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

describe("RestoreAllUseCase — plugin materialization (BUG-E3-02 / A3)", () => {
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
    await useCase.execute(PROJECT_ROOT, false);

    expect(deps.fs.getFile(pluginFile)).not.toBe("CORRUPTED CONTENT");
    expect(deps.fs.getFile(pluginFile)).toContain("Greet from sample-plugin.");
    expect(count()).toBe(1);
  });

  it("restores a corrupted plugin file with exactly one materialization call (cursor — installScope:user tool)", async () => {
    // A local-source install never hits restoreViaBuiltTree (that path requires
    // plugin.marketplace to be set — see apply-plugin-files-use-case.ts), so this
    // still exercises restoreViaTranslate like claude, just for a second, differently
    // -configured AI tool (installScope:"user", pluginsDir:""). It's not the true
    // built-tree double-*write* path (that needs a marketplace-sourced install, out
    // of scope here), but it does independently confirm the collapse-to-one-pass
    // fix isn't accidentally claude-specific.
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
    await useCase.execute(PROJECT_ROOT, false);

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

    const result = await makeRestoreAllUseCase(deps, reader).execute(PROJECT_ROOT, false);

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

    const result = await makeRestoreAllUseCase(deps, reader).execute(PROJECT_ROOT, false);

    expect(result.pluginNamesRestored).toEqual([]);
    expect(result.errors).toHaveLength(0);
    const manifestAfter = await deps.manifestRepo.load();
    const pluginAfter = manifestAfter?.getPlugins("claude").find((p) => p.name === "sample-plugin");
    expect(pluginAfter?.files).toEqual(pluginBefore?.files);
  });

  it("interactive restore with an explicit file selection also skips unselected plugin files (translate-mode)", async () => {
    // Plugin drift isn't offered by the interactive picker at all (StatusUseCase's
    // pluginDrift is never read by promptForFiles) — so once the user picks ANY
    // specific regular file, ctx.fileFilter becomes active and every plugin path
    // fails to match it (it was never a selectable option). This mirrors what
    // ai.ts/ide.ts's `restore <file>` already does today (ctx.fileFilter already
    // reached plugin restore for THAT path before this fix) — this test proves the
    // global `aidd restore` command now behaves the same way, consistently.
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
    // keybindings.json itself is actually repaired isn't asserted here: RestoreAllUseCase
    // never supplies frameworkPath to RestoreUseCase, so CONFIG_REFS-driven regular-file
    // content can't regenerate through this path at all — a separate, pre-existing gap,
    // out of scope for BUG-E3-02. What this test proves is narrower and in scope: making
    // ANY explicit selection turns fileFilter on, and once on, it excludes every plugin
    // path (never offered as a choice), where pre-fix Pass 2 ignored fileFilter entirely.
    const prompter = new ScriptedPrompter([
      ScriptedPrompter.answer.checkbox([".vscode/keybindings.json"]),
    ]);
    const useCase = makeRestoreAllUseCase(deps, reader, prompter);
    await useCase.execute(PROJECT_ROOT, true);

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

    await makeRestoreAllUseCase(deps, reader).execute(PROJECT_ROOT, false);

    expect(deps.fs.getFile(claudePluginFile)).not.toBe("CORRUPTED CLAUDE");
    expect(deps.fs.getFile(codexPluginFile)).not.toBe("CORRUPTED CODEX");
  });
});
