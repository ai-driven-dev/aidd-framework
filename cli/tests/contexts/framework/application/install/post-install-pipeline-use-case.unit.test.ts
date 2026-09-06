import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GitignoreUseCase } from "../../../../../src/contexts/framework/application/gitignore-use-case.js";
import { PostInstallPipelineUseCase } from "../../../../../src/contexts/framework/application/install/post-install-pipeline-use-case.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

/** Records every `execute` call so a test can assert the pipeline batches its gitignore
 * entries into one call instead of writing the same file twice. */
class RecordingGitignoreUseCase extends GitignoreUseCase {
  readonly calls: string[][] = [];

  override async execute(projectRoot: string, entries: string[]): Promise<boolean> {
    this.calls.push(entries);
    return super.execute(projectRoot, entries);
  }
}

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

  it("calls gitignore exactly once, with all three families of entries", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    const manifest = await deps.manifestRepo.load();
    if (manifest === null) throw new Error("manifest not found");

    const recordingGitignore = new RecordingGitignoreUseCase(deps.fs);
    await new PostInstallPipelineUseCase(deps.manifestRepo, recordingGitignore).execute({
      projectRoot: PROJECT_ROOT,
      manifest,
    });

    expect(recordingGitignore.calls).toHaveLength(1);
    expect(recordingGitignore.calls[0]).toEqual(
      expect.arrayContaining([".aidd/cache/", "aidd_docs/runs/", ".claude/settings.local.json"])
    );
  });

  it("ignores the run journal, and nothing wider", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude");
    const manifest = await deps.manifestRepo.load();
    if (manifest === null) throw new Error("manifest not found");

    await new PostInstallPipelineUseCase(deps.manifestRepo, deps.gitignoreUseCase).execute({
      projectRoot: PROJECT_ROOT,
      manifest,
    });

    const gitignoreContent = deps.fs.getFile(join(PROJECT_ROOT, ".gitignore")) ?? "";
    expect(gitignoreContent).toContain("aidd_docs/runs/");
    expect(gitignoreContent).not.toContain("aidd_docs/*");
    expect(gitignoreContent).not.toMatch(/^aidd_docs\/$/mu);
  });
});
