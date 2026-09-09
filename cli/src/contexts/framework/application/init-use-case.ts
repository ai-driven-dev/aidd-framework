import {
  AiddFilesDetectedError,
  AlreadyInitializedError,
  NoManifestError,
} from "../../../kernel/errors.js";
import { AIDD_DIR } from "../../../kernel/paths.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import { getAllRegisteredTools, hasToolSignals } from "../../tools/domain/registry.js";
import { Manifest } from "../domain/manifest.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import { GitignoreUseCase } from "./gitignore-use-case.js";

interface InitOptions {
  projectRoot: string;
  force?: boolean;
}

interface InitResult {
  manifest: Manifest;
}

export class InitUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository
  ) {}

  async checkPreconditions(options: Pick<InitOptions, "projectRoot" | "force">): Promise<void> {
    const { projectRoot, force = false } = options;
    const existing = await this.manifestRepo.load();

    if (force) {
      if (existing === null) {
        throw new NoManifestError();
      }
      return;
    }

    if (existing !== null) {
      throw new AlreadyInitializedError(
        `Already initialized. Run \`aidd clean --force\` then \`aidd setup\` to reset completely.`
      );
    }

    if (await this.hasAiddSignals(projectRoot)) {
      throw new AiddFilesDetectedError();
    }
  }

  private async hasAiddSignals(projectRoot: string): Promise<boolean> {
    for (const tool of getAllRegisteredTools().values()) {
      if ((await hasToolSignals(this.fs, tool, projectRoot)).length > 0) return true;
    }
    return false;
  }

  async execute(options: InitOptions): Promise<InitResult> {
    const { projectRoot, force = false } = options;

    const existing = await this.manifestRepo.load();
    await this.checkPreconditions({ projectRoot, force });

    const manifest = force && existing !== null ? existing : Manifest.create();
    await this.persistInit(manifest, projectRoot, force);
    return { manifest };
  }

  private async persistInit(
    manifest: Manifest,
    projectRoot: string,
    force: boolean
  ): Promise<void> {
    await this.manifestRepo.save(manifest);
    if (!force) {
      await new GitignoreUseCase(this.fs).execute(projectRoot, [`${AIDD_DIR}/cache/`]);
    }
  }
}
