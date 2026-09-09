import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { RestoreUseCase } from "../../../../src/contexts/framework/application/restore/restore-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistributionReaderAdapter } from "../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { InstallationFile } from "../../../../src/kernel/file.js";
import {
  buildUnitDeps,
  FIXTURE_DIR,
  initAndInstall,
  initProject,
  installTool,
} from "../../../helpers/ports/build-unit-deps.js";
import { fakeEnsureBuiltMarketplace } from "../../../helpers/ports/fake-ensure-built-marketplace.js";
import { FakePlatform } from "../../../helpers/ports/fake-platform.js";
import {
  KeepPrompter,
  OverwritePrompter,
  ScriptedPrompter,
} from "../../../helpers/ports/scripted-prompter.js";
import { seedFromDirectory } from "../../../helpers/ports/seed-from-directory.js";

const PROJECT_ROOT = "/test-project";
const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");

async function installPlugin(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  toolId: "claude" | "codex"
): Promise<void> {
  await seedFromDirectory(deps.fs, PLUGIN_FIXTURE, { useAbsolutePaths: true });
  const pluginReader = new PluginDistributionReaderAdapter(deps.fs);
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

class RecordingPrompter extends OverwritePrompter {
  readonly calls: Array<{ relativePath: string; reason: "deleted" | "modified" }> = [];
  private readonly response: "keep" | "overwrite";

  constructor(response: "keep" | "overwrite" = "overwrite") {
    super();
    this.response = response;
  }

  override async resolveConflict(
    relativePath: string,
    reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite"> {
    this.calls.push({ relativePath, reason });
    return this.response;
  }
}

function makeRestoreUseCase(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  prompter = new OverwritePrompter()
) {
  return new RestoreUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.hasher,
    deps.logger,
    new FakePlatform("linux"),
    prompter,
    deps.pluginFetcher,
    deps.pluginDistributionReader
  );
}

