import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PostInstallPipelineUseCase } from "../../../../../src/contexts/framework/application/install/post-install-pipeline-use-case.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

describe("post-install pipeline", () => {
  it("saves manifest and updates gitignore after file write", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");

    const manifest = await deps.manifestRepo.load();
    if (manifest === null) throw new Error("manifest not found");

    await new PostInstallPipelineUseCase(deps.manifestRepo, deps.gitignoreUseCase).execute({
      projectRoot: PROJECT_ROOT,
      manifest,
    });

    // manifest saved
    const reloaded = await deps.manifestRepo.load();
    expect(reloaded).not.toBeNull();

    // gitignore updated
    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    expect(deps.fs.has(gitignorePath)).toBe(true);
    const gitignoreContent = deps.fs.getFile(gitignorePath) ?? "";
    expect(gitignoreContent).toContain(".aidd/cache/");
  });
});
