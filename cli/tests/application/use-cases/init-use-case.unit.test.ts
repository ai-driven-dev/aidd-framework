import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude.js";
import "../../../src/contexts/tools/domain/profiles/codex.js";
import "../../../src/contexts/tools/domain/profiles/copilot.js";
import "../../../src/contexts/tools/domain/profiles/cursor.js";
import "../../../src/contexts/tools/domain/profiles/opencode.js";
import "../../../src/contexts/tools/domain/profiles/vscode.js";
import { InitUseCase } from "../../../src/application/use-cases/init-use-case.js";
import type { ToolId } from "../../../src/kernel/tool.js";
import { buildUnitDeps, initProject, installTool } from "../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

describe("init", () => {
  it("creates a v5 manifest with no tools", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    const result = await new InitUseCase(deps.fs, deps.manifestRepo).execute({
      projectRoot: PROJECT_ROOT,
    });

    expect(result.manifest).not.toBeNull();

    const manifest = await deps.manifestRepo.load();
    expect(manifest).not.toBeNull();
    const tools = manifest?.getInstalledToolIds() ?? [];
    expect(tools).toHaveLength(0);
  });

  it("does not create an aidd_docs directory", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await new InitUseCase(deps.fs, deps.manifestRepo).execute({ projectRoot: PROJECT_ROOT });

    const docsFiles = deps.fs.listUnder(join(PROJECT_ROOT, "aidd_docs"));
    expect(docsFiles).toHaveLength(0);
  });

  it("does not overwrite a pre-existing user file", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    const docFile = join(PROJECT_ROOT, ".claude", "CLAUDE.md");
    await deps.fs.writeFile(docFile, "custom content");

    await new InitUseCase(deps.fs, deps.manifestRepo).execute({ projectRoot: PROJECT_ROOT });

    expect(deps.fs.getFile(docFile)).toBe("custom content");
  });

  describe("checkPreconditions", () => {
    it("passes when directory is truly empty", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await expect(
        new InitUseCase(deps.fs, deps.manifestRepo).checkPreconditions({
          projectRoot: PROJECT_ROOT,
        })
      ).resolves.toBeUndefined();
    });

    it("aborts with guidance when .claude/ contains AIDD frontmatter", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await deps.fs.writeFile(
        join(PROJECT_ROOT, ".claude", "commands", "aidd", "02", "brainstorm.md"),
        "---\nname: aidd:02:brainstorm\ndescription: test\n---\nbody"
      );

      await expect(
        new InitUseCase(deps.fs, deps.manifestRepo).checkPreconditions({
          projectRoot: PROJECT_ROOT,
        })
      ).rejects.toThrow("AIDD files detected but no manifest found");
    });

    it("passes when .claude/ exists without AIDD frontmatter", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await deps.fs.writeFile(
        join(PROJECT_ROOT, ".claude", "commands", "my-command.md"),
        "---\nname: my-command\ndescription: custom\n---\nbody"
      );

      await expect(
        new InitUseCase(deps.fs, deps.manifestRepo).checkPreconditions({
          projectRoot: PROJECT_ROOT,
        })
      ).resolves.toBeUndefined();
    });

    it("aborts when already initialized without --force", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await new InitUseCase(deps.fs, deps.manifestRepo).execute({ projectRoot: PROJECT_ROOT });
      await expect(
        new InitUseCase(deps.fs, deps.manifestRepo).checkPreconditions({
          projectRoot: PROJECT_ROOT,
        })
      ).rejects.toThrow(/Already initialized/);
    });

    it("--force: fails with guidance when no manifest exists", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await expect(
        new InitUseCase(deps.fs, deps.manifestRepo).checkPreconditions({
          projectRoot: PROJECT_ROOT,
          force: true,
        })
      ).rejects.toThrow("No AIDD manifest found");
    });

    it("--force: passes when manifest exists", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await new InitUseCase(deps.fs, deps.manifestRepo).execute({ projectRoot: PROJECT_ROOT });
      await expect(
        new InitUseCase(deps.fs, deps.manifestRepo).checkPreconditions({
          projectRoot: PROJECT_ROOT,
          force: true,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe("--force", () => {
    it("preserves existing manifest tools when --force reinitializes", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      await installTool(deps, PROJECT_ROOT, "claude" as ToolId);

      const manifestBefore = await deps.manifestRepo.load();
      const toolsBefore = manifestBefore?.getInstalledToolIds() ?? [];

      await new InitUseCase(deps.fs, deps.manifestRepo).execute({
        projectRoot: PROJECT_ROOT,
        force: true,
      });

      const manifestAfter = await deps.manifestRepo.load();
      const toolsAfter = manifestAfter?.getInstalledToolIds() ?? [];
      expect(toolsAfter).toEqual(toolsBefore);
    });
  });
});
