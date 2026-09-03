import type { Manifest } from "../../../domain/models/manifest.js";
import { AIDD_DIR, DOCS_DIR } from "../../../domain/models/paths.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { GitignoreUseCase } from "./gitignore-use-case.js";

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

    await this.manifestRepo.save(manifest);
    // The run journal: who worked on what, for how long, and every file a session wrote.
    // It belongs to the repository it describes, so it must never be offered to a commit.
    await this.gitignoreUseCase.execute(projectRoot, [`${AIDD_DIR}/cache/`, `${DOCS_DIR}/runs/`]);
  }
}
