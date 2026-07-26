import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RestoreUseCase } from "../../../src/application/use-cases/restore/restore-use-case.js";
import {
  buildUnitDeps,
  FIXTURE_DIR,
  initAndInstall,
  initProject,
  installTool,
} from "../../helpers/ports/build-unit-deps.js";
import { FakePlatform } from "../../helpers/ports/fake-platform.js";
import { KeepPrompter, OverwritePrompter } from "../../helpers/ports/scripted-prompter.js";

const PROJECT_ROOT = "/test-project";

/** RecordingPrompter for tracking resolveConflict calls */
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
        docsDir: "aidd_docs",
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
      docsDir: "aidd_docs",
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
      docsDir: "aidd_docs",
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
      docsDir: "aidd_docs",
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
      docsDir: "aidd_docs",
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
      docsDir: "aidd_docs",
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

  it("does not remove untracked files in tool directory", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");

    const untrackedPath = join(PROJECT_ROOT, ".claude/rules/user-added-rule.md");
    await deps.fs.writeFile(untrackedPath, "user added content");

    await makeRestoreUseCase(deps).execute({
      frameworkPath: FIXTURE_DIR,
      version: "test",
      docsDir: "aidd_docs",
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
      docsDir: "aidd_docs",
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
        docsDir: "aidd_docs",
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
      docsDir: "aidd_docs",
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
      docsDir: "aidd_docs",
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
        docsDir: "aidd_docs",
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
        docsDir: "aidd_docs",
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
        docsDir: "aidd_docs",
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
        docsDir: "aidd_docs",
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
          docsDir: "aidd_docs",
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
        docsDir: "aidd_docs",
        projectRoot: PROJECT_ROOT,
        force: true,
        files: ["CLAUDE.md"],
      });

      const vscodeTool = result.tools.find((t) => t.toolId === "vscode");
      expect(vscodeTool?.nothingToRestore).toBe(true);
    });
  });
});