describe("restore", () => {
  it("aborts if project is not initialized", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    const useCase = makeRestoreUseCase(deps);

    await expect(
      useCase.execute({
        frameworkPath: FIXTURE_DIR,
        version: "test",
        projectRoot: PROJECT_ROOT,
      })
    ).rejects.toThrow("aidd setup");
  });

  it("reports nothing to restore when files are unmodified", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");

    const result = await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
    });

    expect(result.tools.every((t) => t.nothingToRestore)).toBe(true);
  });

  it("restores a modified file with --force", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");

    const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
    await deps.fs.writeFile(settingsPath, '{"modified": true}');

    const result = await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
    });

    const contentAfter = deps.fs.getFile(settingsPath) ?? "{}";
    const parsed = JSON.parse(contentAfter) as Record<string, unknown>;
    expect(parsed["editor.formatOnSave"]).toBe(true);
    expect(result.tools[0].restored.length).toBeGreaterThan(0);
  });

  it("restores a deleted file", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");

    const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
    await deps.fs.deleteFile(settingsPath);

    const result = await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
    });

    expect(deps.fs.has(settingsPath)).toBe(true);
    expect(result.tools[0].restored.length).toBeGreaterThan(0);
  });

  it("keeps file when prompter returns keep", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");

    const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
    await deps.fs.writeFile(settingsPath, '{"modified": true}');

    const result = await makeRestoreUseCase(deps, new KeepPrompter()).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      interactive: true,
    });

    expect(deps.fs.getFile(settingsPath)).toBe('{"modified": true}');
    expect(result.tools[0].kept.length).toBeGreaterThan(0);
  });

  it("toolIds filter limits restore to specific tool", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "vscode");
    await installTool(deps, PROJECT_ROOT, "cursor");

    const vscodePath = join(PROJECT_ROOT, ".vscode/settings.json");
    const cursorPath = join(PROJECT_ROOT, ".cursor/settings.json");
    await deps.fs.writeFile(vscodePath, '{"modified": true}');
    await deps.fs.writeFile(cursorPath, '{"modified": true}');

    await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      toolIds: ["vscode"],
      force: true,
    });

    const vscodeContent = deps.fs.getFile(vscodePath) ?? "{}";
    const cursorContent = deps.fs.getFile(cursorPath) ?? "{}";
    const parsedVscode = JSON.parse(vscodeContent) as Record<string, unknown>;
    expect(parsedVscode["editor.formatOnSave"]).toBe(true);
    expect(cursorContent).toBe('{"modified": true}');
  });

  it("toolIds filter also scopes plugin restore — does not leak to other AI tools", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "claude");
    await installTool(deps, PROJECT_ROOT, "codex");
    await installPlugin(deps, "claude");
    await installPlugin(deps, "codex");

    const claudePluginFile = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
    const codexPluginFile = join(PROJECT_ROOT, ".codex/plugins/sample-plugin/commands/greet.md");
    await deps.fs.writeFile(claudePluginFile, "CORRUPTED CLAUDE");
    await deps.fs.writeFile(codexPluginFile, "CORRUPTED CODEX");

    await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      toolIds: ["claude"],
      force: true,
    });

    expect(deps.fs.getFile(claudePluginFile)).not.toBe("CORRUPTED CLAUDE");
    expect(deps.fs.getFile(codexPluginFile)).toBe("CORRUPTED CODEX");
  });

  it("ide restore never touches AI plugin files, scoped or unscoped", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "vscode");
    await installTool(deps, PROJECT_ROOT, "claude");
    await installPlugin(deps, "claude");

    const claudePluginFile = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
    await deps.fs.writeFile(claudePluginFile, "CORRUPTED CLAUDE");

    await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      toolIds: ["vscode"],
      force: true,
    });

    expect(deps.fs.getFile(claudePluginFile)).toBe("CORRUPTED CLAUDE");
  });

  it("unscoped restore still restores every installed AI tool's plugins (no regression)", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "claude");
    await installTool(deps, PROJECT_ROOT, "codex");
    await installPlugin(deps, "claude");
    await installPlugin(deps, "codex");

    const claudePluginFile = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
    const codexPluginFile = join(PROJECT_ROOT, ".codex/plugins/sample-plugin/commands/greet.md");
    await deps.fs.writeFile(claudePluginFile, "CORRUPTED CLAUDE");
    await deps.fs.writeFile(codexPluginFile, "CORRUPTED CODEX");

    await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
    });

    expect(deps.fs.getFile(claudePluginFile)).not.toBe("CORRUPTED CLAUDE");
    expect(deps.fs.getFile(codexPluginFile)).not.toBe("CORRUPTED CODEX");
  });

  it("does not remove untracked files in tool directory", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");

    const untrackedPath = join(PROJECT_ROOT, ".claude/rules/user-added-rule.md");
    await deps.fs.writeFile(untrackedPath, "user added content");

    await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
    });

    expect(deps.fs.has(untrackedPath)).toBe(true);
  });

  it("restores deleted files in non-interactive mode without --force", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");

    const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
    await deps.fs.deleteFile(settingsPath);

    const result = await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      interactive: false,
      force: false,
    });

    expect(deps.fs.has(settingsPath)).toBe(true);
    expect(result.tools[0].restored.length).toBeGreaterThan(0);
  });

  it("aborts in non-interactive mode when modified files exist and --force is not set", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");

    const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
    await deps.fs.writeFile(settingsPath, '{"modified": true}');

    await expect(
      makeRestoreUseCase(deps).execute({
        frameworkPath: FIXTURE_DIR,
        version: "test",
        projectRoot: PROJECT_ROOT,
        interactive: false,
        force: false,
      })
    ).rejects.toThrow("--force");
  });

  it("restores deleted files without prompting the user", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");

    const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
    await deps.fs.deleteFile(settingsPath);

    const prompter = new RecordingPrompter("overwrite");
    await makeRestoreUseCase(deps, prompter).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
    });

    const call = prompter.calls.find((c) => c.relativePath === ".vscode/settings.json");
    expect(call).toBeUndefined();
    expect(deps.fs.has(settingsPath)).toBe(true);
  });

  it("passes reason 'modified' to prompter when file is changed on disk", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");

    const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
    await deps.fs.writeFile(settingsPath, '{"modified": true}');

    const prompter = new RecordingPrompter("overwrite");
    await makeRestoreUseCase(deps, prompter).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      interactive: true,
    });

    const call = prompter.calls.find((c) => c.relativePath === ".vscode/settings.json");
    expect(call).toBeDefined();
    expect(call?.reason).toBe("modified");
  });

  describe("merge file restore", () => {
    it("reports nothing to restore when merge file keys are unmodified", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");

      const result = await makeRestoreUseCase(deps).execute({
        frameworkPath: FIXTURE_DIR,
        version: "test",
        projectRoot: PROJECT_ROOT,
      });

      const vscodeTool = result.tools.find((t) => t.toolId === "vscode");
      expect(vscodeTool?.nothingToRestore).toBe(true);
    });

    it("restores merge file when a tracked key has drifted", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");

      const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
      await deps.fs.writeFile(
        settingsPath,
        JSON.stringify({ "editor.formatOnSave": false }, null, 2)
      );

      const result = await makeRestoreUseCase(deps).execute({
        frameworkPath: FIXTURE_DIR,
        version: "test",
        projectRoot: PROJECT_ROOT,
        force: true,
      });

      const vscodeTool = result.tools.find((t) => t.toolId === "vscode");
      expect(vscodeTool?.restored).toContain(".vscode/settings.json");
    });

    it("recreates deleted merge file", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");

      const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
      await deps.fs.deleteFile(settingsPath);

      const result = await makeRestoreUseCase(deps).execute({
        frameworkPath: FIXTURE_DIR,
        version: "test",
        projectRoot: PROJECT_ROOT,
        force: true,
      });

      const vscodeTool = result.tools.find((t) => t.toolId === "vscode");
      expect(vscodeTool?.restored).toContain(".vscode/settings.json");
      expect(deps.fs.has(settingsPath)).toBe(true);
    });

    it("keeps merge file when prompter returns keep", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");

      const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
      await deps.fs.writeFile(
        settingsPath,
        JSON.stringify({ "editor.formatOnSave": false }, null, 2)
      );

      const result = await makeRestoreUseCase(deps, new KeepPrompter()).execute({
        frameworkPath: FIXTURE_DIR,
        version: "test",
        projectRoot: PROJECT_ROOT,
        interactive: true,
      });

      const vscodeTool = result.tools.find((t) => t.toolId === "vscode");
      expect(vscodeTool?.kept).toContain(".vscode/settings.json");

      const content = JSON.parse(deps.fs.getFile(settingsPath) ?? "{}") as Record<string, unknown>;
      expect(content["editor.formatOnSave"]).toBe(false);
    });

    it("throws in non-interactive mode without --force when merge file is modified", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");

      const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
      await deps.fs.writeFile(
        settingsPath,
        JSON.stringify({ "editor.formatOnSave": false }, null, 2)
      );

      await expect(
        makeRestoreUseCase(deps).execute({
          frameworkPath: FIXTURE_DIR,
          version: "test",
          projectRoot: PROJECT_ROOT,
          force: false,
          interactive: false,
        })
      ).rejects.toThrow("--force");
    });

    it("file filter skips merge files not matching the filter", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "vscode");

      const settingsPath = join(PROJECT_ROOT, ".vscode/settings.json");
      await deps.fs.writeFile(
        settingsPath,
        JSON.stringify({ "editor.formatOnSave": false }, null, 2)
      );

      const result = await makeRestoreUseCase(deps).execute({
        frameworkPath: FIXTURE_DIR,
        version: "test",
        projectRoot: PROJECT_ROOT,
        force: true,
        files: ["CLAUDE.md"],
      });

      const vscodeTool = result.tools.find((t) => t.toolId === "vscode");
      expect(vscodeTool?.nothingToRestore).toBe(true);
    });
  });
});

