import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ide/vscode.js";
import { CleanUseCase } from "../../../src/application/use-cases/clean-use-case.js";
import type { ToolId } from "../../../src/domain/models/tool-ids.js";
import { buildUnitDeps, initAndInstall } from "../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

describe("clean", () => {
  it("with force removes .aidd/cache/ entry from .gitignore", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    await deps.fs.writeFile(gitignorePath, "node_modules/\n.aidd/cache/\ndist/\n");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    const content = deps.fs.getFile(gitignorePath);
    expect(content).not.toContain(".aidd/cache/");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
  });

  it("with force leaves .gitignore unchanged when entry absent", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    await deps.fs.writeFile(gitignorePath, "node_modules/\n");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    const content = deps.fs.getFile(gitignorePath);
    expect(content).toBe("node_modules/\n");
  });

  it("preserves untracked user files", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const userFile = join(PROJECT_ROOT, "my-custom-file.txt");
    await deps.fs.writeFile(userFile, "user content");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(userFile)).toBe(true);
  });
});
