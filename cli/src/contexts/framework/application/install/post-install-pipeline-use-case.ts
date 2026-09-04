import { AIDD_DIR, DOCS_DIR } from "../../../../kernel/paths.js";
import { machineLocalFilesOf } from "../../../tools/domain/registry.js";
import type { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { GitignoreUseCase } from "../gitignore-use-case.js";

interface PostInstallPipelineOptions {
  projectRoot: string;
  manifest: Manifest;
}

export class PostInstallPipelineUseCase {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly gitignoreUseCase: GitignoreUseCase
  ) {}

  async execute(options: PostInstallPipelineOptions): Promise<void> {
    const { projectRoot, manifest } = options;
    const machineLocal = manifest
      .getInstalledToolIds()
      .flatMap((toolId) => machineLocalFilesOf(toolId));

    await this.manifestRepo.save(manifest);
    await this.gitignoreUseCase.execute(projectRoot, [
      `${AIDD_DIR}/cache/`,
      ...new Set(machineLocal),
    ]);
    // The run journal: who worked on what, for how long, and every file a session wrote.
    // It belongs to the repository it describes, so it must never be offered to a commit.
    await this.gitignoreUseCase.execute(projectRoot, [`${AIDD_DIR}/cache/`, `${DOCS_DIR}/runs/`]);
  }
}
