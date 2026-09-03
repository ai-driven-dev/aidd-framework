import { NoManifestError, ToolNotInstalledError } from "../../../../kernel/errors.js";
import type { IdeToolId } from "../../../../kernel/tool.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { UninstallToolsUseCase } from "./uninstall-tools-use-case.js";

export interface UninstallIdeOptions {
  toolId: IdeToolId;
  projectRoot: string;
}

export interface UninstallIdeResult {
  toolId: IdeToolId;
  fileCount: number;
  deletedFiles: string[];
}

export class UninstallIdeUseCase {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly uninstallTools: UninstallToolsUseCase
  ) {}

  async execute(options: UninstallIdeOptions): Promise<UninstallIdeResult> {
    const { toolId, projectRoot } = options;
    const manifest = await this.manifestRepo.load();
    if (manifest === null) throw new NoManifestError();
    if (!manifest.hasTool(toolId)) throw new ToolNotInstalledError(toolId);
    const [result] = await this.uninstallTools.execute({
      toolIds: [toolId],
      manifest,
      projectRoot,
    });
    await this.manifestRepo.save(manifest);
    return { toolId, fileCount: result?.fileCount ?? 0, deletedFiles: result?.deletedFiles ?? [] };
  }
}
