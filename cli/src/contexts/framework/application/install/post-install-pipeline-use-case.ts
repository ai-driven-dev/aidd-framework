import type { Manifest } from "../../domain/manifest.js";
import { aiddGitignoreEntries } from "../../domain/manifest-gitignore-entries.js";
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
    await this.manifestRepo.save(manifest);
    // One call for everything this CLI's own writes require ignored: the plugin cache, the run
    // journal (which belongs to the repository it describes, never to a commit), and each installed
    // tool's machine-local file.
    await this.gitignoreUseCase.execute(projectRoot, aiddGitignoreEntries(manifest));
  }
}
