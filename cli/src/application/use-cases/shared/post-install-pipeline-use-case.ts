import type { Manifest } from "../../../domain/models/manifest.js";
import { AIDD_DIR } from "../../../domain/models/paths.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import { machineLocalFilesOf } from "../../../domain/tools/registry.js";
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
    const machineLocal = manifest
      .getInstalledToolIds()
      .flatMap((toolId) => machineLocalFilesOf(toolId));

    await this.manifestRepo.save(manifest);
    await this.gitignoreUseCase.execute(projectRoot, [
      `${AIDD_DIR}/cache/`,
      ...new Set(machineLocal),
    ]);
  }
}
