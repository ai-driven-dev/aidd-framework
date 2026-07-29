import { Manifest } from "../../../domain/models/manifest.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { VersionReader } from "../../../domain/ports/version-reader.js";
import type { ToolId } from "../../../domain/tools/registry.js";
import { BulkConflictState } from "../shared/resolve-update-decision-use-case.js";
import type {
  GlobalExecutionError,
  UpdateOneToolUseCase,
} from "../shared/update-one-tool-use-case.js";

export interface UpdateToolsInput<T extends ToolId> {
  toolArg?: T;
  projectRoot: string;
  userForce: boolean;
  interactive: boolean;
}

export interface UpdateToolsResult {
  updatedTools: { toolId: ToolId; fileCount: number }[];
  errors: GlobalExecutionError[];
}

/**
 * Fans out an update across every installed tool of one category (AI or IDE).
 * The category is fixed by the `isTargetToolId` predicate injected at construction,
 * so subclasses only need to supply that predicate — the orchestration is identical
 * for both categories.
 */
export class UpdateToolsUseCase<T extends ToolId> {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly versionReader: VersionReader,
    private readonly updateOneToolUseCase: UpdateOneToolUseCase,
    private readonly isTargetToolId: (id: string) => id is T
  ) {}

  async execute(input: UpdateToolsInput<T>): Promise<UpdateToolsResult> {
    const { toolArg, projectRoot, userForce, interactive } = input;
    const manifest = (await this.manifestRepo.load()) ?? Manifest.create();
    const targetIds = this.resolveTargetIds(manifest, toolArg);
    const version = this.versionReader.get();
    const errors: GlobalExecutionError[] = [];
    // Scoped to this invocation only: a fresh instance per execute() call, never a field,
    // so an "overwrite all" choice cannot leak into a later, unrelated update run.
    const bulkState = new BulkConflictState();
    const updatedTools = await this.updateTargets(
      targetIds,
      manifest,
      projectRoot,
      version,
      errors,
      {
        userForce,
        interactive,
        bulkState,
      }
    );
    return { updatedTools, errors };
  }

  private resolveTargetIds(manifest: Manifest, toolArg: T | undefined): T[] {
    if (toolArg !== undefined) return [toolArg];
    return manifest.getInstalledToolIds().filter(this.isTargetToolId);
  }

  private async updateTargets(
    targetIds: T[],
    manifest: Manifest,
    projectRoot: string,
    version: string,
    errors: GlobalExecutionError[],
    options: { userForce: boolean; interactive: boolean; bulkState: BulkConflictState }
  ): Promise<{ toolId: ToolId; fileCount: number }[]> {
    const updated: { toolId: ToolId; fileCount: number }[] = [];
    for (const toolId of targetIds) {
      const entry = await this.updateOneToolUseCase.execute(
        toolId,
        manifest,
        projectRoot,
        version,
        errors,
        options
      );
      if (entry) updated.push(entry);
    }
    return updated;
  }
}