function withoutPluginSources(deps: Awaited<ReturnType<typeof buildUnitDeps>>): RestoreUseCase {
  return new RestoreUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.hasher,
    deps.logger,
    new FakePlatform("linux"),
    new OverwritePrompter()
  );
}

function withFetcherOnly(deps: Awaited<ReturnType<typeof buildUnitDeps>>): RestoreUseCase {
  return new RestoreUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.hasher,
    deps.logger,
    new FakePlatform("linux"),
    new OverwritePrompter(),
    deps.pluginFetcher
  );
}

async function loadedManifest(deps: Awaited<ReturnType<typeof buildUnitDeps>>): Promise<Manifest> {
  const manifest = await deps.manifestRepo.load();
  if (manifest === null) throw new Error("the project must be initialized first");
  return manifest;
}

describe("restore — consent to overwrite", () => {
  it("refuses to overwrite a modified file when neither force nor a TTY was given", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");
    await deps.fs.writeFile(join(PROJECT_ROOT, ".vscode/keybindings.json"), "[]");

    await expect(
      makeRestoreUseCase(deps).execute({
        frameworkPath: FIXTURE_DIR,
        version: "test",
        projectRoot: PROJECT_ROOT,
      })
    ).rejects.toThrow("--force");
  });
});

describe("restore — plugin sources", () => {
  const PLUGIN_FILE = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");

  async function claudeWithCorruptedPlugin() {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    await installPlugin(deps, "claude");
    await deps.fs.writeFile(PLUGIN_FILE, "CORRUPTED");
    return deps;
  }

  it("leaves plugin files alone when no plugin source is wired", async () => {
    const deps = await claudeWithCorruptedPlugin();

    const result = await withoutPluginSources(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
    });

    expect(result.totalPluginFilesRestored).toBe(0);
    expect(result.restoredPluginNames).toStrictEqual([]);
    expect(result.nativeOnlyToolIds).toStrictEqual([]);
    expect(deps.fs.getFile(PLUGIN_FILE)).toBe("CORRUPTED");
  });

  it("leaves plugin files alone when only the fetcher is wired", async () => {
    const deps = await claudeWithCorruptedPlugin();

    const result = await withFetcherOnly(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
    });

    expect(result.totalPluginFilesRestored).toBe(0);
    expect(deps.fs.getFile(PLUGIN_FILE)).toBe("CORRUPTED");
  });
});

describe("restore — persisting the manifest", () => {
  it("persists the manifest it was handed once one tool restored a file, even when another had nothing to restore", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    await installTool(deps, PROJECT_ROOT, "vscode");
    await installTool(deps, PROJECT_ROOT, "cursor");
    const handed = Manifest.fromJSON((await loadedManifest(deps)).toJSON());
    await deps.fs.writeFile(join(PROJECT_ROOT, ".vscode/keybindings.json"), "[]");

    await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
      manifest: handed,
    });

    expect(deps.manifestRepo.getCurrent()).toBe(handed);
  });

  it("does not persist anything when no file drifted", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");
    const stored = await loadedManifest(deps);
    const handed = Manifest.fromJSON(stored.toJSON());

    await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
      manifest: handed,
    });

    expect(deps.manifestRepo.getCurrent()).toBe(stored);
  });

  it("persists the manifest when only a plugin file was restored", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    await installPlugin(deps, "claude");
    const handed = Manifest.fromJSON((await loadedManifest(deps)).toJSON());
    await deps.fs.writeFile(
      join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md"),
      "CORRUPTED"
    );

    await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
      manifest: handed,
    });

    expect(deps.manifestRepo.getCurrent()).toBe(handed);
  });
});

describe("restore — totals", () => {
  it("counts the files restored and kept across a tool's sections", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");
    await deps.fs.writeFile(join(PROJECT_ROOT, ".vscode/keybindings.json"), "[]");
    await deps.fs.writeFile(join(PROJECT_ROOT, ".vscode/settings.json"), '{"editor.tabSize": 3}');
    const prompter = new ScriptedPrompter([
      ScriptedPrompter.answer.conflict("overwrite"),
      ScriptedPrompter.answer.conflict("keep"),
    ]);

    const result = await makeRestoreUseCase(deps, prompter).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      interactive: true,
    });

    expect(result.totalRestored).toBe(1);
    expect(result.totalKept).toBe(1);
    expect(result.unrestorable).toStrictEqual([]);
  });
});

describe("restore — the framework path", () => {
  it("reads only the config files the framework path actually holds", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "vscode");
    const keybindings = join(PROJECT_ROOT, ".vscode/keybindings.json");
    await deps.fs.writeFile("/partial-framework/config/vscode/keybindings.json", "[]");
    await deps.fs.deleteFile(keybindings);

    await makeRestoreUseCase(deps).execute({
      frameworkPath: "/partial-framework",
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
    });

    expect(deps.fs.getFile(keybindings)).toBe("[]");
  });
});

describe("restore — the file selection", () => {
  const RUN = ".claude/hooks/run.js";
  const OTHER = ".claude/hooks/other.js";

  async function claudeTrackingGhosts() {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    const manifest = await loadedManifest(deps);
    const ghosts = [RUN, OTHER].map(
      (relativePath) =>
        new InstallationFile({ relativePath, content: "", hash: deps.hasher.hash(relativePath) })
    );
    manifest.addTool("claude", "test", ghosts, [...manifest.getMergeFiles("claude")]);
    return deps;
  }

  async function unrestorableFor(
    deps: Awaited<ReturnType<typeof buildUnitDeps>>,
    files: string[]
  ): Promise<string[]> {
    const result = await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      projectRoot: PROJECT_ROOT,
      force: true,
      files,
    });
    return result.unrestorable;
  }

  it("admits only the file named exactly", async () => {
    const deps = await claudeTrackingGhosts();
    expect(await unrestorableFor(deps, [RUN])).toStrictEqual([RUN]);
  });

  it("admits a file when any entry of the selection names it", async () => {
    const deps = await claudeTrackingGhosts();
    expect(await unrestorableFor(deps, ["nothing.md", RUN])).toStrictEqual([RUN]);
  });

  it("admits every file under a directory named without a trailing slash", async () => {
    const deps = await claudeTrackingGhosts();
    expect(await unrestorableFor(deps, [".claude/hooks"])).toStrictEqual([RUN, OTHER]);
  });

  it("admits every file under a directory named with a trailing slash", async () => {
    const deps = await claudeTrackingGhosts();
    expect(await unrestorableFor(deps, [".claude/hooks/"])).toStrictEqual([RUN, OTHER]);
  });

  it("matches a directory only as a whole path segment", async () => {
    const deps = await claudeTrackingGhosts();
    expect(await unrestorableFor(deps, [".claude/hook"])).toStrictEqual([]);
  });

  it("treats an empty selection as no selection at all", async () => {
    const deps = await claudeTrackingGhosts();
    expect(await unrestorableFor(deps, [])).toStrictEqual([RUN, OTHER]);
  });
});
